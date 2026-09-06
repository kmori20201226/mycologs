"""
Prove that Python and TypeScript read the same stored bytes identically.

    python verify_conformance.py [--snapshots N]

Extraction lives in precip_extract.py and nowhere else, so the two languages
cannot disagree about turning an image into a grid. But *interpretation* is
necessarily duplicated: both sides inflate the blob, unpack four bits per cell,
push lon/lat through the affine, and look up a band's mm/h interval. Duplicated
logic drifts, and this particular drift would be silent — the same stored bytes
would mean different rain depending on which language asked.

So this runs both implementations over the same snapshots and the same points
and compares every field. Run it after touching either side.

The point set deliberately includes the awkward cases, not just easy ones:
a cell with known heavy rain, a cell under the masked legend box, cells at the
grid's exact corners, and coordinates outside the image entirely (both sides
must return null, not a clamped edge cell).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from precip_extract import (  # noqa: E402
    decode_cells, lonlat_to_cell, read_cell, band_range, cell_to_lonlat,
    GRID_W, GRID_H, BLOCK, AFFINE,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

READER_TS = REPO_ROOT / "scripts" / "precip-conformance-reader.ts"


def _corner(i: int, j: int) -> tuple[float, float]:
    return cell_to_lonlat(i, j)


def build_points() -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = [
        (130.80546, 33.66280),   # verified 20-30 mm/h core of 2025-08-30 15:00 JST
        (130.79403, 33.66283),   # the 15-20 mm/h cell beside it
        (131.45,    33.20),      # under the legend box -> masked, not zero
        (130.4017,  33.5904),    # Fukuoka city
        (130.8752,  33.8833),    # Kitakyushu
        (130.9425,  33.4783),    # the border-line cell that the abstain rule fixed
    ]
    # exact grid corners — off-by-one territory
    pts += [_corner(0, 0), _corner(GRID_W - 1, 0), _corner(0, GRID_H - 1), _corner(GRID_W - 1, GRID_H - 1)]
    # outside the image on every side: both sides must return null
    pts += [(AFFINE["lon_c"] - 1.0, 33.5), (AFFINE["lon_c"] + 5.0, 33.5),
            (130.5, AFFINE["lat_c"] + 1.0), (130.5, AFFINE["lat_c"] - 5.0)]
    return pts


def python_side(conn, snapshot_ids: list[int], points) -> list[dict]:
    out = []
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, cells FROM precip_snapshots WHERE id = ANY(%s) ORDER BY id",
            (snapshot_ids,),
        )
        rows = cur.fetchall()
    for sid, blob in rows:
        grid = decode_cells(bytes(blob))
        for lon, lat in points:
            cell = lonlat_to_cell(lon, lat)
            if cell is None:
                out.append({"id": sid, "lon": lon, "lat": lat, "cell": None,
                            "band": None, "lower": None, "upper": None})
                continue
            band = read_cell(grid, cell)
            rng = band_range(band)
            c_lon, c_lat = cell_to_lonlat(*cell)
            out.append({
                "id": sid, "lon": lon, "lat": lat,
                "cell": [cell[0], cell[1]],
                "centre": [round(c_lon, 6), round(c_lat, 6)],
                "band": band,
                "lower": None if rng is None else rng["lower"],
                "upper": None if rng is None else rng["upper"],
            })
    return out


def node_side(snapshot_ids: list[int], points) -> list[dict]:
    payload = json.dumps({"snapshotIds": snapshot_ids, "points": [list(p) for p in points]})
    with tempfile.NamedTemporaryFile("r", suffix=".json", delete=False) as fh:
        out_path = fh.name
    try:
        proc = subprocess.run(
            ["npx", "ts-node", str(READER_TS), out_path],
            input=payload, capture_output=True, text=True, cwd=str(REPO_ROOT),
        )
        if proc.returncode != 0:
            sys.exit(f"node reader failed:\n{proc.stderr[-2000:]}\n{proc.stdout[-1000:]}")
        return json.loads(Path(out_path).read_text())
    finally:
        os.unlink(out_path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshots", type=int, default=25)
    args = ap.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    with conn.cursor() as cur:
        # Deterministic spread across the whole archive rather than a random
        # sample, so a failure is reproducible.
        cur.execute(
            "SELECT id FROM precip_snapshots ORDER BY observed_at "
            "OFFSET 0 ROWS FETCH FIRST %s ROWS ONLY", (0,))
        cur.execute("SELECT count(*) FROM precip_snapshots")
        total = cur.fetchone()[0]
        step = max(1, total // args.snapshots)
        cur.execute(
            "SELECT id FROM (SELECT id, row_number() OVER (ORDER BY observed_at) AS rn "
            "FROM precip_snapshots) t WHERE rn %% %s = 0 ORDER BY id LIMIT %s",
            (step, args.snapshots),
        )
        ids = [r[0] for r in cur.fetchall()]

    points = build_points()
    print(f"comparing {len(ids)} snapshots x {len(points)} points = {len(ids)*len(points)} readings")

    py = python_side(conn, ids, points)
    conn.close()
    ts = node_side(ids, points)

    if len(py) != len(ts):
        sys.exit(f"FAIL: record count differs — python {len(py)}, node {len(ts)}")

    mismatches = []
    for a, b in zip(py, ts):
        for k in ("id", "cell", "band", "lower", "upper", "centre"):
            if a.get(k) != b.get(k):
                mismatches.append((a["id"], a["lon"], a["lat"], k, a.get(k), b.get(k)))

    checked = len(py)
    outside = sum(1 for r in py if r["cell"] is None)
    masked = sum(1 for r in py if r["band"] == 15)
    wet = sum(1 for r in py if isinstance(r["band"], int) and 1 <= r["band"] <= 14)

    print(f"  outside the image : {outside}   (both sides must return null)")
    print(f"  masked cells      : {masked}")
    print(f"  cells with echo   : {wet}")
    if mismatches:
        print(f"\nFAIL: {len(mismatches)} field mismatches of {checked} readings")
        for m in mismatches[:15]:
            print(f"  snapshot {m[0]} at ({m[1]}, {m[2]}) field {m[3]}: python={m[4]!r} node={m[5]!r}")
        sys.exit(1)
    print(f"\nPASS: all {checked} readings identical across Python and TypeScript")


if __name__ == "__main__":
    main()
