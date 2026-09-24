#!/usr/bin/env python3
"""
Calibrate a prefecture's affine against an already-calibrated neighbour.

    python auto_affine.py --pref 47 --ref 43 --hours 10

No landmarks. The two maps see the same rain where they overlap, so the
reference grid *is* ground truth: search the transform that makes the target
read the same bands as the reference at the same places, and the affine falls
out of it.

Both maps are renders of the same projection, so the pixel-space relation
between them is a scale and a translation:

    reference_pixel = (sx * target_px + tx,  sy * target_py + ty)

sx and sy differ by a few tenths of a percent, because each map's linear affine
approximates Mercator over its own latitude band. Rotation is not fitted: the
measured maps sit at 0.03-0.05 degrees, which is noise at this resolution.

Two stages, because the objective is a step function of the transform and has
false optima:

  A. Coarse. Cross-correlate echo masks over a scale sweep, averaging the
     correlation surface across hours. One hour's rain has many plausible
     alignments; eight hours' rain has one. This is what makes the search
     tractable without a starting guess.
  B. Fine. Pattern search on exact band agreement over CELLS, shrinking the
     step until it is sub-pixel, with sx and sy free.
  C. Finer. The same search over per-pixel band labels. Stage B is limited by
     its own ruler: cells are 4x4 pixels, about a kilometre, so a 0.3% scale
     error moves an edge cell by half a cell and hardly changes the score.
     Measured on 大分, B alone lands 4.2 px out at the worst corner, almost all
     of it in sx and sy. Pixels resolve what cells cannot.

Measured accuracy, calibrating 大分 against 福岡 with the landmarks kept out of
the fit entirely, then compared to the landmark affine:

    worst image-corner displacement   1.71 px = 504 m   (half a cell)

with the stages contributing: A alone lands the map; B gets to 4.2 px; C fixes
sx to 0.02% but leaves 4.0 px because lat was still wrong; composing through
Mercator instead of chaining linear affines is what takes it to 1.7 px.

That is close to the floor. Anchoring to a reference inherits the reference's
own error, and 福岡's stored affine departs from Mercator by 1.3 px inside its
own frame — printed on every run, so the floor is visible.

So this is a very good starting point, not a finished answer. Validate any
result the way 大分's was: held-out landmarks projected against the coastline
the map actually draws, and overlap agreement against a neighbour. A high score
against ONE neighbour is not proof; it is the thing being optimised.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from precip_extract import (  # noqa: E402
    PREFECTURES, BLOCK, extract_file, classify_pixels, MASK_BOXES,
)

ARCHIVE = ("https://storage.tenki.jp/archive/radar/"
           "{y:04d}/{m:02d}/{d:02d}/{h:02d}/00/00/pref-{pref}-large.jpg")
USER_AGENT = "mycologs-precip/1.0 (+https://www.mycologs.club)"

IMG_W, IMG_H = 692, 519
GW, GH = -(-IMG_W // BLOCK), -(-IMG_H // BLOCK)


# ---------------------------------------------------------------------------
# Sample hours
# ---------------------------------------------------------------------------

def fetch(pref: int, y: int, m: int, d: int, h: int, cache: Path) -> Path | None:
    import requests
    cache.mkdir(parents=True, exist_ok=True)
    p = cache / f"precip-{pref}-{y:04d}{m:02d}{d:02d}-{h:02d}.jpg"
    if p.exists() and p.stat().st_size > 0:
        return p
    r = requests.get(ARCHIVE.format(pref=pref, y=y, m=m, d=d, h=h),
                     headers={"User-Agent": USER_AGENT}, timeout=30)
    if r.status_code != 200 or not r.content:
        return None
    p.write_bytes(r.content)
    time.sleep(0.5)          # someone else's bandwidth
    return p


def pixel_labels(path: Path) -> np.ndarray:
    """
    Per-pixel band labels for Stage C, with the painted furniture removed.

    classify_pixels is the same function the extractor votes with, so this is
    the identical colour table at 16x the spatial resolution -- no new
    assumptions, just a finer ruler.
    """
    lab = classify_pixels(np.asarray(Image.open(path).convert('RGB')))
    for x0, y0, x1, y1 in MASK_BOXES:
        lab[y0:y1, x0:x1] = 16        # abstain: never compared
    return lab


def echo_fraction(grid: np.ndarray) -> float:
    live = grid[grid != 15]
    return float((live >= 1).mean()) if live.size else 0.0


def pick_hours(ref: int, tgt: int, candidates, cache: Path, want: int):
    """
    Hours where BOTH maps show partial, structured echo.

    Saturated hours are useless — a map that is 85% wet aligns with itself at
    almost any offset, which is exactly how the first attempt at this went
    wrong. Half-covered hours carry edges, and edges are what locate a map.
    """
    chosen = []
    for (y, m, d, h) in candidates:
        pr, pt = fetch(ref, y, m, d, h, cache), fetch(tgt, y, m, d, h, cache)
        if not pr or not pt:
            continue
        gr, gt = extract_file(str(pr))[0], extract_file(str(pt))[0]
        fr, ft = echo_fraction(gr), echo_fraction(gt)
        if 0.10 <= fr <= 0.65 and 0.10 <= ft <= 0.65:
            chosen.append((f"{y}-{m:02d}-{d:02d} {h:02d}JST", gr, gt, fr, ft,
                           pixel_labels(pr), pixel_labels(pt)))
            print(f"  use  {y}-{m:02d}-{d:02d} {h:02d}JST  echo ref {fr:.0%} tgt {ft:.0%}")
            if len(chosen) >= want:
                break
        else:
            print(f"  skip {y}-{m:02d}-{d:02d} {h:02d}JST  echo ref {fr:.0%} tgt {ft:.0%}")
    return chosen


# ---------------------------------------------------------------------------
# Stage A: coarse, via averaged echo cross-correlation
# ---------------------------------------------------------------------------

def coarse(pairs, scales) -> tuple[float, float, float]:
    H, W = GH, GW
    best = (-np.inf, 1.0, 0.0, 0.0)
    for s in scales:
        acc = None
        for rec in pairs:
            gr, gt = rec[1], rec[2]
            a = ((gr.reshape(H, W) >= 1) & (gr.reshape(H, W) != 15)).astype(np.float64)
            b = ((gt.reshape(H, W) >= 1) & (gt.reshape(H, W) != 15)).astype(np.float64)
            if s != 1.0:
                im = Image.fromarray((b * 255).astype(np.uint8))
                b = np.asarray(im.resize((max(1, int(round(W * s))), max(1, int(round(H * s)))),
                                         Image.BILINEAR)).astype(np.float64) / 255.0
            a = a - a.mean()
            b = b - b.mean()
            hh, ww = a.shape[0] + b.shape[0], a.shape[1] + b.shape[1]
            c = np.fft.irfft2(np.fft.rfft2(a, s=(hh, ww)) * np.conj(np.fft.rfft2(b, s=(hh, ww))),
                              s=(hh, ww))
            acc = c if acc is None else acc + c
        # shift index -> translation of the RESIZED target inside the reference
        idx = np.unravel_index(np.argmax(acc), acc.shape)
        dy = idx[0] if idx[0] < a.shape[0] else idx[0] - hh
        dx = idx[1] if idx[1] < a.shape[1] else idx[1] - ww
        v = acc[idx] / len(pairs)
        if v > best[0]:
            best = (v, s, dx * BLOCK, dy * BLOCK)
    _, s, tx, ty = best
    return s, float(tx), float(ty)


# ---------------------------------------------------------------------------
# Stage B: fine, on exact band agreement
# ---------------------------------------------------------------------------

_CI, _CJ = np.meshgrid(np.arange(GW), np.arange(GH), indexing='xy')
_PXR = (_CI * BLOCK + BLOCK / 2).ravel()
_PYR = (_CJ * BLOCK + BLOCK / 2).ravel()


def agreement(pairs, sx, sy, tx, ty) -> tuple[float, int]:
    """
    Exact band agreement over cells where either side sees echo.

    Dry cells are excluded: they agree at almost any alignment and would drown
    the signal. Masked cells on either side are unknown, not equal.
    """
    px_t = (_PXR - tx) / sx
    py_t = (_PYR - ty) / sy
    it = np.floor(px_t / BLOCK).astype(int)
    jt = np.floor(py_t / BLOCK).astype(int)
    ok = (it >= 0) & (it < GW) & (jt >= 0) & (jt < GH)
    if ok.sum() < 500:
        return 0.0, 0
    src = np.arange(_PXR.size)[ok]
    dst = (jt[ok] * GW + it[ok])
    same = tot = 0
    for rec in pairs:
        gr, gt = rec[1], rec[2]
        a, b = gr[src], gt[dst]
        live = (a != 15) & (b != 15)
        interesting = live & ((a >= 1) | (b >= 1))
        n = int(interesting.sum())
        if n == 0:
            continue
        same += int((a[interesting] == b[interesting]).sum())
        tot += n
    return (same / tot if tot else 0.0), tot


_PX, _PY = np.meshgrid(np.arange(IMG_W), np.arange(IMG_H), indexing='xy')
_PXF = _PX.ravel().astype(np.float64)
_PYF = _PY.ravel().astype(np.float64)


def agreement_px(pairs, sx, sy, tx, ty) -> tuple[float, int]:
    """Stage B's measure at pixel resolution instead of cell resolution."""
    xt = np.rint((_PXF - tx) / sx).astype(int)
    yt = np.rint((_PYF - ty) / sy).astype(int)
    ok = (xt >= 0) & (xt < IMG_W) & (yt >= 0) & (yt < IMG_H)
    if ok.sum() < 20000:
        return 0.0, 0
    src = np.arange(_PXF.size)[ok]
    dst = yt[ok] * IMG_W + xt[ok]
    same = tot = 0
    for rec in pairs:
        a = rec[5].ravel()[src]
        b = rec[6].ravel()[dst]
        live = (a != 16) & (b != 16)
        interesting = live & ((a >= 1) | (b >= 1))
        n = int(interesting.sum())
        if n == 0:
            continue
        same += int((a[interesting] == b[interesting]).sum())
        tot += n
    return (same / tot if tot else 0.0), tot


