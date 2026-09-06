"""
Exploratory: does rainfall precede mushroom posts?

    python analyze_fruiting.py --posts posts.csv

Design is matched case-control, because the posts are spread over ~100 km and
789 distinct locations — a single regional rainfall series would average away
exactly the signal being looked for.

  case     a (cell, day) where somebody posted
  control  the SAME cell on other days in the same window

For each lag k (0-21 days) it compares mean rainfall on day-k before cases
against the same for controls. Matching on cell removes "some places are wetter
than others"; restricting controls to the same window removes "some months are
wetter than others".

READ THIS BEFORE BELIEVING ANY RESULT
-------------------------------------
A post is not a fruiting body. It is somebody choosing to go out, find
something, photograph it and upload it. That behaviour correlates with weather
directly and in the opposite direction — people do not forage in the rain — so
a naive positive result at short lags is more likely to be about foraging
comfort than mycology.

Two diagnostics are printed for exactly that reason: the day-of-week
distribution (weekend effects are behaviour, not biology) and same-day rainfall
(if cases are DRIER than controls on day 0, the avoidance effect is real and
present in this data).

The dataset is also one season — May-August 2026, 90% of it June-July — so
season and rainfall cannot be separated. Nothing here can distinguish "rain
causes fruiting" from "July is both wet and mushroomy".
"""

from __future__ import annotations

import argparse
import csv
import os
import random
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from precip_extract import decode_cells, lonlat_to_cell, GRID_W, BANDS  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

JST = timezone(timedelta(hours=9))
MAX_LAG = 21
N_CONTROLS = 20          # control days sampled per case
BOOTSTRAP = 2000

# Band index -> representative mm/h. The midpoint of each interval, with the
# open-ended top band pinned at its lower bound. Using a single number here is a
# simplification the rest of the pipeline deliberately avoids; it is acceptable
# only because this is a comparison of means between two groups drawn from the
# same distribution, where the bias cancels.
BAND_MID = {}
for b in BANDS:
    hi = b["upper"] if b["upper"] is not None else b["lower"]
    BAND_MID[b["band"]] = (b["lower"] + hi) / 2.0


def load_posts(path: Path):
    posts = []
    for row in csv.reader(open(path)):
        if len(row) < 4:
            continue
        try:
            lat, lon = float(row[1]), float(row[2])
            taken = datetime.strptime(row[3], "%Y-%m-%d %H:%M")
        except ValueError:
            continue
        cell = lonlat_to_cell(lon, lat)
        if cell is None:
            continue
        posts.append({"id": row[0], "cell": cell, "date": taken.date(), "taken": taken})
    return posts


def build_rainfall(conn, cells: set, date_from, date_to) -> dict:
    """(cell_index, date) -> mm for that JST day, for the cells we care about."""
    idxs = sorted({j * GRID_W + i for (i, j) in cells})
    idx_arr = np.array(idxs)
    daily = defaultdict(float)

    with conn.cursor(name="precip_stream") as cur:
        cur.itersize = 500
        cur.execute(
            "SELECT observed_at, cells FROM precip_snapshots "
            "WHERE observed_at >= %s AND observed_at < %s ORDER BY observed_at",
            (datetime.combine(date_from, datetime.min.time()) - timedelta(hours=9),
             datetime.combine(date_to, datetime.min.time()) + timedelta(days=1)),
        )
        n = 0
        for observed_at, blob in cur:
            grid = decode_cells(bytes(blob))
            day = (observed_at + timedelta(hours=9)).date()   # JST day
            bands = grid[idx_arr]
            for k, band in zip(idxs, bands.tolist()):
                mm = BAND_MID.get(band)
                if mm:                      # band 0 -> 0.0, masked -> absent
                    daily[(k, day)] += mm   # mm/h x 1h
            n += 1
    print(f"  decoded {n:,} snapshots over {len(idxs):,} distinct cells")
    return daily


