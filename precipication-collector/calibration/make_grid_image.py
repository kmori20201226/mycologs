#!/usr/bin/env python3
"""
A rain-free frame of a prefecture's map, plus a copy with a pixel grid drawn on.

    python make_grid_image.py --pref 38

Reading landmark pixels by hand is the one job the automatic calibration cannot
do, and it needs a frame with no echo hiding the coastline and a way to count
pixels without squinting. Scans the archive for an hour at the echo floor,
writes both images into precip-images/ (ignored by git, like the rest of the
archive), and prints where they went.

The grid is drawn in the same convention the affine uses: origin top-left, +y
downward, a faint line every 10 px and a bright labelled one every 50.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from precip_extract import PREFECTURES  # noqa: E402
from verify_affine import pick_dry  # noqa: E402

IMAGES = Path(__file__).resolve().parent.parent / "precip-images"

DRY_SCAN = [(2025, 12, d, h) for d in (9, 19) for h in (3, 9, 15)] + \
           [(2026, 1, d, h) for d in (5, 12) for h in (3, 9, 15)] + \
           [(2026, 2, d, h) for d in (3, 18) for h in (3, 9, 15)]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pref", type=int, required=True)
    ap.add_argument("--cache", default=str(Path(__file__).resolve().parent / "cache"))
    ap.add_argument("--outdir", default=str(IMAGES))
    ap.add_argument("--spacing", type=int, default=10,
                    help="faint grid spacing in px (default 10; raise it to 25 or 50 "
                         "if the mesh crowds the coastline at full-image zoom)")
    ap.add_argument("--major", type=int, default=50, help="labelled grid spacing (default 50)")
    args = ap.parse_args()

    if args.pref not in PREFECTURES:
        sys.exit(f"pref-{args.pref} is not in PREFECTURES")

    found = pick_dry(args.pref, Path(args.cache), DRY_SCAN)
    if not found:
        sys.exit("could not fetch any frame")
    frac, src, when = found
    if frac > 0.05:
        print(f"WARNING: the driest frame found still has {frac:.1%} echo — "
              f"widen DRY_SCAN if the coastline is obscured")

    out = Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)
    stem = f"pref-{args.pref}-clear-{src.name.split('-')[2]}-{src.name.split('-')[3].split('.')[0]}"
    clean = out / f"{stem}.jpg"
    shutil.copyfile(src, clean)

    im = Image.open(clean).convert("RGB")
    d = ImageDraw.Draw(im)
    W, H = im.size
    for x in range(0, W, args.spacing):
        d.line([(x, 0), (x, H)], fill=(255, 0, 0) if x % args.major == 0 else (120, 0, 0))
    for y in range(0, H, args.spacing):
        d.line([(0, y), (W, y)], fill=(255, 0, 0) if y % args.major == 0 else (120, 0, 0))
    for x in range(0, W, args.major):
        d.text((x + 2, 2), str(x), fill=(255, 255, 0))
    for y in range(0, H, args.major):
        d.text((2, y + 2), str(y), fill=(255, 255, 0))
    grid = out / f"{stem}-grid.png"
    im.save(grid)

    print(f"pref-{args.pref} {PREFECTURES[args.pref]['name']} — {when}, echo {frac:.1%}")
    print(f"  {clean}")
    print(f"  {grid}")


if __name__ == "__main__":
    main()