def refine_px(pairs, p0, verbose=True):
    p = np.array(p0, float)
    steps = np.array([0.004, 0.004, 1.0, 1.0])
    best, _ = agreement_px(pairs, *p)
    while steps[2] >= 0.03:
        improved = False
        for k in range(4):
            for sign in (+1, -1):
                q = p.copy()
                q[k] += sign * steps[k]
                v, _ = agreement_px(pairs, *q)
                if v > best:
                    best, p, improved = v, q, True
        if not improved:
            steps = steps / 2
            if verbose:
                print(f"    step -> {steps[2]:.3f} px   agreement {best:.4f}")
    return p, best


def refine(pairs, s0, tx0, ty0, verbose=True):
    p = np.array([s0, s0, tx0, ty0], float)
    steps = np.array([0.02, 0.02, 4.0, 4.0])
    best, _ = agreement(pairs, *p)
    while steps[2] >= 0.125:
        improved = False
        for k in range(4):
            for sign in (+1, -1):
                q = p.copy()
                q[k] += sign * steps[k]
                v, _ = agreement(pairs, *q)
                if v > best:
                    best, p, improved = v, q, True
        if not improved:
            steps = steps / 2
            if verbose:
                print(f"    step -> {steps[2]:.3f} px   agreement {best:.4f}")
    return p, best


