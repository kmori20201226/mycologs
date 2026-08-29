/**
 * Turning tenki.jp Fukuoka radar images into queryable rain-rate data.
 *
 * The source images (692x519 JPEG, one per hour) paint a colour-coded rain-rate
 * mesh over a grey basemap. This module recovers the band each cell was drawn
 * in, packs a whole snapshot into a compressed blob, and maps lon/lat to a cell
 * so a point can be read back out.
 *
 * Every constant below was measured from the images themselves; the derivations
 * are recorded next to each one because none of them are guessable and several
 * are not what the obvious reading of the legend suggests.
 */

import zlib from 'zlib'
import { promisify } from 'util'

const deflate = promisify(zlib.deflate)
const inflate = promisify(zlib.inflate)

export const SOURCE = 'tenki.jp/pref-43-large'

export const IMAGE_WIDTH = 692
export const IMAGE_HEIGHT = 519

/**
 * Pixel -> lon/lat. Note the small cross terms: the projection is very slightly
 * rotated, so lon depends on py and lat on px. Sanity check: Fukuoka city
 * (130.4017, 33.5904) lands on pixel (269, 225), which is Hakata Bay.
 */
export const AFFINE = {
    lonPx:  2.857252e-3,
    lonPy: -1.350123e-6,
    lonC:   129.634248,
    latPx: -7.448166e-6,
    latPy: -2.378694e-3,
    latC:   34.127323,
} as const

/**
 * Cells are integer blocks of source pixels. 4x4 gives ~1.06 km cells, close to
 * the radar's own ~4.4 x 3.5 px mesh, and the majority vote across the block is
 * what suppresses JPEG ringing at cell edges (a dry snapshot compresses to ~104
 * bytes with it, ~6.4 KB without).
 *
 * Deliberately NOT snapped to Japan's official 1 km mesh. The cell *period* is
 * a match for it, but the phase could not be recovered: boundary edge energy
 * came out at only 1.03-1.07x the mean, because JPEG blur and the white
 * coastline/border overlay dominate the signal. An integer block keeps the
 * geometry exactly derivable from AFFINE instead of resting on a bad guess.
 */
export const BLOCK = 4
export const GRID_W = Math.ceil(IMAGE_WIDTH / BLOCK)   // 173
export const GRID_H = Math.ceil(IMAGE_HEIGHT / BLOCK)  // 130

/**
 * Band index -> mm/h interval.
 *
 * The legend has FOURTEEN swatches but only thirteen labels, and the labels sit
 * on band *boundaries*, not centred on the swatches — measured: swatch centres
 * fall at y=344.5+10k, label centres at y=348.5+10k, i.e. on the dividing line.
 * So each colour denotes a range, and there is a 14th unlabelled white band
 * below the "1" label covering 0-1 mm/h. That white band is the single most
 * common precipitation class in the archive and is absent from the legend table
 * in dev-helpers/precipication-collector/precip-fukuoka.py, which drops it.
 *
 * Band 0 = no echo. Band 15 = masked (see MASK_BOXES).
 */
export const BANDS: { band: number; lower: number; upper: number | null }[] = [
    { band: 14, lower: 100, upper: null },
    { band: 13, lower:  80, upper: 100 },
    { band: 12, lower:  50, upper:  80 },
    { band: 11, lower:  40, upper:  50 },
    { band: 10, lower:  30, upper:  40 },
    { band:  9, lower:  20, upper:  30 },
    { band:  8, lower:  15, upper:  20 },
    { band:  7, lower:  10, upper:  15 },
    { band:  6, lower:   8, upper:  10 },
    { band:  5, lower:   6, upper:   8 },
    { band:  4, lower:   4, upper:   6 },
    { band:  3, lower:   2, upper:   4 },
    { band:  2, lower:   1, upper:   2 },
    { band:  1, lower:   0, upper:   1 },
    { band:  0, lower:   0, upper:   0 },
]

export const BAND_NO_ECHO = 0
export const BAND_MASKED = 15

/**
 * Legend swatch colours, sampled from the legend box at full opacity, highest
 * band first. These are NOT the colours that appear on the map — see BLEND.
 */
const SWATCHES: [number, number, number][] = [
    [207,   0, 205],  // 14  >=100
    [165,   0,  35],  // 13  80-100
    [250,   2,   2],  // 12  50-80
    [252,  40, 115],  // 11  40-50
    [255, 176, 240],  // 10  30-40
    [255, 157,   0],  //  9  20-30
    [252, 255,   0],  //  8  15-20
    [  1, 130,   4],  //  7  10-15
    [  3,   3, 250],  //  6  8-10
    [  0, 105, 237],  //  5  6-8
    [  0, 190, 253],  //  4  4-6
    [147, 242, 253],  //  3  2-4
    [180, 224, 234],  //  2  1-2
    [252, 252, 253],  //  1  0-1
]

