import sys, numpy as np
from pathlib import Path
sys.path.insert(0, str(Path('.').resolve().parent)); sys.path.insert(0, '.')
from precip_extract import PREFECTURES, BLOCK, extract_file
from auto_affine import fetch, echo_fraction, GW, GH
from verify_affine import to_pixel

cache = Path('cache')
wet = [(2025,6,d,h) for d in (12,20,28) for h in (3,9,15,21)] + \
      [(2025,9,d,h) for d in (5,13,21) for h in (3,9,15,21)] + \
      [(2026,7,d,h) for d in (4,16,28) for h in (3,9,15,21)]

for pref in (44, 46, 38):
    A = PREFECTURES[pref]["affine"]; R = PREFECTURES[43]["affine"]
    pairs = []
    for (y,m,d,h) in wet:
        pr, pt = fetch(43,y,m,d,h,cache), fetch(pref,y,m,d,h,cache)
        if not pr or not pt: continue
        gr, gt = extract_file(str(pr))[0], extract_file(str(pt))[0]
        if 0.10 <= echo_fraction(gr) <= 0.65 and 0.10 <= echo_fraction(gt) <= 0.65:
            pairs.append((gr, gt))
        if len(pairs) >= 8: break
    ci, cj = np.meshgrid(np.arange(GW), np.arange(GH), indexing='xy')
    pxr = (ci*BLOCK + BLOCK/2).ravel(); pyr = (cj*BLOCK + BLOCK/2).ravel()
    lon = R["lon_px"]*pxr + R["lon_py"]*pyr + R["lon_c"]
    lat = R["lat_px"]*pxr + R["lat_py"]*pyr + R["lat_c"]
    def score(dx, dy):
        px, py = to_pixel(A, lon, lat); px, py = px+dx, py+dy
        it, jt = np.floor(px/BLOCK).astype(int), np.floor(py/BLOCK).astype(int)
        ok = (it>=0)&(it<GW)&(jt>=0)&(jt<GH)
        src, dst = np.arange(pxr.size)[ok], jt[ok]*GW+it[ok]
        same=tot=0
        for gr,gt in pairs:
            a,b = gr[src], gt[dst]; live=(a!=15)&(b!=15)
            same+=int((a[live]==b[live]).sum()); tot+=int(live.sum())
        return same/tot if tot else 0
    best=max(((score(dx,dy),dx,dy) for dx in range(-6,7) for dy in range(-6,7)))
    print(f"pref-{pref}: zero offset {score(0,0)*100:.1f}%   "
          f"wide peak {best[0]*100:.1f}% at dx={best[1]:+d} dy={best[2]:+d}  "
          f"({np.hypot(best[1],best[2])*abs(A['lat_py'])*111.19*1000:.0f} m off)")