# ---------------------------------------------------------------------------

def _merc_y(lat):  return np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
def _inv_merc(y):  return np.degrees(2 * np.arctan(np.exp(y)) - np.pi / 2)


def reference_model(a: dict):
    """
    A Mercator model of the reference map, anchored to its stored affine.

    Chaining two linear affines is the obvious composition and it is wrong.
    Longitude is exactly linear in Mercator; latitude is not, and a stored
    affine is only the best LINEAR approximation over its own map's latitude
    band. Composing through it applies the reference's linearisation across the
    target's different band. Measured on 大分 that error is 0.84% in lat_py —
    4.0 px at the far corner — while lon_px comes out right to 0.02%, which is
    the signature of exactly this mistake.

    Mercator has one scale for both axes, so the same radians-per-pixel that the
    reference's lon_px implies is used for y, anchored so the model agrees with
    the stored affine at the reference image's centre.
    """
    k = np.radians(a["lon_px"])
    lat_mid = a["lat_px"] * (IMG_W / 2) + a["lat_py"] * (IMG_H / 2) + a["lat_c"]
    y_mid = _merc_y(lat_mid)

    def lonlat(px, py):
        lon = a["lon_px"] * px + a["lon_py"] * py + a["lon_c"]
        return lon, _inv_merc(y_mid - (py - IMG_H / 2) * k)
    return lonlat


