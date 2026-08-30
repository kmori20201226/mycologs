"""
tenki.jp Fukuoka radar image -> band grid.

This is the single source of truth for extraction. Every constant here was
measured from the images; none are guessable and several are not what the
obvious reading of the legend suggests. The reasoning is recorded in the
`precip-radar` branch commit "Store Fukuoka radar snapshots so posts can be
matched to rainfall" — read it before changing any number below.

The TypeScript twin at apps/api/src/lib/precip.ts is kept only as a reference
oracle for verify_port.py; it must produce identical grids. Node reads rows from
the database and never opens a JPEG.

Supersedes precip-fukuoka.py, whose colour table is wrong in four separate ways.
"""

from __future__ import annotations

import zlib
import numpy as np
from PIL import Image

SOURCE = "tenki.jp/pref-43-large"

IMAGE_WIDTH = 692
IMAGE_HEIGHT = 519

# Pixel -> lon/lat, including the small cross terms (the projection is very
# slightly rotated, so lon depends on py and lat on px). Sanity check: Fukuoka
# city (130.4017, 33.5904) lands on pixel (269, 225), which is Hakata Bay.
AFFINE = dict(
    lon_px=2.857252e-3,
    lon_py=-1.350123e-6,
    lon_c=129.634248,
    lat_px=-7.448166e-6,
    lat_py=-2.378694e-3,
    lat_c=34.127323,
)

