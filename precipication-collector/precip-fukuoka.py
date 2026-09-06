"""
tenki.jp 福岡県 雨雲レーダー画像 -> (緯度, 経度, 降水量mm/h) テーブル抽出スクリプト v3
彩度(max-min)でグレー系(陸/海/データなし)を先に除外してから凡例色に最近傍分類
"""
from PIL import Image
import numpy as np
import csv

COEF_LON = (2.857252e-03, -1.350123e-06, 129.634248)
COEF_LAT = (-7.448166e-06, -2.378694e-03, 34.127323)

def pixel_to_lonlat(px, py):
    lon = COEF_LON[0]*px + COEF_LON[1]*py + COEF_LON[2]
    lat = COEF_LAT[0]*px + COEF_LAT[1]*py + COEF_LAT[2]
    return lon, lat

LEGEND = [
    (100, (158, 30, 167)),
    (80,  (125, 18, 36)),
    (50,  (196, 28, 27)),
    (40,  (204, 71, 116)),
    (30,  (235, 187, 235)),
    (20,  (215, 158, 53)),
    (15,  (248, 249, 85)),
    (10,  (24, 108, 31)),
    (8,   (9, 14, 168)),
    (6,   (32, 103, 183)),
    (4,   (48, 167, 209)),
    (2,   (172, 229, 236)),
    (1,   (193, 218, 223)),
]
LEGEND_VALUES = np.array([v for v, _ in LEGEND])
LEGEND_COLORS = np.array([c for _, c in LEGEND], dtype=float)

EXCLUDE_BOXES = [
    (0, 0, 240, 35),
    (615, 290, 692, 490),
    (600, 495, 692, 519),
]

SATURATION_MIN = 26   # max(R,G,B)-min(R,G,B) がこれ未満ならグレー系とみなし除外
COLOR_DIST_MAX = 28   # 最近傍凡例色との距離上限

def extract(image_path, out_csv):
    img = Image.open(image_path).convert("RGB")
    arr = np.array(img).astype(float)
    h, w, _ = arr.shape

    mask = np.ones((h, w), dtype=bool)
    for x0, y0, x1, y1 in EXCLUDE_BOXES:
        mask[y0:y1, x0:x1] = False

    sat = arr.max(axis=2) - arr.min(axis=2)
    mask &= (sat >= SATURATION_MIN)

    ys, xs = np.where(mask)
    pixels = arr[ys, xs]  # (N,3)

    diffs = pixels[:, None, :] - LEGEND_COLORS[None, :, :]
    dists = np.sqrt((diffs ** 2).sum(axis=2))
    idx = dists.argmin(axis=1)
    mind = dists[np.arange(len(pixels)), idx]

    keep = mind <= COLOR_DIST_MAX
    xs_k, ys_k, idx_k = xs[keep], ys[keep], idx[keep]

    rows = []
    for x, y, i in zip(xs_k, ys_k, idx_k):
        lon, lat = pixel_to_lonlat(int(x), int(y))
        rows.append((round(lat, 5), round(lon, 5), int(LEGEND_VALUES[i]), int(x), int(y)))

    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["latitude", "longitude", "precip_mm_per_h", "pixel_x", "pixel_y"])
        writer.writerows(rows)

    print(f"抽出セル数(降水あり): {len(rows)}")
    return rows

if __name__ == "__main__":
    extract("/mnt/user-data/uploads/t.jpg", "/mnt/user-data/outputs/precip_mesh.csv")
