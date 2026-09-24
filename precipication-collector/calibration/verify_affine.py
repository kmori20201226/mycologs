#!/usr/bin/env python3
"""
Check a prefecture's affine three ways that the fit itself cannot fake.

    python verify_affine.py --pref 47 --ref 43 --landmarks landmarks-pref-47.tsv

Whatever produced an affine — landmarks or auto_affine.py — optimised something.
Reporting that the thing it optimised came out well proves nothing. These three
checks are chosen because none of them is the objective of either fitter:

  1. HELD-OUT LANDMARKS. Project coordinates that were not in the fit and
     measure how far they land from the coastline the map actually draws. A
     coastal feature should sit within the width of the white stroke. An inland
     one should not — 高崎山 is a kilometre from the shore and reads as 1.2 km,
     which is correct, so read the list rather than only the summary.

  2. OVERLAP AGREEMENT against an already-calibrated neighbour, plus a shift
     sweep. The agreement number alone is weak evidence when the affine came
     from auto_affine, which maximises very nearly this. The SHAPE is the
     evidence: the peak must sit at zero offset and fall away on both sides. An
     off-centre peak means the affine is systematically displaced.

  3. MASK BOX GEOGRAPHY. The timestamp caption, legend and logo are painted at
     the same pixels on every prefecture's map, but the land underneath differs.
     Cells there are masked — unknown, not dry — so a box over populated land is
     silent data loss. Reports what each box covers and how much of it is land.

Exit status is 0 always: these are measurements for a human to weigh, not a
gate. 大分's numbers under THIS tool, for comparison: held-out landmarks median
0.42 km, overlap 95.4% peaking dead centre, one box over land but the wrong
prefecture's land.

(An earlier hand-run of check 2 reported 87.5% for the same affine. Not a
discrepancy: it used four hours of the 2025-08-10 extreme, where echo covered
80% of the map and the high bands disagree most. This tool picks hours in the
10-65% band, so its numbers are comparable only with each other.)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from precip_extract import (  # noqa: E402
    PREFECTURES, BLOCK, SWATCHES, BLEND_A, BASEMAP_LAND, BASEMAP_SEA, MASK_BOXES,
    extract_file,
)
from auto_affine import fetch, echo_fraction, IMG_W, IMG_H, GW, GH  # noqa: E402

LAND_REFS = np.vstack([BASEMAP_LAND[None, :], BLEND_A * SWATCHES + (1 - BLEND_A) * BASEMAP_LAND])
SEA_REFS = np.vstack([BASEMAP_SEA[None, :], BLEND_A * SWATCHES + (1 - BLEND_A) * BASEMAP_SEA])


def land_sea(path: Path):
    """+1 sea, -1 land, 0 unknown. Bands blended over each basemap are included,
    so rain over water is still recognised as water."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)

    def nearest(refs):
        d = np.full(a.shape[:2], np.inf)
        for r in refs:
            d = np.minimum(d, ((a - r) ** 2).sum(axis=2))
        return d

    dl, ds = nearest(LAND_REFS), nearest(SEA_REFS)
    m = np.zeros(a.shape[:2])
    m[(ds < dl) & (ds < 30 ** 2)] = 1.0
    m[(dl < ds) & (dl < 30 ** 2)] = -1.0
    return m


def coastline(mask):
    sea, land = mask > 0, mask < 0
    c = np.zeros_like(sea)
    for ax, sh in ((0, 1), (0, -1), (1, 1), (1, -1)):
        c |= sea & np.roll(land, sh, axis=ax)
    return np.argwhere(c)          # (y, x)


def to_pixel(a, lon, lat):
    det = a["lon_px"] * a["lat_py"] - a["lon_py"] * a["lat_px"]
    dlon, dlat = lon - a["lon_c"], lat - a["lat_c"]
    return ((a["lat_py"] * dlon - a["lon_py"] * dlat) / det,
            (a["lon_px"] * dlat - a["lat_px"] * dlon) / det)


def read_landmarks(path):
    out = []
    for line in open(path):
        line = line.split('#')[0].strip()
        if not line:
            continue
        f = line.split()
        if len(f) < 4:
            continue
        try:
            lon, lat = float(f[2]), float(f[3])
        except ValueError:
            continue
        fitted = f[0] not in ('?', '-')
        out.append((' '.join(f[4:]) or '?', lon, lat, fitted))
    return out


