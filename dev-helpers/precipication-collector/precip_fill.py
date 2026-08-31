"""
Fill precip_grids / precip_snapshots from radar images.

    python precip_fill.py backfill images/            # ingest a directory
    python precip_fill.py one images/precip-43-20250830-15.jpg
    python precip_fill.py fetch --hours 72            # download + ingest (cron)
    python precip_fill.py status                      # what is stored

DDL is owned by Prisma, not by this script. Every table, column and index comes
from a Prisma migration; this only ever INSERTs and SELECTs. Creating anything
here would show up as drift and `prisma migrate dev` would offer to drop it.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
from psycopg2.extras import Json, execute_values
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from precip_extract import (  # noqa: E402
    extract_file, encode_cells, grid_spec, GRID_W, GRID_H,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

JST = timezone(timedelta(hours=9))

FILENAME_RE = re.compile(r"^precip-43-(\d{4})(\d{2})(\d{2})-(\d{2})\.jpg$")


def observed_at_from_filename(name: str) -> datetime | None:
    """
    precip-43-YYYYMMDD-HH.jpg -> naive UTC datetime.

    The filename hour is JST -- it matches both the archive URL path and the
    caption painted into the image. `observed_at` is TIMESTAMP(3) *without* time
    zone and Prisma reads it as UTC, so what goes in must be naive UTC. Writing
    naive JST instead would shift every row by nine hours and nothing would
    complain; the queries would just quietly return the wrong hour's rain.
    """
    m = FILENAME_RE.match(os.path.basename(name))
    if not m:
        return None
    y, mo, d, h = (int(g) for g in m.groups())
    return datetime(y, mo, d, h, tzinfo=JST).astimezone(timezone.utc).replace(tzinfo=None)


def connect():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (expected in the repo root .env)")
    return psycopg2.connect(url)


def ensure_grid(conn) -> int:
    """
    The precip_grids row matching the current spec, created on first use.

    Matched on every field that changes how a stored blob is read, so a spec
    change produces a new row rather than silently reinterpreting old snapshots.
    """
    spec = grid_spec()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id FROM precip_grids
             WHERE source = %(source)s
               AND lon_px = %(lon_px)s AND lon_py = %(lon_py)s AND lon_c = %(lon_c)s
               AND lat_px = %(lat_px)s AND lat_py = %(lat_py)s AND lat_c = %(lat_c)s
               AND block_size = %(block_size)s
               AND width = %(width)s AND height = %(height)s
             ORDER BY id DESC LIMIT 1
            """,
            spec,
        )
        row = cur.fetchone()
        if row:
            return row[0]

        cur.execute(
            """
            INSERT INTO precip_grids
                (source, lon_px, lon_py, lon_c, lat_px, lat_py, lat_c,
                 block_size, width, height, bands)
            VALUES
                (%(source)s, %(lon_px)s, %(lon_py)s, %(lon_c)s,
                 %(lat_px)s, %(lat_py)s, %(lat_c)s,
                 %(block_size)s, %(width)s, %(height)s, %(bands)s)
            RETURNING id
            """,
            {**spec, "bands": Json(spec["bands"])},
        )
        grid_id = cur.fetchone()[0]
    conn.commit()
    print(f"Created precip_grids id={grid_id} ({spec['width']}x{spec['height']}, block {spec['block_size']})")
    return grid_id


