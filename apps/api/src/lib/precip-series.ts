import { FastifyInstance } from 'fastify'
import {
    gridSpecFromRow, decodeCells, lonLatToCell, readCell, bandRange, cellToLonLat,
    BAND_MASKED, BAND_NO_ECHO, type PrecipGridSpec,
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
 * Reads series for one Fastify instance, holding the grid spec.
 *
 * The spec is immutable once written — a change produces a new row — so it is
 * safe to hold. Scoped to the instance rather than the module so that a test
 * building several apps does not share state between them.
 */
export function createPrecipReader(fastify: FastifyInstance) {
    let cachedSpec: PrecipGridSpec | null = null

    async function loadSpec(): Promise<PrecipGridSpec | null> {
        if (cachedSpec) return cachedSpec
        const row = await fastify.prisma.precipGrid.findFirst({ orderBy: { id: 'desc' } })
        if (!row) return null
        cachedSpec = gridSpecFromRow(row)
        return cachedSpec
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
        const spec = await loadSpec()
        if (!spec) {
            return {
                ok: false,
                refusal: {
                    status: 503,
                    code: 'no_precip_grid',
                    message: '降水データがまだ取り込まれていません。',
                },
            }
        }

        const cell = lonLatToCell(spec, longitude, latitude)
        if (!cell) {
            // Outside the radar image entirely — somewhere in another prefecture.
            return {
                ok: false,
                refusal: {
                    status: 409,
                    code: 'outside_radar_coverage',
                    message: 'この場所は降水レーダーの範囲外です。',
                },
            }
        }

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
