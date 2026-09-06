/**
 * Reading stored precipitation snapshots.
 *
 * This module READS. It does not extract. Turning radar JPEGs into band grids
 * lives in precipication-collector/precip_extract.py and lives there
 * only — the colour table, the 0.73 blend, the two basemaps, the mask boxes and
 * the voting rules are measured values, and a second copy would drift into a
 * second meaning for the same stored bytes. An earlier TypeScript extractor did
 * exactly that: when Python learned to let white map furniture abstain from the
 * cell vote, the two implementations began disagreeing about images they had
 * previously agreed on. It was deleted rather than kept in step.
 *
 * Nothing here is hardcoded from the source images either. Geometry and the band
 * table come from the precip_grids row a snapshot points at, so a spec change
 * cannot silently reinterpret rows written under the previous one.
 */

import zlib from 'zlib'
import { promisify } from 'util'

const inflate = promisify(zlib.inflate)

/** A band's mm/h interval. `upper: null` means open-ended (the top band). */
export interface BandRange {
    band: number
    lower: number
    upper: number | null
}

/**
 * Geometry and band table, as stored on precip_grids. Pass this to everything
 * below rather than assuming any particular grid.
 */
export interface PrecipGridSpec {
    id: number
    source: string
    /** lon = lonPx*px + lonPy*py + lonC   (the cross terms are small but real) */
    lonPx: number
    lonPy: number
    lonC: number
    /** lat = latPx*px + latPy*py + latC */
    latPx: number
    latPy: number
    latC: number
    /** Cells are integer blockSize x blockSize blocks of source pixels. */
    blockSize: number
    width: number
    height: number
    bands: BandRange[]
}

export const BAND_NO_ECHO = 0
export const BAND_MASKED = 15

export interface Cell {
    i: number
    j: number
}

/**
 * Normalise a precip_grids row into a spec, validating the JSON band table.
 *
 * Prisma types `bands` as JsonValue, so it arrives unchecked. A malformed table
 * would not throw — it would quietly make every reading wrong — so it is
 * validated here, once, at the boundary.
 */
export function gridSpecFromRow(row: {
    id: number
    source: string
    lonPx: number
    lonPy: number
    lonC: number
    latPx: number
    latPy: number
    latC: number
    blockSize: number
    width: number
    height: number
    bands: unknown
}): PrecipGridSpec {
    if (!Array.isArray(row.bands)) {
        throw new Error(`precip_grids.id=${row.id}: bands is not an array`)
    }
    const bands = row.bands.map((b, n) => {
        const o = b as Record<string, unknown>
        if (typeof o?.band !== 'number' || typeof o?.lower !== 'number') {
            throw new Error(`precip_grids.id=${row.id}: bands[${n}] is malformed`)
        }
        return {
            band: o.band,
            lower: o.lower,
            upper: typeof o.upper === 'number' ? o.upper : null,
        }
    })
    return { ...row, bands }
}

/** Inflate a stored `cells` blob into one band index per cell. */
export async function decodeCells(blob: Uint8Array, spec: PrecipGridSpec): Promise<Uint8Array> {
    const packed = await inflate(blob)
    const total = spec.width * spec.height
    const needed = Math.ceil(total / 2)
    if (packed.length < needed) {
        throw new Error(
            `precip_grids.id=${spec.id}: blob holds ${packed.length} bytes, ` +
            `need ${needed} for a ${spec.width}x${spec.height} grid — ` +
            `the snapshot was probably written under a different grid spec`,
        )
    }
    const grid = new Uint8Array(total)
    for (let n = 0; n < total; n++) {
        const byte = packed[n >> 1] as number
        grid[n] = (n & 1) === 0 ? (byte >> 4) & 0x0f : byte & 0x0f
    }
    return grid
}

/** Invert the affine to find the source pixel a lon/lat falls on. */
export function lonLatToPixel(spec: PrecipGridSpec, lon: number, lat: number): { px: number; py: number } {
    const det = spec.lonPx * spec.latPy - spec.lonPy * spec.latPx
    const dLon = lon - spec.lonC
    const dLat = lat - spec.latC
    return {
        px: (spec.latPy * dLon - spec.lonPy * dLat) / det,
        py: (spec.lonPx * dLat - spec.latPx * dLon) / det,
    }
}

/** Cell containing a lon/lat, or null if it falls outside the radar image. */
export function lonLatToCell(spec: PrecipGridSpec, lon: number, lat: number): Cell | null {
    const { px, py } = lonLatToPixel(spec, lon, lat)
    const imgW = spec.width * spec.blockSize
    const imgH = spec.height * spec.blockSize
    if (px < 0 || px >= imgW || py < 0 || py >= imgH) return null
    const i = Math.floor(px / spec.blockSize)
    const j = Math.floor(py / spec.blockSize)
    if (i < 0 || i >= spec.width || j < 0 || j >= spec.height) return null
    return { i, j }
}

/** Centre lon/lat of a cell, for labelling output. */
export function cellToLonLat(spec: PrecipGridSpec, i: number, j: number): { lon: number; lat: number } {
    const px = i * spec.blockSize + spec.blockSize / 2
    const py = j * spec.blockSize + spec.blockSize / 2
    return {
        lon: spec.lonPx * px + spec.lonPy * py + spec.lonC,
        lat: spec.latPx * px + spec.latPy * py + spec.latC,
    }
}

export function readCell(spec: PrecipGridSpec, grid: Uint8Array, cell: Cell): number {
    const v = grid[cell.j * spec.width + cell.i]
    if (v === undefined) {
        throw new Error(`cell (${cell.i}, ${cell.j}) is outside the ${spec.width}x${spec.height} grid`)
    }
    return v
}

/**
 * mm/h interval for a band index, or null when the cell is masked.
 *
 * Masked means *unknown*, not zero: the timestamp caption, legend box and logo
 * are painted over the map, and so are cells lying under the white coastline and
 * border lines, where too little of the cell is readable to call. Callers must
 * distinguish this from band 0 (genuinely no echo) — reporting unknown as "no
 * rain" is the specific mistake this return type exists to prevent.
 */
export function bandRange(spec: PrecipGridSpec, band: number): BandRange | null {
    if (band === BAND_MASKED) return null
    return spec.bands.find(b => b.band === band) ?? null
}

/**
 * Total rainfall bounds over a series of hourly readings.
 *
 * Returns bounds, never a single figure, for two independent reasons: each band
 * is an interval (yellow is 15-20 mm/h, not 15), and these are instantaneous
 * rates sampled once an hour, so rain that began and ended between two snapshots
 * is not represented at all. Note the dimension change — mm/h readings times one
 * hour give mm, a depth.
 */
export function accumulate(
    spec: PrecipGridSpec,
    bands: number[],
): { lowerMm: number; upperMm: number; hours: number; wetHours: number; unknownHours: number } {
    let lowerMm = 0
    let upperMm = 0
    let wetHours = 0
    let unknownHours = 0
    for (const b of bands) {
        const r = bandRange(spec, b)
        if (r === null) {
            unknownHours++
            continue
        }
        if (b > BAND_NO_ECHO) wetHours++
        lowerMm += r.lower
        upperMm += r.upper ?? r.lower
    }
    return { lowerMm, upperMm, hours: bands.length, wetHours, unknownHours }
}
