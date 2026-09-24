import { FastifyInstance } from 'fastify'
import {
    gridSpecFromRow, decodeCells, lonLatToCell, lonLatToPixel, readCell, bandRange,
    cellToLonLat, BAND_MASKED, BAND_NO_ECHO, type PrecipGridSpec, type Cell,
} from './precip'

/**
 * Daily rainfall for one point on the map, over one time span.
 *
 * This is the single place that turns stored snapshots into a series. Every
 * endpoint that shows rainfall — for an event, for a post, for whatever comes
 * next — asks this module and then wraps the answer in whatever the subject is.
 * Enhance the series here and every caller improves at once.
 *
 * Every figure produced is a RANGE, never a single number, and callers must
 * present it that way. Two independent reasons:
 *
 *   - the radar encodes bands, not values. Yellow means 15-20 mm/h; there is no
 *     "15" hiding in the image to recover.
 *   - snapshots are instantaneous rates sampled hourly, so rain that began and
 *     ended between two of them is invisible. Multiplying a rate by an hour is
 *     an assumption, not a measurement.
 *
 * So daily totals are lower/upper bounds on what fell, and the upper bound is
 * itself optimistic about the sampling. Good enough to compare one fortnight
 * against another, which is what fruiting correlation actually needs. Not good
 * enough to quote as "N mm fell".
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** Each hour in a range costs one blob inflation, so the span is bounded. */
export const MAX_RANGE_DAYS = 60

