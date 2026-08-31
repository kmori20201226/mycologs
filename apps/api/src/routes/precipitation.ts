import { FastifyInstance } from 'fastify'
import {
    gridSpecFromRow, decodeCells, lonLatToCell, readCell, bandRange, cellToLonLat,
    BAND_MASKED, BAND_NO_ECHO, type PrecipGridSpec,
} from '../lib/precip'

/**
 * Rainfall history for an event's location.
 *
 * Every figure returned is a RANGE, never a single number, and callers must
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
const MAX_RANGE_DAYS = 60

/** JST calendar date (YYYY-MM-DD) that a UTC instant falls on. */
function jstDate(t: Date): string {
    return new Date(t.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

interface DayBucket {
    date: string
    lowerMm: number
    upperMm: number
    wetHours: number
    maskedHours: number
    hours: number
}

export default async function (fastify: FastifyInstance) {

    // The grid spec is immutable once written — a change produces a new row —
    // so it is safe to hold. Avoids re-reading and re-validating it per request.
    let cachedSpec: PrecipGridSpec | null = null
    async function loadSpec(): Promise<PrecipGridSpec | null> {
        if (cachedSpec) return cachedSpec
        const row = await fastify.prisma.precipGrid.findFirst({ orderBy: { id: 'desc' } })
        if (!row) return null
        cachedSpec = gridSpecFromRow(row)
        return cachedSpec
    }

    fastify.get('/events/:id/precipitation', {
        schema: {
            params: {
                type: 'object',
                properties: { id: { type: 'integer' } },
                required: ['id'],
            },
            querystring: {
                type: 'object',
                properties: {
                    from: { type: 'string' },   // ISO instant, inclusive
                    to:   { type: 'string' },   // ISO instant, inclusive
                },
                required: ['from', 'to'],
            },
        },
    }, async (request, reply) => {
        const { id } = request.params as { id: number }
        const { from, to } = request.query as { from: string; to: string }

        const fromAt = new Date(from)
        const toAt = new Date(to)
        if (Number.isNaN(fromAt.getTime()) || Number.isNaN(toAt.getTime())) {
            return reply.code(400).send({ message: 'from and to must be ISO instants' })
        }
        if (toAt <= fromAt) {
            return reply.code(400).send({ message: 'to must be after from' })
        }
        // Each hour in the range costs one blob inflation, so the range is
        // bounded rather than left to the caller.
        const days = (toAt.getTime() - fromAt.getTime()) / 86_400_000
        if (days > MAX_RANGE_DAYS) {
            return reply.code(400).send({ message: `range exceeds ${MAX_RANGE_DAYS} days` })
        }

        const event = await fastify.prisma.event.findUnique({ where: { id: Number(id) } })
        if (!event) return reply.code(404).send({ message: 'Event not found' })
        if (event.longitude == null || event.latitude == null) {
            return reply.code(409).send({
                code: 'event_has_no_location',
                message: 'この行事には位置情報が設定されていません。',
            })
        }

        const spec = await loadSpec()
        if (!spec) {
            return reply.code(503).send({
                code: 'no_precip_grid',
                message: '降水データがまだ取り込まれていません。',
            })
        }

        const cell = lonLatToCell(spec, event.longitude, event.latitude)
        if (!cell) {
            // Outside the radar image entirely — an event in another prefecture.
            return reply.code(409).send({
                code: 'outside_radar_coverage',
                message: 'この場所は降水レーダーの範囲外です。',
            })
        }

        const snapshots = await fastify.prisma.precipSnapshot.findMany({
            where: { gridId: spec.id, observedAt: { gte: fromAt, lte: toAt } },
            orderBy: { observedAt: 'asc' },
            select: { observedAt: true, cells: true },
        })

        const buckets = new Map<string, DayBucket>()
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
            event: {
                id: event.id,
                name: event.name,
                longitude: event.longitude,
                latitude: event.latitude,
                startAt: event.startAt,
                endAt: event.endAt,
            },
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
        }
    })
}