/**
 * The radar layer is alpha-blended onto the basemap, so on-map colours are
 * washed-out versions of the legend swatches: onMap = A*swatch + (1-A)*basemap.
 * A was fitted from large uniform areas and is consistent across bands.
 *
 * There are TWO basemaps, and this is what makes a single colour table fail.
 * The same band renders differently over land and sea — measured across 25
 * images, the 0-1 band appears as (204,219,216) on land (442,411 px) versus
 * (191,209,211) at sea (216,061 px), and the 2-4 band as (131,208,216) versus
 * (120,198,211). Fukuoka has a lot of water in frame (Genkai-nada to the north,
 * Ariake-kai to the south), so folding sea into one land-only table silently
 * drops most offshore rain.
 */
const BLEND_A = 0.73
const BASEMAP_LAND: [number, number, number] = [104, 110, 100]
const BASEMAP_SEA:  [number, number, number] = [ 53,  70,  78]

/** Colour distance within which a pixel is accepted as belonging to a band. */
const MATCH_MAX_DIST = 30
/** Distance within which a pixel is treated as bare basemap (no echo). */
const BASEMAP_DIST = 12

/**
 * Regions where the image paints over the map: the timestamp caption (top
 * left), the legend box (right), and the tenki.jp logo (bottom right). Cells
 * here are marked masked rather than "no rain" — the truth is unknown.
 *
 * All three fall outside Fukuoka prefecture proper: the caption covers sea north
 * of the coast, and the legend and logo cover longitudes east of 131.35, which
 * is Oita. No Fukuoka land is lost to masking.
 */
const MASK_BOXES: [number, number, number, number][] = [
    [  0,   0, 240,  35],
    [615, 290, 692, 490],
    [600, 495, 692, 519],
]

// ---------------------------------------------------------------------------
// Colour table
// ---------------------------------------------------------------------------

type Ref = { band: number; r: number; g: number; b: number }

const REFERENCE: Ref[] = (() => {
    const out: Ref[] = []
    SWATCHES.forEach((sw, i) => {
        const band = 14 - i
        for (const bg of [BASEMAP_LAND, BASEMAP_SEA]) {
            out.push({
                band,
                r: BLEND_A * sw[0] + (1 - BLEND_A) * bg[0],
                g: BLEND_A * sw[1] + (1 - BLEND_A) * bg[1],
                b: BLEND_A * sw[2] + (1 - BLEND_A) * bg[2],
            })
        }
    })
    return out
})()

function dist2(r: number, g: number, b: number, cr: number, cg: number, cb: number): number {
    const dr = r - cr, dg = g - cg, db = b - cb
    return dr * dr + dg * dg + db * db
}

const BASEMAP_DIST2 = BASEMAP_DIST * BASEMAP_DIST
const MATCH_MAX_DIST2 = MATCH_MAX_DIST * MATCH_MAX_DIST