/** JST calendar date (YYYY-MM-DD) that a UTC instant falls on. */
function jstDate(t: Date): string {
    return new Date(t.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

export interface PrecipDay {
    date: string
    lowerMm: number
    upperMm: number
    wetHours: number
    maskedHours: number
    hours: number
}

export interface PrecipSeries {
    cell: { i: number; j: number; centreLongitude: number; centreLatitude: number }
    from: string
    to: string
    hoursExpected: number
    hoursPresent: number
    hoursMissing: number
    maskedHours: number
    wetHours: number
    totalLowerMm: number
    totalUpperMm: number
    daily: PrecipDay[]
}

/** A refusal a route can hand straight back, with the status it should carry. */
export interface PrecipRefusal {
    status: number
    code: string
    message: string
}

export type RangeResult =
    | { ok: true; fromAt: Date; toAt: Date }
    | { ok: false; message: string }

/**
 * Validate a requested span. Kept beside the series builder because the bound
 * exists for the builder's benefit, not the caller's.
 */
export function parseRange(from: string, to: string): RangeResult {
    const fromAt = new Date(from)
    const toAt = new Date(to)
    if (Number.isNaN(fromAt.getTime()) || Number.isNaN(toAt.getTime())) {
        return { ok: false, message: 'from and to must be ISO instants' }
    }
    if (toAt <= fromAt) {
        return { ok: false, message: 'to must be after from' }
    }
    if ((toAt.getTime() - fromAt.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
        return { ok: false, message: `range exceeds ${MAX_RANGE_DAYS} days` }
    }
    return { ok: true, fromAt, toAt }
}

/**
 * Reads series for one Fastify instance, holding the grid specs.
 *
 * A spec is immutable once written — a change produces a new row — so the set
 * is safe to hold. Scoped to the instance rather than the module so that a test
 * building several apps does not share state between them.
 *
 * ALL grids are held, not the newest one. tenki.jp publishes a separate map per
 * prefecture, each with its own affine, and the maps overlap; which one answers
 * for a point is decided per point by `gridFor` below.
 */
export function createPrecipReader(fastify: FastifyInstance) {
    let cachedSpecs: PrecipGridSpec[] | null = null

    async function loadSpecs(): Promise<PrecipGridSpec[]> {
        if (cachedSpecs) return cachedSpecs
        const rows = await fastify.prisma.precipGrid.findMany({ orderBy: { id: 'asc' } })
        if (rows.length === 0) return []   // not cached: the first ingest should take effect
        cachedSpecs = rows.map(gridSpecFromRow)
        return cachedSpecs
    }

    /**
     * How far inside its image a point sits, as a fraction of the half-extent:
     * 1 at the centre, 0 at any edge. The tie-break when several prefectures'
     * maps cover the same point — the map centred on the point is the one whose
     * prefecture it is, and image edges are where the radar composite is
     * weakest.
     */
    function interiority(spec: PrecipGridSpec, lon: number, lat: number): number {
        const { px, py } = lonLatToPixel(spec, lon, lat)
        const imgW = spec.width * spec.blockSize
        const imgH = spec.height * spec.blockSize
        return Math.min(
            Math.min(px, imgW - px) / (imgW / 2),
            Math.min(py, imgH - py) / (imgH / 2),
        )
    }

    /**
     * The grid that should answer for a point, with its cell.
     *
     * Selection is by containment, never by recency. Picking the newest row —
     * which is what this did while Fukuoka was the only prefecture — sends every
     * post to whichever map was ingested last, and coordinates outside it read
     * as no coverage at all. Adding a prefecture would have emptied every
     * existing post's panel with nothing logged.
     *
     * Among the maps that do contain the point, the one holding data for the
     * requested span wins: a prefecture part-way through its backfill must not
     * shadow a neighbour that already has the hours. Interiority breaks the
     * remaining ties.
     */
    async function gridFor(
        lon: number,
        lat: number,
        fromAt: Date,
        toAt: Date,
    ): Promise<{ spec: PrecipGridSpec; cell: Cell } | null> {
        const specs = await loadSpecs()
        const candidates = specs
            .map(spec => ({ spec, cell: lonLatToCell(spec, lon, lat) }))
            .filter((c): c is { spec: PrecipGridSpec; cell: Cell } => c.cell !== null)

        if (candidates.length <= 1) return candidates[0] ?? null

        const counts = await fastify.prisma.precipSnapshot.groupBy({
            by: ['gridId'],
            where: {
                gridId: { in: candidates.map(c => c.spec.id) },
                observedAt: { gte: fromAt, lte: toAt },
            },
            _count: { _all: true },
        })
        const byGrid = new Map(counts.map(c => [c.gridId, c._count._all]))

        candidates.sort((a, b) => {
            const d = (byGrid.get(b.spec.id) ?? 0) - (byGrid.get(a.spec.id) ?? 0)
            if (d !== 0) return d
            return interiority(b.spec, lon, lat) - interiority(a.spec, lon, lat)
        })
        return candidates[0] ?? null
    }

    /**
     * The daily series at a point, or a refusal explaining why there is none.
     * Coordinates must already be known to exist — a subject without a location
     * is the caller's error to report, in the caller's own words.
     */
    async function seriesAt(
        longitude: number,
        latitude: number,
        fromAt: Date,
        toAt: Date,
    ): Promise<{ ok: true; series: PrecipSeries } | { ok: false; refusal: PrecipRefusal }> {
        if ((await loadSpecs()).length === 0) {
            return {
                ok: false,
                refusal: {
                    status: 503,
                    code: 'no_precip_grid',
                    message: '降水データがまだ取り込まれていません。',
                },
            }
        }

        const match = await gridFor(longitude, latitude, fromAt, toAt)
        if (!match) {
            // Outside every ingested map — a prefecture whose radar we do not fetch.
            return {
                ok: false,
                refusal: {
                    status: 409,
                    code: 'outside_radar_coverage',
                    message: 'この場所は降水レーダーの範囲外です。',
                },
            }
        }
        const { spec, cell } = match

        const snapshots = await fastify.prisma.precipSnapshot.findMany({
            where: { gridId: spec.id, observedAt: { gte: fromAt, lte: toAt } },
            orderBy: { observedAt: 'asc' },
            select: { observedAt: true, cells: true },
        })

        const buckets = new Map<string, PrecipDay>()
        let totalLower = 0
        let totalUpper = 0
        let wetHours = 0
        let maskedHours = 0

        for (const snap of snapshots) {
            const band = readCell(spec, await decodeCells(snap.cells, spec), cell)
            const date = jstDate(snap.observedAt)

            let b = buckets.get(date)
            if (!b) {
                b = { date, lowerMm: 0, upperMm: 0, wetHours: 0, maskedHours: 0, hours: 0 }
                buckets.set(date, b)
            }
            b.hours++

            if (band === BAND_MASKED) {
                // Unknown, not zero. Counted separately so a run of masked hours
                // cannot masquerade as a dry spell.
                b.maskedHours++
                maskedHours++
                continue
            }
            const range = bandRange(spec, band)
            if (!range) continue

            // rate (mm/h) x 1 hour -> depth (mm). The dimension changes here.
            b.lowerMm += range.lower
            b.upperMm += range.upper ?? range.lower
            totalLower += range.lower
            totalUpper += range.upper ?? range.lower
            if (band > BAND_NO_ECHO) { b.wetHours++; wetHours++ }
        }

        const centre = cellToLonLat(spec, cell.i, cell.j)
        const expectedHours = Math.round((toAt.getTime() - fromAt.getTime()) / 3_600_000) + 1

        return {
            ok: true,
            series: {
                cell: {
                    i: cell.i,
                    j: cell.j,
                    centreLongitude: centre.lon,
                    centreLatitude: centre.lat,
                },
                from: fromAt.toISOString(),
                to: toAt.toISOString(),
                // Hours the archive simply does not have. Surfaced rather than
                // hidden: a fortnight with 40 missing hours is a weaker statement
                // than one with none, and the caller should be able to say so.
                hoursExpected: expectedHours,
                hoursPresent: snapshots.length,
                hoursMissing: Math.max(0, expectedHours - snapshots.length),
                maskedHours,
                wetHours,
                totalLowerMm: Number(totalLower.toFixed(1)),
                totalUpperMm: Number(totalUpper.toFixed(1)),
                daily: [...buckets.values()]
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map(b => ({
                        ...b,
                        lowerMm: Number(b.lowerMm.toFixed(1)),
                        upperMm: Number(b.upperMm.toFixed(1)),
                    })),
            },
        }
    }

    return { seriesAt }
}