# Cells are integer blocks of source pixels. 4x4 gives ~1.06 km cells, close to
# the radar's own ~4.4 x 3.5 px mesh, and the majority vote across the block is
# what suppresses JPEG ringing at cell edges (a dry snapshot compresses to ~104
# bytes with it, ~6.4 KB without).
#
# Deliberately NOT snapped to Japan's official 1 km mesh: the cell *period*
# matches it, but the phase could not be recovered (boundary edge energy came out
# at only 1.03-1.07x the mean, with JPEG blur and the white coastline overlay
# dominating). An integer block keeps geometry exactly derivable from AFFINE.
BLOCK = 4
GRID_W = -(-IMAGE_WIDTH // BLOCK)    # 173
GRID_H = -(-IMAGE_HEIGHT // BLOCK)   # 130

# Band index -> mm/h interval.
#
# The legend has FOURTEEN swatches but only thirteen labels, and the labels sit
# on band *boundaries* (swatch centres at y=344.5+10k, label centres at
# y=348.5+10k). So each colour denotes a range -- yellow is 15-20 mm/h, not 15 --
# and there is an unlabelled 14th white band below "1" covering 0-1 mm/h. That
# band is the most common precipitation class in the archive.
#
# Band 0 = no echo. Band 15 = masked.
BANDS = [
    {"band": 14, "lower": 100, "upper": None},
    {"band": 13, "lower":  80, "upper": 100},
    {"band": 12, "lower":  50, "upper":  80},
    {"band": 11, "lower":  40, "upper":  50},
    {"band": 10, "lower":  30, "upper":  40},
    {"band":  9, "lower":  20, "upper":  30},
    {"band":  8, "lower":  15, "upper":  20},
    {"band":  7, "lower":  10, "upper":  15},
    {"band":  6, "lower":   8, "upper":  10},
    {"band":  5, "lower":   6, "upper":   8},
    {"band":  4, "lower":   4, "upper":   6},
    {"band":  3, "lower":   2, "upper":   4},
    {"band":  2, "lower":   1, "upper":   2},
    {"band":  1, "lower":   0, "upper":   1},
    {"band":  0, "lower":   0, "upper":   0},
]

BAND_NO_ECHO = 0
BAND_MASKED = 15

# Legend swatch colours, sampled from the legend box at full opacity, highest
# band first. These are NOT the colours that appear on the map -- see BLEND_A.
SWATCHES = np.array([
    [207,   0, 205],  # 14  >=100
    [165,   0,  35],  # 13  80-100
    [250,   2,   2],  # 12  50-80
    [252,  40, 115],  # 11  40-50
    [255, 176, 240],  # 10  30-40
    [255, 157,   0],  #  9  20-30
    [252, 255,   0],  #  8  15-20
    [  1, 130,   4],  #  7  10-15
    [  3,   3, 250],  #  6  8-10
    [  0, 105, 237],  #  5  6-8
    [  0, 190, 253],  #  4  4-6
    [147, 242, 253],  #  3  2-4
    [180, 224, 234],  #  2  1-2
    [252, 252, 253],  #  1  0-1
], dtype=np.float64)

# The radar layer is alpha-blended onto the basemap, so on-map colours are
# washed-out swatches: onMap = A*swatch + (1-A)*basemap.
#
# There are TWO basemaps, and this is what makes a single colour table fail. The
# same band renders differently over land and sea -- measured across 25 images,
# the 0-1 band appears as (204,219,216) on land (442,411 px) versus (191,209,211)
# at sea (216,061 px). Fukuoka has a lot of water in frame (Genkai-nada north,
# Ariake-kai south), so a land-only table silently drops most offshore rain.
BLEND_A = 0.73
BASEMAP_LAND = np.array([104, 110, 100], dtype=np.float64)
BASEMAP_SEA = np.array([53, 70, 78], dtype=np.float64)

MATCH_MAX_DIST = 30    # accept a pixel as a band within this colour distance
BASEMAP_DIST = 12      # within this, treat as bare basemap (no echo)

_MATCH_MAX_D2 = float(MATCH_MAX_DIST ** 2)
_BASEMAP_D2 = float(BASEMAP_DIST ** 2)

# Regions the image paints over the map: timestamp caption (top left), legend box
# (right), tenki.jp logo (bottom right). Cells here are masked, not "no rain" --
# the truth is unknown. All three fall outside Fukuoka prefecture proper: the
# caption covers sea north of the coast, and the legend and logo cover longitudes
# east of 131.35, which is Oita.
MASK_BOXES = [
    (0, 0, 240, 35),
    (615, 290, 692, 490),
    (600, 495, 692, 519),
]

# Reference colours: each swatch blended over each basemap. Order matters only in
# that ties resolve to the earlier entry, matching the TypeScript twin.
_REF_COLORS = []
_REF_BANDS = []
for _i in range(len(SWATCHES)):
    for _bg in (BASEMAP_LAND, BASEMAP_SEA):
        _REF_COLORS.append(BLEND_A * SWATCHES[_i] + (1.0 - BLEND_A) * _bg)
        _REF_BANDS.append(14 - _i)
REF_COLORS = np.array(_REF_COLORS, dtype=np.float64)   # (28, 3)
REF_BANDS = np.array(_REF_BANDS, dtype=np.uint8)       # (28,)


def classify_pixels(rgb: np.ndarray) -> np.ndarray:
    """
    (H, W, 3) uint8 -> (H, W) uint8 band indices.

    Basemap is tested first and wins: a pixel close to bare land or sea is "no
    echo" regardless of which band it happens to sit nearest. Order matters and
    matches the TypeScript twin.
    """
    arr = rgb.astype(np.float64)

    d_land = ((arr - BASEMAP_LAND) ** 2).sum(axis=2)
    d_sea = ((arr - BASEMAP_SEA) ** 2).sum(axis=2)
    is_basemap = (d_land < _BASEMAP_D2) | (d_sea < _BASEMAP_D2)

    # Loop the 28 references rather than broadcasting to (H, W, 28): the latter
    # would allocate ~80 MB per image for no gain.
    best_d = np.full(arr.shape[:2], np.inf, dtype=np.float64)
    best_i = np.zeros(arr.shape[:2], dtype=np.uint8)
    for k in range(REF_COLORS.shape[0]):
        d = ((arr - REF_COLORS[k]) ** 2).sum(axis=2)
        closer = d < best_d
        best_d = np.where(closer, d, best_d)
        best_i = np.where(closer, np.uint8(k), best_i)

    bands = np.where(best_d <= _MATCH_MAX_D2, REF_BANDS[best_i], np.uint8(BAND_NO_ECHO))
    bands = np.where(is_basemap, np.uint8(BAND_NO_ECHO), bands)
    return bands.astype(np.uint8)


def _apply_mask(bands: np.ndarray) -> np.ndarray:
    for x0, y0, x1, y1 in MASK_BOXES:
        bands[y0:y1, x0:x1] = BAND_MASKED
    return bands


def extract_grid(rgb: np.ndarray) -> tuple[np.ndarray, int, int]:
    """
    (H, W, 3) uint8 -> (grid, max_band, echo_cells).

    Each cell takes the *majority* band over its BLOCK x BLOCK pixels. Majority
    rather than max: JPEG ringing throws bright fringe pixels along cell edges,
    and taking the max would promote a whole cell on a single artefact.

    Ties resolve to the lowest band index, matching the TypeScript twin's
    `counts[b] > counts[win]` scan (strict >, so the first maximum holds).
    np.argmax has the same first-wins behaviour.
    """
    h, w = rgb.shape[:2]
    if (w, h) != (IMAGE_WIDTH, IMAGE_HEIGHT):
        raise ValueError(
            f"expected {IMAGE_WIDTH}x{IMAGE_HEIGHT}, got {w}x{h}; "
            "the grid spec is tied to that size and any other would misplace every cell"
        )

    bands = _apply_mask(classify_pixels(rgb))

    # Pad the partial bottom block row (519 = 129*4 + 3) with an out-of-range
    # sentinel so padding contributes to no band's count.
    ph, pw = GRID_H * BLOCK, GRID_W * BLOCK
    padded = np.full((ph, pw), 255, dtype=np.uint8)
    padded[:h, :w] = bands

    blocks = padded.reshape(GRID_H, BLOCK, GRID_W, BLOCK)
    blocks = blocks.transpose(0, 2, 1, 3).reshape(GRID_H * GRID_W, BLOCK * BLOCK)

    counts = np.zeros((GRID_H * GRID_W, 16), dtype=np.int32)
    for v in range(16):
        counts[:, v] = (blocks == v).sum(axis=1)

    grid = counts.argmax(axis=1).astype(np.uint8)

    echo = (grid >= 1) & (grid <= 14)
    max_band = int(grid[echo].max()) if echo.any() else 0
    return grid, max_band, int(echo.sum())


def extract_file(path: str) -> tuple[np.ndarray, int, int]:
    with Image.open(path) as im:
        rgb = np.asarray(im.convert("RGB"))
    return extract_grid(rgb)


# ---------------------------------------------------------------------------
# Codec -- 4 bits per cell (16 values covers bands 0-14 plus masked), then zlib
# ---------------------------------------------------------------------------

def pack_grid(grid: np.ndarray) -> bytes:
    g = grid.astype(np.uint8) & 0x0F
    if g.size % 2:
        g = np.append(g, np.uint8(0))
    return ((g[0::2] << 4) | g[1::2]).tobytes()


def unpack_grid(packed: bytes, cells: int = GRID_W * GRID_H) -> np.ndarray:
    b = np.frombuffer(packed, dtype=np.uint8)
    out = np.empty(b.size * 2, dtype=np.uint8)
    out[0::2] = b >> 4
    out[1::2] = b & 0x0F
    return out[:cells]


def encode_cells(grid: np.ndarray) -> bytes:
    return zlib.compress(pack_grid(grid), 9)


def decode_cells(blob: bytes, cells: int = GRID_W * GRID_H) -> np.ndarray:
    return unpack_grid(zlib.decompress(blob), cells)


# ---------------------------------------------------------------------------
# Geography
# ---------------------------------------------------------------------------

def lonlat_to_pixel(lon: float, lat: float) -> tuple[float, float]:
    a = AFFINE
    det = a["lon_px"] * a["lat_py"] - a["lon_py"] * a["lat_px"]
    d_lon = lon - a["lon_c"]
    d_lat = lat - a["lat_c"]
    px = (a["lat_py"] * d_lon - a["lon_py"] * d_lat) / det
    py = (a["lon_px"] * d_lat - a["lat_px"] * d_lon) / det
    return px, py


def lonlat_to_cell(lon: float, lat: float) -> tuple[int, int] | None:
    """Cell containing a lon/lat, or None if it falls outside the image."""
    px, py = lonlat_to_pixel(lon, lat)
    if not (0 <= px < IMAGE_WIDTH and 0 <= py < IMAGE_HEIGHT):
        return None
    return int(px // BLOCK), int(py // BLOCK)


def cell_to_lonlat(i: int, j: int) -> tuple[float, float]:
    """Centre lon/lat of a cell, for labelling output."""
    a = AFFINE
    px = i * BLOCK + BLOCK / 2
    py = j * BLOCK + BLOCK / 2
    return (
        a["lon_px"] * px + a["lon_py"] * py + a["lon_c"],
        a["lat_px"] * px + a["lat_py"] * py + a["lat_c"],
    )


def read_cell(grid: np.ndarray, cell: tuple[int, int]) -> int:
    i, j = cell
    return int(grid[j * GRID_W + i])


_BAND_BY_INDEX = {b["band"]: b for b in BANDS}


def band_range(band: int) -> dict | None:
    """mm/h interval for a band index. None for masked -- unknown, not zero."""
    if band == BAND_MASKED:
        return None
    return _BAND_BY_INDEX.get(band)


def grid_spec() -> dict:
    """The spec as stored on precip_grids, for creating or matching a row."""
    return {
        "source": SOURCE,
        **AFFINE,
        "block_size": BLOCK,
        "width": GRID_W,
        "height": GRID_H,
        "bands": BANDS,
    }