def pick_dry(pref, cache, candidates):
    best = None
    for (y, m, d, h) in candidates:
        p = fetch(pref, y, m, d, h, cache)
        if not p:
            continue
        f = echo_fraction(extract_file(str(p))[0])
        if best is None or f < best[0]:
            best = (f, p, f"{y}-{m:02d}-{d:02d} {h:02d}JST")
        if f <= 0.001:
            break
    return best


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pref", type=int, required=True)
    ap.add_argument("--ref", type=int, default=None, help="calibrated neighbour for check 2")
    ap.add_argument("--landmarks", default=None, help="tsv; only its lon/lat columns are used")
    ap.add_argument("--hours", type=int, default=8)
    ap.add_argument("--cache", default=str(Path(__file__).resolve().parent / "cache"))
    args = ap.parse_args()

    if args.pref not in PREFECTURES:
        sys.exit(f"pref-{args.pref} has no affine to verify")
    A = PREFECTURES[args.pref]["affine"]
    cache = Path(args.cache)

    clat = A["lat_px"] * (IMG_W / 2) + A["lat_py"] * (IMG_H / 2) + A["lat_c"]
    kmpx = abs(A["lat_py"]) * 111.19
    print(f"pref-{args.pref} {PREFECTURES[args.pref]['name']}   "
          f"{1/kmpx:.2f} px/km ({kmpx*1000:.0f} m/px)")
    print(f"  covers lon {A['lon_c']:.4f}..{A['lon_px']*IMG_W + A['lon_c']:.4f}  "
          f"lat {A['lat_py']*IMG_H + A['lat_c']:.4f}..{A['lat_c']:.4f}")
    aspect, want = A["lon_px"] / abs(A["lat_py"]), 1 / np.cos(np.radians(clat))
    dev = 100 * (aspect / want - 1)
    note = ("  <-- tautological here: this affine was built with the aspect imposed "
            "(auto_affine always is; fit_affine's constrained mode too), so the "
            "identity holds by construction and confirms nothing"
            if abs(dev) < 0.02 else f"; 福岡 measures +0.17%, 大分 -0.38%")
    print(f"  aspect {aspect:.5f} vs 1/cos(lat) {want:.5f} ({dev:+.2f}%{note})\n")

    dry_scan = [(2025, 12, d, h) for d in (9, 19) for h in (3, 9, 15)] + \
               [(2026, 1, d, h) for d in (5, 12) for h in (3, 9, 15)] + \
               [(2026, 2, d, h) for d in (3, 18) for h in (3, 9, 15)]
    dry = pick_dry(args.pref, cache, dry_scan)
    if not dry:
        sys.exit("could not fetch a rain-free frame")
    frac, dry_path, dry_when = dry
    mask = land_sea(dry_path)
    print(f"Rain-free frame for the coastline: {dry_when} (echo {frac:.1%})\n")

    # ---- 1. held-out landmarks -------------------------------------------
    if args.landmarks:
        coast = coastline(mask)
        print("1. LANDMARKS — distance from the coastline the map draws")
        print(f"   {'landmark':<28}{'projected px':>16}{'to coast':>12}")
        held = []
        for name, lon, lat, fitted in read_landmarks(args.landmarks):
            px, py = to_pixel(A, lon, lat)
            if not (0 <= px < IMG_W and 0 <= py < IMG_H):
                print(f"   {name:<28}{'off-map':>16}")
                continue
            d = float(np.hypot(coast[:, 1] - px, coast[:, 0] - py).min())
            tag = '' if fitted else '  (held out)'
            print(f"   {name:<28}({px:6.1f},{py:6.1f}){d*kmpx:9.2f} km{tag}")
            if not fitted:
                held.append(d * kmpx)
        if held:
            print(f"\n   held-out: median {np.median(held):.2f} km, worst {max(held):.2f} km "
                  f"(大分 measured 0.3-0.5 km; an inland landmark legitimately reads higher)")
        print()

    # ---- 2. overlap agreement --------------------------------------------
    if args.ref:
        if args.ref not in PREFECTURES:
            sys.exit(f"reference pref-{args.ref} has no affine")
        R = PREFECTURES[args.ref]["affine"]
        wet = [(2025, 6, d, h) for d in (12, 20, 28) for h in (3, 9, 15, 21)] + \
              [(2025, 9, d, h) for d in (5, 13, 21) for h in (3, 9, 15, 21)] + \
              [(2026, 7, d, h) for d in (4, 16, 28) for h in (3, 9, 15, 21)]
        pairs = []
        for (y, m, d, h) in wet:
            pr, pt = fetch(args.ref, y, m, d, h, cache), fetch(args.pref, y, m, d, h, cache)
            if not pr or not pt:
                continue
            gr, gt = extract_file(str(pr))[0], extract_file(str(pt))[0]
            if 0.10 <= echo_fraction(gr) <= 0.65 and 0.10 <= echo_fraction(gt) <= 0.65:
                pairs.append((gr, gt))
            if len(pairs) >= args.hours:
                break

        ci, cj = np.meshgrid(np.arange(GW), np.arange(GH), indexing='xy')
        pxr = (ci * BLOCK + BLOCK / 2).ravel()
        pyr = (cj * BLOCK + BLOCK / 2).ravel()
        lon = R["lon_px"] * pxr + R["lon_py"] * pyr + R["lon_c"]
        lat = R["lat_px"] * pxr + R["lat_py"] * pyr + R["lat_c"]

        def score(dx, dy):
            px, py = to_pixel(A, lon, lat)
            px, py = px + dx, py + dy
            it, jt = np.floor(px / BLOCK).astype(int), np.floor(py / BLOCK).astype(int)
            ok = (it >= 0) & (it < GW) & (jt >= 0) & (jt < GH)
            src, dst = np.arange(pxr.size)[ok], (jt[ok] * GW + it[ok])
            same = tot = 0
            for gr, gt in pairs:
                a, b = gr[src], gt[dst]
                live = (a != 15) & (b != 15)
                same += int((a[live] == b[live]).sum())
                tot += int(live.sum())
            return (same / tot if tot else 0.0), tot

        base, n = score(0, 0)
        print(f"2. OVERLAP with pref-{args.ref} — {len(pairs)} hours, {n:,} comparisons")
        print(f"   agreement at zero offset {base:.1%}   "
              f"(大分 vs 福岡 under this tool: 95.4%)")
        print("   shift sweep — the peak must sit at the centre:")
        grid = {}
        for dy in (-2, -1, 0, 1, 2):
            row = []
            for dx in (-2, -1, 0, 1, 2):
                v, _ = score(dx, dy)
                grid[(dx, dy)] = v
                row.append(f"{v*100:5.1f}")
            print(f"     dy={dy:+d}  " + "  ".join(row))
        print("             " + "  ".join(f"dx={d:+d}" for d in (-2, -1, 0, 1, 2)))
        pk = max(grid, key=grid.get)
        print(f"   peak {grid[pk]*100:.1f}% at dx={pk[0]:+d} dy={pk[1]:+d}"
              + ("  — centred" if pk == (0, 0) else "  — OFF-CENTRE, the affine is displaced"))
        print()

    # ---- 3. mask box geography -------------------------------------------
    print("3. MASK BOXES — painted furniture, masked as unknown. What is underneath?")
    for name, (x0, y0, x1, y1) in zip(("caption", "legend", "logo"), MASK_BOXES):
        c1 = (A["lon_px"] * x0 + A["lon_py"] * y0 + A["lon_c"],
              A["lat_px"] * x0 + A["lat_py"] * y0 + A["lat_c"])
        c2 = (A["lon_px"] * x1 + A["lon_py"] * y1 + A["lon_c"],
              A["lat_px"] * x1 + A["lat_py"] * y1 + A["lat_c"])
        sub = mask[y0:y1, x0:x1]
        land_frac = float((sub < 0).mean())
        flag = "  <-- covers land" if land_frac > 0.05 else ""
        print(f"   {name:<8} lon {min(c1[0],c2[0]):.3f}..{max(c1[0],c2[0]):.3f}  "
              f"lat {min(c1[1],c2[1]):.3f}..{max(c1[1],c2[1]):.3f}   "
              f"land {land_frac:.0%}{flag}")
    print("\n   (land under a box is permanently unknown for those cells — check whether\n"
          "    anyone posts there before accepting it)")


if __name__ == "__main__":
    main()
