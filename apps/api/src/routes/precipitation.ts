import { FastifyInstance } from 'fastify'
import { createPrecipReader, parseRange } from '../lib/precip-series'
import { getViewerId, visibilityFilter } from '../lib/post-access'

/**
 * Rainfall history for a place on the map, addressed by whatever is standing
 * there — an event, a post.
 *
 * These routes carry no rainfall logic of their own. Each one resolves its
 * subject, checks the viewer may see it, and hands the coordinates to
 * `lib/precip-series`; the series comes back identical whoever asked. What
 * differs per subject is only the lookup, the permission, and the block of
 * subject fields echoed back for the UI to caption itself with.
 *
 * Every figure in the series is a range. See `lib/precip-series` for why, and
 * do not collapse one to a midpoint on the way out.
 */

const RANGE_QUERYSTRING = {
    type: 'object',
    properties: {
        from: { type: 'string' },   // ISO instant, inclusive
        to:   { type: 'string' },   // ISO instant, inclusive
    },
    required: ['from', 'to'],
} as const

const ID_PARAMS = {
    type: 'object',
    properties: { id: { type: 'integer' } },
    required: ['id'],
} as const

export default async function (fastify: FastifyInstance) {

    const precip = createPrecipReader(fastify)

    fastify.get('/events/:id/precipitation', {
        schema: { params: ID_PARAMS, querystring: RANGE_QUERYSTRING },
    }, async (request, reply) => {
        const { id } = request.params as { id: number }
        const { from, to } = request.query as { from: string; to: string }

        const range = parseRange(from, to)
        if (!range.ok) return reply.code(400).send({ message: range.message })

        const event = await fastify.prisma.event.findUnique({ where: { id: Number(id) } })
        if (!event) return reply.code(404).send({ message: 'Event not found' })
        if (event.longitude == null || event.latitude == null) {
            return reply.code(409).send({
                code: 'event_has_no_location',
                message: 'この行事には位置情報が設定されていません。',
            })
        }

        const result = await precip.seriesAt(event.longitude, event.latitude, range.fromAt, range.toAt)
        if (!result.ok) {
            return reply.code(result.refusal.status).send({
                code: result.refusal.code,
                message: result.refusal.message,
            })
        }

        return {
            event: {
                id: event.id,
                name: event.name,
                longitude: event.longitude,
                latitude: event.latitude,
                startAt: event.startAt,
                endAt: event.endAt,
            },
            ...result.series,
        }
    })

    /**
     * Rainfall where a post's photo was taken.
     *
     * Gated by the same visibility rule as the post itself. A post's
     * coordinates are among the things PRIVATE exists to protect, and an
     * ungated series would hand them to anyone who could guess an id — the
     * grid cell centre alone locates the photo to about a kilometre.
     */
    fastify.get('/posts/:id/precipitation', {
        schema: { params: ID_PARAMS, querystring: RANGE_QUERYSTRING },
    }, async (request, reply) => {
        const { id } = request.params as { id: number }
        const { from, to } = request.query as { from: string; to: string }

        const range = parseRange(from, to)
        if (!range.ok) return reply.code(400).send({ message: range.message })

        const viewerId = await getViewerId(request)
        const post = await fastify.prisma.post.findFirst({
            where: { id: Number(id), deletedAt: null, ...visibilityFilter(viewerId) },
            select: {
                id: true, longitude: true, latitude: true, takenAt: true, createdAt: true,
            },
        })
        // 404 rather than 403 for a post the viewer may not see: the existence
        // of a private post is itself not theirs to learn.
        if (!post) return reply.code(404).send({ message: 'Post not found' })

        if (post.longitude == null || post.latitude == null) {
            return reply.code(409).send({
                code: 'post_has_no_location',
                message: 'この投稿には位置情報がありません。',
            })
        }

        const result = await precip.seriesAt(post.longitude, post.latitude, range.fromAt, range.toAt)
        if (!result.ok) {
            return reply.code(result.refusal.status).send({
                code: result.refusal.code,
                message: result.refusal.message,
            })
        }

        return {
            post: {
                id: post.id,
                longitude: post.longitude,
                latitude: post.latitude,
                takenAt: post.takenAt,
                createdAt: post.createdAt,
            },
            ...result.series,
        }
    })
}
