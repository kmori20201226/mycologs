import { FastifyInstance } from 'fastify'
import { PublicityType } from '../../../../generated/prisma/client'
import { createPostSchema, postSchema, updatePostSchema } from '../schemas/post'

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:3002'

const CATEGORY_POINTS: Record<string, number> = {
    POTENTIALLY_OFFENSIVE: -2,
    OFF_TOPIC_IMAGE:        -1,
}

const POST_INCLUDE = {
    user: { select: { id: true, name: true, handleName: true, email: true } },
    event: { select: { id: true, name: true, startAt: true } },
    postClubs: { select: { clubId: true } },
} as const

function formatPost(post: any) {
    return { ...post, clubIds: post.postClubs.map((pc: any) => pc.clubId), postClubs: undefined }
}

async function hasActiveSubscription(fastify: FastifyInstance, userId: number): Promise<boolean> {
    const sub = await fastify.prisma.subscription.findFirst({
        where: {
            userId,
            planId: { not: 'free' },
            status: { in: ['active', 'trialing'] },
        },
        select: { id: true },
    })
    return sub !== null
}

async function resolveVisibilityAndClubs(
    fastify: FastifyInstance,
    userId: number,
    requestedVisibility: PublicityType | undefined,
    requestedClubIds: number[] | undefined,
): Promise<{ visibility: PublicityType; clubIds: number[] }> {
    if (requestedVisibility === 'PRIVATE') {
        if (!await hasActiveSubscription(fastify, userId)) {
            throw { statusCode: 403, message: 'サブスクリプションが必要です' }
        }
        return { visibility: 'PRIVATE', clubIds: [] }
    }

    if (requestedVisibility === 'PUBLIC') {
        return { visibility: 'PUBLIC', clubIds: [] }
    }

    if (requestedVisibility === 'CLUBMEMBERONLY') {
        const clubIds = requestedClubIds ?? []
        return { visibility: 'CLUBMEMBERONLY', clubIds }
    }

    // No visibility specified — compute default
    const memberships = await fastify.prisma.clubUser.findMany({
        where: { userId },
        select: { clubId: true },
    })
    if (memberships.length === 0) {
        return { visibility: 'PUBLIC', clubIds: [] }
    }
    return { visibility: 'CLUBMEMBERONLY', clubIds: memberships.map(m => m.clubId) }
}

// Returns a Prisma where-clause fragment that gates visibility for a viewer.
// viewerId=null means anonymous (public only).
function visibilityFilter(viewerId: number | null) {
    if (viewerId === null) {
        return { visibility: 'PUBLIC' as PublicityType }
    }
    return {
        OR: [
            { visibility: 'PUBLIC' as PublicityType },
            { userId: viewerId },
            {
                visibility: 'CLUBMEMBERONLY' as PublicityType,
                postClubs: {
                    some: {
                        club: { clubUsers: { some: { userId: viewerId } } }
                    }
                }
            },
        ],
    }
}