def ingest_file(conn, grid_id: int, path: Path, observed_at: datetime) -> dict:
    raw = path.read_bytes()
    sha256 = hashlib.sha256(raw).hexdigest()

    grid, max_band, echo_cells = extract_file(str(path))
    cells = encode_cells(grid)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO precip_snapshots
                (grid_id, observed_at, cells, max_band, echo_cells, image_sha256)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (grid_id, observed_at) DO UPDATE SET
                cells        = EXCLUDED.cells,
                max_band     = EXCLUDED.max_band,
                echo_cells   = EXCLUDED.echo_cells,
                image_sha256 = EXCLUDED.image_sha256,
                fetched_at   = CURRENT_TIMESTAMP
            """,
            (grid_id, observed_at, psycopg2.Binary(cells), max_band, echo_cells, sha256),
        )
    return {"max_band": max_band, "echo_cells": echo_cells, "bytes": len(cells)}


def cmd_backfill(conn, directory: Path, commit_every: int = 200) -> None:
    files = sorted(f for f in os.listdir(directory) if observed_at_from_filename(f))
    if not files:
        sys.exit(f"No precip-43-YYYYMMDD-HH.jpg files in {directory}")

    grid_id = ensure_grid(conn)
    print(f"Ingesting {len(files):,} snapshots from {directory} ...")

    ok = failed = total_bytes = 0
    t0 = time.time()
    for n, f in enumerate(files, 1):
        observed_at = observed_at_from_filename(f)
        try:
            r = ingest_file(conn, grid_id, directory / f, observed_at)
            ok += 1
            total_bytes += r["bytes"]
        except Exception as exc:  # noqa: BLE001 - one bad image must not end the run
            failed += 1
            conn.rollback()
            print(f"  {f}: {exc}")

        # Commit in batches: one transaction for 14k rows would hold locks for
        # the whole run and lose everything on a single failure.
        if n % commit_every == 0:
            conn.commit()
        if n % 500 == 0 or n == len(files):
            elapsed = time.time() - t0
            rate = n / elapsed if elapsed else 0
            eta = (len(files) - n) / rate if rate else 0
            print(
                f"  [{n}/{len(files)}] ok={ok} failed={failed} "
                f"stored={total_bytes/1e6:.1f}MB {rate:.1f}/s eta {eta/60:.0f}m"
            )
    conn.commit()
    print(f"\nDone: {ok} ingested, {failed} failed, {total_bytes/1e6:.1f} MB of grids.")


def cmd_one(conn, path: Path) -> None:
    observed_at = observed_at_from_filename(path.name)
    if observed_at is None:
        sys.exit(f"{path.name} does not match precip-43-YYYYMMDD-HH.jpg")
    grid_id = ensure_grid(conn)
    r = ingest_file(conn, grid_id, path, observed_at)
    conn.commit()
    print(f"{path.name} -> observed_at={observed_at}Z max_band={r['max_band']} "
          f"echo={r['echo_cells']} {r['bytes']}B")


# ---------------------------------------------------------------------------
# fetch -- the cron entry point
# ---------------------------------------------------------------------------

ARCHIVE_URL = (
    "https://storage.tenki.jp/archive/radar/"
    "{y:04d}/{m:02d}/{d:02d}/{h:02d}/00/00/pref-43-large.jpg"
)

# tenki.jp publishes on the hour only: minute 00 returns 200, and 05/10/15/30
# all 404. Hourly is the archive's real resolution, not a sampling choice.
FETCH_DELAY_S = 0.5
FETCH_TIMEOUT_S = 30
USER_AGENT = "mycologs-precip/1.0 (+https://www.mycologs.club)"


def utc_to_jst_parts(t: datetime) -> tuple[int, int, int, int]:
    """Naive UTC datetime -> the JST calendar hour it falls in."""
    j = t.replace(tzinfo=timezone.utc).astimezone(JST)
    return j.year, j.month, j.day, j.hour


def cmd_fetch(conn, hours: int, images_dir: Path, delay: float = FETCH_DELAY_S) -> None:
    """
    Download and ingest every hour in the last N that is not already stored.

    Scanning a window rather than only the previous hour is what makes a missed
    run self-healing: a reboot, a network blip or a stopped container repairs
    itself on the next tick with nobody watching. It also means one command
    closes an arbitrarily large gap -- pass a big --hours after an outage.

    Downloaded images are KEPT, not discarded. They are the only thing that
    allows the grids to be re-derived when the colour table improves, and the
    upstream archive is someone else's and may not keep them forever. ~620 MB a
    year.
    """
    import requests  # local import: only the fetch path needs it

    images_dir.mkdir(parents=True, exist_ok=True)
    grid_id = ensure_grid(conn)

    # The current hour's image may not be published yet, so start at the previous
    # one. Truncate to the hour to match how observed_at is stored.
    # Naive UTC, to match how observed_at is stored (TIMESTAMP without zone).
    now_hour = datetime.now(timezone.utc).replace(tzinfo=None, minute=0, second=0, microsecond=0)
    wanted = [now_hour - timedelta(hours=k) for k in range(1, hours + 1)]

    with conn.cursor() as cur:
        cur.execute(
            "SELECT observed_at FROM precip_snapshots WHERE grid_id = %s AND observed_at = ANY(%s)",
            (grid_id, wanted),
        )
        have = {r[0] for r in cur.fetchall()}

    missing = sorted(t for t in wanted if t not in have)
    if not missing:
        print(f"Up to date: all {hours} of the last hours already stored.")
        return
    print(f"{len(missing)} of the last {hours} hours missing; fetching ...")

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    ok = not_found = failed = 0

    for observed_at in missing:
        y, m, d, h = utc_to_jst_parts(observed_at)
        stamp = f"{y}-{m:02d}-{d:02d} {h:02d}:00 JST"
        path = images_dir / f"precip-43-{y:04d}{m:02d}{d:02d}-{h:02d}.jpg"
        downloaded = False

        try:
            # An image already on disk is ingested without re-downloading, so a
            # re-run after a failed ingest costs the archive nothing.
            if not (path.exists() and path.stat().st_size > 0):
                resp = session.get(ARCHIVE_URL.format(y=y, m=m, d=d, h=h), timeout=FETCH_TIMEOUT_S)
                if resp.status_code == 404:
                    # Genuine upstream gaps exist -- the original download log
                    # shows 20 in 14,040 hours. Absent, not an error.
                    not_found += 1
                    print(f"  {stamp} — not published (404)")
                    continue
                resp.raise_for_status()
                path.write_bytes(resp.content)
                downloaded = True

            r = ingest_file(conn, grid_id, path, observed_at)
            conn.commit()
            ok += 1
            print(f"  {stamp} — max_band={r['max_band']} echo={r['echo_cells']} "
                  f"{r['bytes']}B{'' if downloaded else ' (from disk)'}")
        except Exception as exc:  # noqa: BLE001 - one bad hour must not end the run
            conn.rollback()
            failed += 1
            print(f"  {stamp} — {exc}")

        if downloaded:
            time.sleep(delay)  # someone else's bandwidth

    print(f"\nFetched {ok}, absent upstream {not_found}, failed {failed}.")
    if failed:
        sys.exit(1)


def cmd_status(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("SELECT id, source, width, height, block_size FROM precip_grids ORDER BY id")
        grids = cur.fetchall()
        for gid, source, w, h, bs in grids:
            cur.execute(
                """
                SELECT count(*), min(observed_at), max(observed_at),
                       pg_size_pretty(sum(length(cells))::bigint), max(max_band)
                  FROM precip_snapshots WHERE grid_id = %s
                """,
                (gid,),
            )
            n, lo, hi, size, mx = cur.fetchone()
            print(f"grid {gid}  {source}  {w}x{h} block {bs}")
            print(f"  {n:,} snapshots   {lo} .. {hi} UTC   {size}   max band seen {mx}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("backfill"); p.add_argument("directory")
    p = sub.add_parser("one"); p.add_argument("path")
    p = sub.add_parser("fetch")
    p.add_argument("--hours", type=int, default=72,
                   help="how far back to scan for gaps (default 72)")
    p.add_argument("--images-dir", default=str(Path(__file__).resolve().parent / "images"),
                   help="where downloaded JPEGs are kept")
    sub.add_parser("status")
    args = ap.parse_args()

    conn = connect()
    try:
        if args.cmd == "backfill":
            cmd_backfill(conn, Path(args.directory))
        elif args.cmd == "one":
            cmd_one(conn, Path(args.path))
        elif args.cmd == "fetch":
            cmd_fetch(conn, args.hours, Path(args.images_dir))
        else:
            cmd_status(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