def reference_nonlinearity(a: dict) -> float:
    """
    How far the reference's own stored affine departs from Mercator, in pixels.

    This is the floor on what calibrating against it can achieve: the target
    inherits whatever the reference already gets wrong. Fukuoka measures 1.3 px.
    """
    lonlat = reference_model(a)
    py = np.arange(IMG_H, dtype=float)
    lin = a["lat_px"] * (IMG_W / 2) + a["lat_py"] * py + a["lat_c"]
    _, mer = lonlat(np.full_like(py, IMG_W / 2), py)
    return float(np.abs(lin - mer).max() / abs(a["lat_py"]))


def compose(ref_affine: dict, sx, sy, tx, ty) -> dict:
    """
    Target affine: map target pixels into the reference frame, take their true
    lon/lat from the Mercator model, and fit the best LINEAR affine to those
    over the target's own frame — which is what a precip_grids row stores.
    """
    s = (sx + sy) / 2.0          # the pixel map is a similarity; see above
    lonlat = reference_model(ref_affine)
    gx, gy = np.meshgrid(np.linspace(0, IMG_W, 60), np.linspace(0, IMG_H, 60))
    gx, gy = gx.ravel(), gy.ravel()
    lon, lat = lonlat(s * gx + tx, s * gy + ty)
    A = np.column_stack([gx, gy, np.ones_like(gx)])
    (lon_px, lon_py, lon_c), *_ = np.linalg.lstsq(A, lon, rcond=None)
    (lat_px, lat_py, lat_c), *_ = np.linalg.lstsq(A, lat, rcond=None)
    return dict(lon_px=lon_px, lon_py=lon_py, lon_c=lon_c,
                lat_px=lat_px, lat_py=lat_py, lat_c=lat_c)


