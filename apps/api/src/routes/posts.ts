import { FastifyInstance } from 'fastify'
import { createPostSchema, postSchema, updatePostSchema } from '../schemas/post'

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:3002'

const CATEGORY_POINTS: Record<string, number> = {
    POTENTIALLY_OFFENSIVE: -2,
    OFF_TOPIC_IMAGE:        -1,
}

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/posts', {
        schema: {
            body: createPostSchema,
            response: {
                201: postSchema,
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
        const { eventId, userId, contents, confirmedModeration } = request.body as any

        if (!confirmedModeration) {
            // ── Moderation check ────────────────────────────────────────────
            let modResult: any
            try {
                const res = await fetch(`${AI_SERVICE_URL}/api/moderation/evaluate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post: contents }),
                })
                modResult = await res.json()
            } catch {
                // AI service unavailable — allow post through
                modResult = { allowed: true, category: 'PASS', comment: '' }
            }

            if (!modResult.allowed) {
                // Rejected — log and block
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
                // Warning — let the frontend ask the user
                return reply.code(422).send({
                    status:   'warning',
                    category: modResult.category,
                    comment:  modResult.comment,
                })
            }
        }

        // ── Create post ──────────────────────────────────────────────────────
        const post = await fastify.prisma.post.create({
            data: { eventId, userId, contents },
            include: {
                user: { select: { id: true, name: true, handleName: true, email: true } },
                event: { select: { id: true, name: true } }
            }
        })

        // Log the post: confirmed warning gets negative points, PASS gets 0
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

        return reply.code(201).send(post)
    })

    // READ BY ID
    fastify.get('/posts/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: postSchema,
                404: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any

        const post = await fastify.prisma.post.findUnique({
            where: { id: Number(id) },
            include: {
                user: { select: { id: true, name: true, handleName: true, email: true } },
                event: { select: { id: true, name: true } }
            }
        })

        if (!post) {
            return reply.code(404).send({ message: 'Post not found' })
        }

        return post
    })

    // LIST ALL
    fastify.get('/posts', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    eventId: { type: 'integer' }
                }
            },
            response: {
                200: {
                    type: 'array',
                    items: postSchema
                }
            }
        }
    }, async (request, reply) => {
        const { eventId } = request.query as { eventId?: number }

        const posts = await fastify.prisma.post.findMany({
            where: {
                ...(eventId ? { eventId: Number(eventId) } : {})
            },
            include: {
                user: { select: { id: true, name: true, handleName: true, email: true } },
                event: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        return posts
    })

    // UPDATE
    fastify.patch('/posts/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            body: updatePostSchema,
            response: {
                200: postSchema,
                404: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                },
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
        const { userId, confirmedModeration, ...updateData } = request.body as any

        // ── Moderation check (only when contents is changing) ────────────────
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

        // ── Apply update ─────────────────────────────────────────────────────
        try {
            const post = await fastify.prisma.post.update({
                where: { id: Number(id) },
                data: updateData,
                include: {
                    user: { select: { id: true, name: true, handleName: true, email: true } },
                    event: { select: { id: true, name: true } }
                }
            })

            // Log the update
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

            return post
        } catch (error) {
            return reply.code(404).send({ message: 'Post not found' })
        }
    })

    // DELETE
    fastify.delete('/posts/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                },
                404: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any

        // Fetch post first to capture contents and userId for the log
        const existing = await fastify.prisma.post.findUnique({
            where: { id: Number(id) },
            select: { userId: true, contents: true }
        })

        if (!existing) {
            return reply.code(404).send({ message: 'Post not found' })
        }

        try {
            await fastify.prisma.post.delete({
                where: { id: Number(id) }
            })

            // Log the deletion (postId intentionally omitted — post no longer exists)
            await fastify.prisma.userLog.create({
                data: {
                    userId:            existing.userId,
                    point:             0,
                    transactionType:   'DELETE',
                    rejectionCategory: 'NONE',
                    userPost:          existing.contents,
                    comment:           '',
                    createdBy:         existing.userId,
                },
            })

            return { message: 'Post deleted' }
        } catch (error) {
            return reply.code(404).send({ message: 'Post not found' })
        }
    })
}