def series_for(daily, idx, day, lag):
    return daily.get((idx, day - timedelta(days=lag)), 0.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--posts", required=True)
    ap.add_argument("--controls", type=int, default=N_CONTROLS)
    ap.add_argument("--ignore-weekday", action="store_true",
                    help="drop weekday matching (tests whether 7/14/21 bumps are an artifact of it)")
    ap.add_argument("--match-days", type=int, default=21,
                    help="controls must fall within +/- this many days of the case")
    args = ap.parse_args()
    rng = random.Random(20260831)

    posts = load_posts(Path(args.posts))
    if not posts:
        sys.exit("no usable posts")
    dates = [p["date"] for p in posts]
    lo, hi = min(dates), max(dates)
    print(f"{len(posts)} posts, {lo} .. {hi}")

    # --- diagnostic 1: is this behaviour? ------------------------------------
    dow = Counter(p["date"].strftime("%a") for p in posts)
    order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    total = sum(dow.values())
    print("\nday of week (expected 14.3% each if behaviour-neutral):")
    for d in order:
        pct = 100 * dow[d] / total
        print(f"  {d} {dow[d]:>4}  {pct:5.1f}%  {'#' * round(pct)}")

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cells = {p["cell"] for p in posts}
    daily = build_rainfall(conn, cells, lo - timedelta(days=MAX_LAG + 1), hi)
    conn.close()

    # --- controls: same cell, other days in the same window ------------------
    # Controls are matched on cell, on DAY OF WEEK, and to within +/- MATCH_DAYS
    # of the case.
    #
    # The unmatched version of this (controls drawn from anywhere in the season)
    # produced every one of 22 lags positive and significant, which is not a
    # fruiting signal — it is the observation that post days fall in wetter
    # weeks, inherited by every lag because rainfall is autocorrelated over that
    # timescale. Matching locally removes the seasonal drift; matching on weekday
    # removes the Saturday-vs-Monday behaviour visible above. What survives is
    # the question actually being asked: given the time of year and the day of
    # the week, was the run-up to a posting day wetter than the run-up to a
    # comparable non-posting day?
    cases, controls = [], []
    skipped = 0
    for p in posts:
        idx = p["cell"][1] * GRID_W + p["cell"][0]
        cases.append([series_for(daily, idx, p["date"], k) for k in range(MAX_LAG + 1)])

        pool = [
            p["date"] + timedelta(days=d)
            for d in range(-args.match_days, args.match_days + 1)
            if d != 0
            and (args.ignore_weekday or d % 7 == 0)          # same weekday unless disabled
            and lo <= p["date"] + timedelta(days=d) <= hi
        ]
        if not pool:
            skipped += 1
            continue
        for _ in range(args.controls):
            d = rng.choice(pool)
            controls.append([series_for(daily, idx, d, k) for k in range(MAX_LAG + 1)])
    if skipped:
        print(f"  ({skipped} cases had no matchable control day and contribute none)")

    A = np.array(cases)        # (n_posts, lags)
    B = np.array(controls)     # (n_posts*controls, lags)

    print(f"\n{A.shape[0]} cases vs {B.shape[0]} controls, matched on cell + weekday + \u00b1{args.match_days}d")
    print("\nmean rainfall (mm) on the day N days before:")
    print(f"{'lag':>4} {'cases':>8} {'controls':>9} {'diff':>8} {'ratio':>7}  bootstrap 95% CI of diff")

    for k in range(MAX_LAG + 1):
        a, b = A[:, k], B[:, k]
        diff = a.mean() - b.mean()
        # bootstrap the difference of means; no distributional assumption
        boot = np.empty(BOOTSTRAP)
        na, nb = len(a), len(b)
        for t in range(BOOTSTRAP):
            boot[t] = a[np.random.randint(0, na, na)].mean() - b[np.random.randint(0, nb, nb)].mean()
        cl, ch = np.percentile(boot, [2.5, 97.5])
        sig = "*" if (cl > 0 or ch < 0) else " "
        ratio = a.mean() / b.mean() if b.mean() > 0 else float("nan")
        print(f"{k:>4} {a.mean():>8.2f} {b.mean():>9.2f} {diff:>+8.2f} {ratio:>7.2f}  "
              f"[{cl:+.2f}, {ch:+.2f}] {sig}")

    print("\n* = 95% CI excludes zero. With 22 lags tested, expect ~1 false positive by chance.")
    print("Same-day (lag 0) is the behaviour check: cases drier than controls means")
    print("people avoid foraging in rain, and that confound is present in this data.")


if __name__ == "__main__":
    main()