def corner_disagreement(a: dict, b: dict) -> tuple[float, float]:
    """Worst image-corner displacement between two affines, in px and km."""
    worst_deg = 0.0
    for px, py in ((0, 0), (IMG_W, 0), (0, IMG_H), (IMG_W, IMG_H)):
        la = (a["lon_px"] * px + a["lon_py"] * py + a["lon_c"],
              a["lat_px"] * px + a["lat_py"] * py + a["lat_c"])
        lb = (b["lon_px"] * px + b["lon_py"] * py + b["lon_c"],
              b["lat_px"] * px + b["lat_py"] * py + b["lat_c"])
        d = np.hypot((la[0] - lb[0]) * 93.0, (la[1] - lb[1]) * 111.19)   # km
        worst_deg = max(worst_deg, d)
    return worst_deg / (abs(a["lat_py"]) * 111.19), worst_deg


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pref", type=int, required=True, help="prefecture to calibrate")
    ap.add_argument("--ref", type=int, default=43, help="already-calibrated neighbour (default 43)")
    ap.add_argument("--hours", type=int, default=10, help="sample hours to use (default 10)")
    ap.add_argument("--cache", default=str(Path(__file__).resolve().parent / "cache"))
    args = ap.parse_args()

    if args.ref not in PREFECTURES:
        sys.exit(f"reference pref-{args.ref} has no affine to stand on")
    ref_affine = PREFECTURES[args.ref]["affine"]

    # Spread across seasons: frontal rain, tsuyu, typhoon, winter showers.
    candidates = [(2025, 6, d, h) for d in (12, 20, 28) for h in (3, 9, 15, 21)] + \
                 [(2025, 9, d, h) for d in (5, 13, 21) for h in (3, 9, 15, 21)] + \
                 [(2026, 3, d, h) for d in (2, 14, 26) for h in (3, 9, 15, 21)] + \
                 [(2026, 7, d, h) for d in (4, 16, 28) for h in (3, 9, 15, 21)]

    print(f"Selecting hours where pref-{args.ref} and pref-{args.pref} both show partial echo:")
    pairs = pick_hours(args.ref, args.pref, candidates, Path(args.cache), args.hours)
    if len(pairs) < 4:
        sys.exit(f"only {len(pairs)} usable hours; widen the candidate list")
    print(f"\n{len(pairs)} hours selected.\n")

    print("Stage A — coarse alignment from averaged echo correlation ...")
    s0, tx0, ty0 = coarse(pairs, np.arange(0.70, 1.61, 0.02))
    print(f"  scale {s0:.3f}  offset ({tx0:.0f}, {ty0:.0f}) px")
    a0, n0 = agreement(pairs, s0, s0, tx0, ty0)
    print(f"  agreement {a0:.4f} over {n0:,} echo cells\n")

    print("Stage B — pattern search on band agreement ...")
    (sx, sy, tx, ty), score = refine(pairs, s0, tx0, ty0)
    print(f"\n  sx {sx:.5f}  sy {sy:.5f}  tx {tx:.2f}  ty {ty:.2f}")
    print(f"  agreement {score:.4f}\n")

    print("Stage C — pattern search at pixel resolution ...")
    (sx, sy, tx, ty), score_px = refine_px(pairs, (sx, sy, tx, ty))
    print(f"\n  sx {sx:.5f}  sy {sy:.5f}  tx {tx:.2f}  ty {ty:.2f}")
    print(f"  agreement {score_px:.4f} (pixel level)\n")

    # Thresholds set from four real calibrations rather than guessed. sx/sy
    # divergence turned out to be a WEAK predictor: 佐賀 0.44%, 熊本 0.76% and
    # 山口 0.90% all verified fine against held-out landmarks, while 大分 sat at
    # 0.08%. The one genuine failure — 山口 against 大分, which placed the map
    # 189 km away — showed 4.17% AND a pixel agreement of 0.25 where every good
    # run scored 0.93-0.97. So agreement is the gate; divergence is a hint.
    aniso = 100 * abs(sx / sy - 1)
    verdict = ("looks sound" if score_px >= 0.90 else
               "REJECT — no good run has scored below 0.93; this one did not find the map")
    print(f"Pixel map: scale {(sx+sy)/2:.5f}, sx/sy apart by {aniso:.3f}%"
          + ("" if aniso < 2.0 else "  <-- high; expected a similarity"))
    print(f"Pixel agreement {score_px:.4f} — {verdict}")
    print(f"Reference pref-{args.ref} departs from Mercator by up to "
          f"{reference_nonlinearity(ref_affine):.2f} px inside its own frame; "
          f"the target inherits that.\n")

    out = compose(ref_affine, sx, sy, tx, ty)
    print(f'    {args.pref}: {{')
    print(f'        "name": "...",')
    print(f'        "source": "tenki.jp/pref-{args.pref}-large",')
    print(f'        "width": {IMG_W}, "height": {IMG_H},')
    print( '        "affine": dict(')
    for k in ("lon_px", "lon_py", "lon_c", "lat_px", "lat_py", "lat_c"):
        print(f'            {k}={out[k]:.6e},' if abs(out[k]) < 1 else f'            {k}={out[k]:.6f},')
    print( '        ),')
    print( '    },')

    known = PREFECTURES.get(args.pref, {}).get("affine")
    if known:
        px, km = corner_disagreement(out, known)
        print(f'\nAgainst the affine already in PREFECTURES[{args.pref}]:')
        print(f'  worst corner displacement {px:.2f} px = {km*1000:.0f} m')
        for k in ("lon_px", "lon_py", "lon_c", "lat_px", "lat_py", "lat_c"):
            print(f'  {k:7s} auto {out[k]:+.6e}   landmarks {known[k]:+.6e}')


if __name__ == "__main__":
    main()