/** Classify a single RGB pixel to a band index (0 = no echo). */
export function classifyPixel(r: number, g: number, b: number): number {
    if (dist2(r, g, b, BASEMAP_LAND[0], BASEMAP_LAND[1], BASEMAP_LAND[2]) < BASEMAP_DIST2) return BAND_NO_ECHO
    if (dist2(r, g, b, BASEMAP_SEA[0],  BASEMAP_SEA[1],  BASEMAP_SEA[2])  < BASEMAP_DIST2) return BAND_NO_ECHO

    let best = -1
    let bestD = Infinity
    for (const ref of REFERENCE) {
        const d = dist2(r, g, b, ref.r, ref.g, ref.b)
        if (d < bestD) { bestD = d; best = ref.band }
    }
    return bestD <= MATCH_MAX_DIST2 ? best : BAND_NO_ECHO
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function isMasked(x: number, y: number): boolean {
    for (const [x0, y0, x1, y1] of MASK_BOXES) {
        if (x >= x0 && x < x1 && y >= y0 && y < y1) return true
    }
    return false
}

export interface ExtractResult {
    grid: Uint8Array   // GRID_W * GRID_H band indices
    maxBand: number
    echoCells: number
}

/**
 * Extract a band grid from raw RGB pixel data (3 bytes/px, row-major).
 *
 * Each cell takes the majority band over its BLOCKxBLOCK pixels. Majority
 * rather than max: JPEG ringing throws bright fringe pixels along cell edges,
 * and taking the max would promote a whole cell on a single artefact.
 */
export function extractGrid(rgb: Buffer, width = IMAGE_WIDTH, height = IMAGE_HEIGHT): ExtractResult {
    const grid = new Uint8Array(GRID_W * GRID_H)
    const counts = new Int32Array(16)
    let maxBand = 0
    let echoCells = 0

    for (let j = 0; j < GRID_H; j++) {
        const y1 = Math.min((j + 1) * BLOCK, height)
        for (let i = 0; i < GRID_W; i++) {
            const x1 = Math.min((i + 1) * BLOCK, width)
            counts.fill(0)

            for (let y = j * BLOCK; y < y1; y++) {
                for (let x = i * BLOCK; x < x1; x++) {
                    if (isMasked(x, y)) { counts[BAND_MASKED]++; continue }
                    const o = (y * width + x) * 3
                    counts[classifyPixel(rgb[o], rgb[o + 1], rgb[o + 2])]++
                }
            }

            let win = 0
            for (let b = 1; b < 16; b++) if (counts[b] > counts[win]) win = b
            grid[j * GRID_W + i] = win
            if (win >= 1 && win <= 14) {
                echoCells++
                if (win > maxBand) maxBand = win
            }
        }
    }

    return { grid, maxBand, echoCells }
}

// ---------------------------------------------------------------------------
// Codec — 4 bits per cell (16 values covers bands 0-14 plus masked), then zlib
// ---------------------------------------------------------------------------

export function packGrid(grid: Uint8Array): Buffer {
    const out = Buffer.alloc(Math.ceil(grid.length / 2))
    for (let i = 0; i < grid.length; i += 2) {
        const hi = grid[i] & 0x0f
        const lo = i + 1 < grid.length ? grid[i + 1] & 0x0f : 0
        out[i >> 1] = (hi << 4) | lo
    }
    return out
}

export function unpackGrid(packed: Buffer, cells = GRID_W * GRID_H): Uint8Array {
    const grid = new Uint8Array(cells)
    for (let i = 0; i < cells; i++) {
        const byte = packed[i >> 1]
        grid[i] = (i & 1) === 0 ? (byte >> 4) & 0x0f : byte & 0x0f
    }
    return grid
}

// Returns Uint8Array<ArrayBuffer>, not Buffer: that is what Prisma 7's Bytes
// fields require, and Node's Buffer is Uint8Array<ArrayBufferLike>, which does
// not satisfy it (ArrayBufferLike admits SharedArrayBuffer). Copying via an
// explicit ArrayBuffer is what pins the type — `new Uint8Array(buf)` alone still
// infers ArrayBufferLike. ~1.4 KB per snapshot.
export async function encodeCells(grid: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    const deflated = await deflate(packGrid(grid), { level: 9 })
    const out = new Uint8Array(new ArrayBuffer(deflated.byteLength))
    out.set(deflated)
    return out
}

export async function decodeCells(blob: Uint8Array, cells = GRID_W * GRID_H): Promise<Uint8Array> {
    return unpackGrid(await inflate(blob), cells)
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

export interface Cell { i: number; j: number }

/** Invert the affine to find the source pixel for a lon/lat. */
export function lonLatToPixel(lon: number, lat: number): { px: number; py: number } {
    const { lonPx, lonPy, lonC, latPx, latPy, latC } = AFFINE
    const det = lonPx * latPy - lonPy * latPx
    const dLon = lon - lonC
    const dLat = lat - latC
    return {
        px: (latPy * dLon - lonPy * dLat) / det,
        py: (lonPx * dLat - latPx * dLon) / det,
    }
}

/** Cell containing a lon/lat, or null if it falls outside the image. */
export function lonLatToCell(lon: number, lat: number): Cell | null {
    const { px, py } = lonLatToPixel(lon, lat)
    if (px < 0 || px >= IMAGE_WIDTH || py < 0 || py >= IMAGE_HEIGHT) return null
    return { i: Math.floor(px / BLOCK), j: Math.floor(py / BLOCK) }
}

/** Centre lon/lat of a cell — the inverse direction, for labelling output. */
export function cellToLonLat(i: number, j: number): { lon: number; lat: number } {
    const px = i * BLOCK + BLOCK / 2
    const py = j * BLOCK + BLOCK / 2
    const { lonPx, lonPy, lonC, latPx, latPy, latC } = AFFINE
    return {
        lon: lonPx * px + lonPy * py + lonC,
        lat: latPx * px + latPy * py + latC,
    }
}

export function readCell(grid: Uint8Array, cell: Cell): number {
    return grid[cell.j * GRID_W + cell.i]
}

const BAND_BY_INDEX = new Map(BANDS.map(b => [b.band, b]))

/**
 * mm/h interval for a band index. Returns null for masked cells — unknown, which
 * callers must not confuse with zero.
 */
export function bandRange(band: number): { lower: number; upper: number | null } | null {
    if (band === BAND_MASKED) return null
    return BAND_BY_INDEX.get(band) ?? null
}

/** The grid spec as stored on PrecipGrid, for creating or verifying a row. */
export function gridSpec() {
    return {
        source:    SOURCE,
        lonPx:     AFFINE.lonPx,
        lonPy:     AFFINE.lonPy,
        lonC:      AFFINE.lonC,
        latPx:     AFFINE.latPx,
        latPy:     AFFINE.latPy,
        latC:      AFFINE.latC,
        blockSize: BLOCK,
        width:     GRID_W,
        height:    GRID_H,
        bands:     BANDS,
    }
}
