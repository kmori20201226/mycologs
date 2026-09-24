"""
Fit a precip_extract AFFINE from landmark pixels.

Usage:  python fit_affine.py landmarks.tsv
where each non-comment line is:   px  py  lon  lat   [name]

px/py are pixel coordinates read off the 692x519 tenki.jp map; lon/lat are the
true coordinates of that same feature (GSI 地理院地図 gives them to 6 places).
Three points determine the six coefficients; use at least six so the residuals
mean something.
"""
import sys
import numpy as np

IMAGE_WIDTH, IMAGE_HEIGHT = 692, 519
# Fukuoka's measured scale. NOT a prior for other prefectures: tenki.jp fits each
# map to its own prefecture's bounding box, so the zoom differs per prefecture
# (measured: Kagoshima 2.10 px/km against Fukuoka's 3.78, and Oita about 10%
# coarser than Fukuoka). Kept only to report the ratio, which is informative.
FUK_LON_PX, FUK_LAT_PY, FUK_CENTER_LAT = 2.857252e-3, -2.378694e-3, 33.5100


def fit(rows):
    px, py, lon, lat = (np.array([r[i] for r in rows], float) for i in range(4))
    A = np.column_stack([px, py, np.ones_like(px)])
    (lon_px, lon_py, lon_c), *_ = np.linalg.lstsq(A, lon, rcond=None)
    (lat_px, lat_py, lat_c), *_ = np.linalg.lstsq(A, lat, rcond=None)
    return dict(lon_px=lon_px, lon_py=lon_py, lon_c=lon_c,
                lat_px=lat_px, lat_py=lat_py, lat_c=lat_c)


def report(a, rows):
    px, py, lon, lat = (np.array([r[i] for r in rows], float) for i in range(4))
    plon = a["lon_px"]*px + a["lon_py"]*py + a["lon_c"]
    plat = a["lat_px"]*px + a["lat_py"]*py + a["lat_c"]
    # residual in source pixels (invert the linear part)
    M = np.array([[a["lon_px"], a["lon_py"]], [a["lat_px"], a["lat_py"]]])
    R = np.linalg.solve(M, np.vstack([lon - plon, lat - plat]))
    print(f'{"landmark":<22}{"dpx":>8}{"dpy":>8}{"metres":>9}')
    for i, r in enumerate(rows):
        m = np.hypot(R[0, i]*a["lon_px"]*93000, R[1, i]*a["lat_py"]*111000)
        print(f'{(r[4] if len(r) > 4 else "?"):<22}{R[0,i]:8.2f}{R[1,i]:8.2f}{m:9.0f}')
    rms = np.hypot(R[0], R[1])
    print(f'\nRMS residual {rms.mean():.2f} px   worst {rms.max():.2f} px')

    clat = a["lat_px"]*(IMAGE_WIDTH/2) + a["lat_py"]*(IMAGE_HEIGHT/2) + a["lat_c"]
    print(f'centre latitude {clat:.4f}')

    # Scale-free check. Whatever zoom this prefecture is rendered at, a Mercator
    # map has lon_px / |lat_py| = 1 / cos(latitude). Fukuoka's own measured
    # affine satisfies this to +0.17%, so a fit more than ~1% off it is a
    # misread landmark, not a different projection.
    aspect = a["lon_px"]/abs(a["lat_py"])
    want = 1.0/np.cos(np.radians(clat))
    print(f'aspect lon_px/|lat_py| {aspect:.5f}  vs 1/cos(centre lat) {want:.5f}  '
          f'({100*(aspect/want-1):+.2f}%)   [Fukuoka measures +0.17%]')

    # Absolute zoom: reported, not asserted -- it is per-prefecture.
    kmpx = abs(a["lat_py"])*111.19
    print(f'scale {1/kmpx:.2f} px/km ({kmpx*1000:.0f} m per pixel), '
          f'{abs(a["lat_py"]/FUK_LAT_PY):.3f}x Fukuoka\'s degrees per pixel')
    print(f'covers lon {a["lon_c"]:.4f}..{a["lon_px"]*IMAGE_WIDTH + a["lon_c"]:.4f}, '
          f'lat {a["lat_py"]*IMAGE_HEIGHT + a["lat_c"]:.4f}..{a["lat_c"]:.4f}')
    print('\nAFFINE = dict(')
    for k in ("lon_px", "lon_py", "lon_c", "lat_px", "lat_py", "lat_c"):
        print(f'    {k}={a[k]:.6e},' if abs(a[k]) < 1 else f'    {k}={a[k]:.6f},')
    print(')')


def main(path):
    rows, unfilled = [], 0
    for line in open(path):
        line = line.split('#')[0].strip()
        if not line:
            continue
        f = line.split()
        if len(f) < 4:
            continue
        try:
            nums = [float(v) for v in f[:4]]
        except ValueError:
            unfilled += 1          # a row still carrying '?' placeholders
            continue
        rows.append(nums + ([' '.join(f[4:])] if len(f) > 4 else []))
    if unfilled:
        print(f'({unfilled} landmark rows not filled in yet — skipped)\n')
    if len(rows) < 3:
        sys.exit(f'need at least 3 filled landmarks (6+ recommended); found {len(rows)}')
    report(fit(rows), rows)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'landmarks.tsv')