async function getViewerId(request: any): Promise<number | null> {
    try {
        await request.jwtVerify()
        return (request.user as { id: number }).id
    } catch {
        return null
    }
}

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/posts', {
        schema: {
            body: createPostSchema,
            response: {
                201: postSchema,
                403: { type: 'object', properties: { message: { type: 'string' } } },
                422: {
                    type: 'object',
                    properties: {
                        status:   { type: 'string' },
                        category: { type: 'string' },
                        comment:  { type: 'string' },
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { eventId, userId, contents, confirmedModeration, visibility: reqVisibility, clubIds: reqClubIds } = request.body as any

        if (!confirmedModeration) {
            let modResult: any
            try {
                const res = await fetch(`${AI_SERVICE_URL}/api/moderation/evaluate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post: contents }),
                })
                modResult = await res.json()
            } catch {
                modResult = { allowed: true, category: 'PASS', comment: '' }
            }

            if (!modResult.allowed) {
                await fastify.prisma.userLog.create({
                    data: {
                        userId:            Number(userId),
                        point:             Number(modResult.point ?? -5),
                        transactionType:   'POST',
                        rejectionCategory: modResult.category,
                        userPost:          contents,
                        comment:           modResult.comment ?? '',
                        createdBy:         Number(userId),
                    },
                })
                return reply.code(422).send({ status: 'rejected', comment: modResult.comment })
            }

            if (modResult.category !== 'PASS') {
                return reply.code(422).send({
                    status:   'warning',
                    category: modResult.category,
                    comment:  modResult.comment,
                })
            }
        }

        let resolved: { visibility: PublicityType; clubIds: number[] }
        try {
            resolved = await resolveVisibilityAndClubs(fastify, Number(userId), reqVisibility, reqClubIds)
        } catch (e: any) {
            return reply.code(e.statusCode ?? 403).send({ message: e.message })
        }

        const post = await fastify.prisma.post.create({
            data: {
                eventId: eventId ?? null,
                userId: Number(userId),
                contents,
                visibility: resolved.visibility,
                postClubs: { create: resolved.clubIds.map(clubId => ({ clubId })) },
            },
            include: POST_INCLUDE,
        })

        const logCategory = confirmedModeration?.category ?? 'NONE'
        const logPoint    = confirmedModeration && CATEGORY_POINTS[confirmedModeration.category] !== undefined
            ? CATEGORY_POINTS[confirmedModeration.category] as number
            : 0
        await fastify.prisma.userLog.create({
            data: {
                userId:            Number(userId),
                postId:            post.id,
                point:             logPoint,
                transactionType:   'POST',
                rejectionCategory: logCategory as any,
                userPost:          contents,
                comment:           confirmedModeration?.comment ?? '',
                createdBy:         Number(userId),
            },
        })

        return reply.code(201).send(formatPost(post))
    })

    // READ BY ID
    fastify.get('/posts/:id', {
        schema: {
            params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
            response: {
                200: postSchema,
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const viewerId = await getViewerId(request)

        const post = await fastify.prisma.post.findFirst({
            where: { id: Number(id), deletedAt: null, ...visibilityFilter(viewerId) },
            include: POST_INCLUDE,
        })

        if (!post) return reply.code(404).send({ message: 'Post not found' })
        return formatPost(post)
    })

    // LIST ALL
    fastify.get('/posts', {
        schema: {
            querystring: { type: 'object', properties: { eventId: { type: 'integer' } } },
            response: { 200: { type: 'array', items: postSchema } }
        }
    }, async (request, reply) => {
        const { eventId } = request.query as { eventId?: number }
        const viewerId = await getViewerId(request)

        const posts = await fastify.prisma.post.findMany({
            where: {
                deletedAt: null,
                parentPostId: null,
                ...(eventId ? { eventId: Number(eventId) } : {}),
                ...visibilityFilter(viewerId),
            },
            include: POST_INCLUDE,
            orderBy: { createdAt: 'desc' },
        })

        return posts.map(formatPost)
    })

    // UPDATE
    fastify.patch('/posts/:id', {
        schema: {
            params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
            body: updatePostSchema,
            response: {
                200: postSchema,
                403: { type: 'object', properties: { message: { type: 'string' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } },
                422: {
                    type: 'object',
                    properties: {
                        status:   { type: 'string' },
                        category: { type: 'string' },
                        comment:  { type: 'string' },
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const { userId, confirmedModeration, visibility: reqVisibility, clubIds: reqClubIds, ...updateData } = request.body as any

        const existing = await fastify.prisma.post.findUnique({
            where: { id: Number(id) },
            select: { userId: true },
        })
        if (!existing) return reply.code(404).send({ message: 'Post not found' })

        if (userId && Number(userId) !== existing.userId) {
            return reply.code(403).send({ message: 'この投稿を編集する権限がありません' })
        }

        if (updateData.contents && !confirmedModeration) {
            let modResult: any
            try {
                const res = await fetch(`${AI_SERVICE_URL}/api/moderation/evaluate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post: updateData.contents }),
                })
                modResult = await res.json()
            } catch {
                modResult = { allowed: true, category: 'PASS', comment: '' }
            }

            if (!modResult.allowed) {
                if (userId) {
                    await fastify.prisma.userLog.create({
                        data: {
                            userId:            Number(userId),
                            postId:            Number(id),
                            point:             Number(modResult.point ?? -5),
                            transactionType:   'UPDATE',
                            rejectionCategory: modResult.category,
                            userPost:          updateData.contents,
                            comment:           modResult.comment ?? '',
                            createdBy:         Number(userId),
                        },
                    })
                }
                return reply.code(422).send({ status: 'rejected', comment: modResult.comment })
            }

            if (modResult.category !== 'PASS') {
                return reply.code(422).send({
                    status:   'warning',
                    category: modResult.category,
                    comment:  modResult.comment,
                })
            }
        }

        // Resolve visibility change if requested
        let visibilityUpdate: { visibility?: PublicityType; postClubs?: any } = {}
        if (reqVisibility !== undefined || reqClubIds !== undefined) {
            let resolved: { visibility: PublicityType; clubIds: number[] }
            try {
                resolved = await resolveVisibilityAndClubs(fastify, existing.userId, reqVisibility, reqClubIds)
            } catch (e: any) {
                return reply.code(e.statusCode ?? 403).send({ message: e.message })
            }
            visibilityUpdate = {
                visibility: resolved.visibility,
                postClubs: {
                    deleteMany: {},
                    create: resolved.clubIds.map(clubId => ({ clubId })),
                },
            }
        }

        try {
            const post = await fastify.prisma.post.update({
                where: { id: Number(id) },
                data: { ...updateData, ...visibilityUpdate },
                include: POST_INCLUDE,
            })

            if (userId) {
                const logCategory = confirmedModeration?.category ?? 'NONE'
                const logPoint    = confirmedModeration && CATEGORY_POINTS[confirmedModeration.category] !== undefined
                    ? CATEGORY_POINTS[confirmedModeration.category] as number
                    : 0
                await fastify.prisma.userLog.create({
                    data: {
                        userId:            Number(userId),
                        postId:            post.id,
                        point:             logPoint,
                        transactionType:   'UPDATE',
                        rejectionCategory: logCategory as any,
                        userPost:          post.contents,
                        comment:           confirmedModeration?.comment ?? '',
                        createdBy:         Number(userId),
                    },
                })
            }

            return formatPost(post)
        } catch {
            return reply.code(404).send({ message: 'Post not found' })
        }
    })

    // DELETE
    fastify.delete('/posts/:id', {
        schema: {
            params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
            response: {
                200: { type: 'object', properties: { message: { type: 'string' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any

        const existing = await fastify.prisma.post.findUnique({
            where: { id: Number(id) },
            select: { userId: true, contents: true }
        })

        if (!existing) return reply.code(404).send({ message: 'Post not found' })

        try {
            await fastify.prisma.post.update({
                where: { id: Number(id) },
                data: { deletedAt: new Date() }
            })

            await fastify.prisma.userLog.create({
                data: {
                    userId:            existing.userId,
                    postId:            Number(id),
                    point:             0,
                    transactionType:   'DELETE',
                    rejectionCategory: 'NONE',
                    userPost:          existing.contents,
                    comment:           '',
                    createdBy:         existing.userId,
                },
            })

            return { message: 'Post deleted' }
        } catch {
            return reply.code(404).send({ message: 'Post not found' })
        }
    })
}
