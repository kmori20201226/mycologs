import { FastifyInstance } from 'fastify'
import { createUserSchema, userSchema } from '../schemas/user'
import crypto from 'crypto'

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/users', {
        schema: {
            body: createUserSchema,
            response: {
                201: userSchema
            }
        }
    }, async (request, reply) => {
        const { name, email, password } = request.body as any
        const password_hash = password ? crypto
            .createHash('sha256')
            .update(password)
            .digest('hex') : null

        const user = await fastify.prisma.user.create({
            data: {
                name,
                email,
                password_hash
            }
        })

        return reply.code(201).send(user)
    })

    // LIST ALL
    fastify.get('/users', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    logSince: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { logSince } = request.query as { logSince?: string }

        if (logSince) {
            const since = new Date(logSince)
            const users = await fastify.prisma.user.findMany({
                where: {
                    userLogs: { some: { createdAt: { gte: since } } }
                },
                select: { id: true, name: true, email: true, createdAt: true },
                orderBy: { name: 'asc' }
            })
            return users
        }

        const users = await fastify.prisma.user.findMany({
            select: { id: true, name: true, email: true, createdAt: true },
            orderBy: { name: 'asc' }
        })
        return users
    })

    // READ
    fastify.get('/users/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: userSchema,
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

        const user = await fastify.prisma.user.findUnique({
            where: { id: Number(id) },
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true
            }
        })

        if (!user) {
            return reply.code(404).send({ message: 'Not found' })
        }

        return user
    })

    // UPDATE HANDLE NAME
    fastify.patch('/users/:id/handle-name', {
        schema: {
            params: {
                type: 'object',
                properties: { id: { type: 'integer' } },
                required: ['id']
            },
            body: {
                type: 'object',
                required: ['handleName'],
                properties: { handleName: { type: 'string' } }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'number' },
                        handleName: { type: 'string', nullable: true }
                    }
                },
                400: { type: 'object', properties: { message: { type: 'string' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } },
                409: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const { handleName } = request.body as { handleName: string }

        const trimmed = handleName.trim()
        if (trimmed.length === 0) {
            return reply.code(400).send({ message: 'ハンドルネームには空白以外の文字を含めてください。' })
        }

        const existing = await fastify.prisma.user.findFirst({
            where: { handleName: trimmed, NOT: { id: Number(id) } }
        })
        if (existing) {
            return reply.code(409).send({ message: 'このハンドルネームはすでに使用されています。' })
        }

        try {
            const user = await fastify.prisma.user.update({
                where: { id: Number(id) },
                data: { handleName: trimmed },
                select: { id: true, handleName: true }
            })
            return user
        } catch {
            return reply.code(404).send({ message: 'Not found' })
        }
    })

    // PROFILE — user info + activity stats + recent posts
    fastify.get('/users/:id/profile', {
        schema: {
            params: {
                type: 'object',
                properties: { id: { type: 'integer' } },
                required: ['id']
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'number' },
                        name: { type: 'string' },
                        handleName: { type: 'string', nullable: true },
                        email: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                        postCount: { type: 'number' },
                        identificationCount: { type: 'number' },
                        replyCount: { type: 'number' },
                        recentPosts: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'number' },
                                    contents: { type: 'string' },
                                    createdAt: { type: 'string', format: 'date-time' },
                                    event: {
                                        type: 'object',
                                        nullable: true,
                                        properties: {
                                            id: { type: 'number' },
                                            name: { type: 'string' }
                                        }
                                    },
                                    _count: {
                                        type: 'object',
                                        properties: {
                                            media: { type: 'number' },
                                            identifications: { type: 'number' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                404: {
                    type: 'object',
                    properties: { message: { type: 'string' } }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const uid = Number(id)

        const user = await fastify.prisma.user.findUnique({
            where: { id: uid },
            select: { id: true, name: true, handleName: true, email: true, createdAt: true }
        })
        if (!user) return reply.code(404).send({ message: 'Not found' })

        const [postCount, identificationCount, replyCount, recentPosts] = await Promise.all([
            fastify.prisma.post.count({ where: { userId: uid, parentPostId: null } }),
            fastify.prisma.identification.count({ where: { userId: uid } }),
            fastify.prisma.post.count({ where: { userId: uid, parentPostId: { not: null } } }),
            fastify.prisma.post.findMany({
                where: { userId: uid },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    contents: true,
                    createdAt: true,
                    event: { select: { id: true, name: true } },
                    _count: { select: { media: true, identifications: true } }
                }
            })
        ])

        return { ...user, postCount, identificationCount, replyCount, recentPosts }
    })

    // DELETE /users/:id
    // GET /users/:id/logs — user behaviour logs (ADMIN/DEVELOPER only)
    fastify.get('/users/:id/logs', {
        preHandler: [fastify.authenticate],
        schema: {
            params: {
                type: 'object',
                properties: { id: { type: 'integer' } },
                required: ['id']
            },
            querystring: {
                type: 'object',
                properties: {
                    limit:  { type: 'integer' },
                    offset: { type: 'integer' }
                }
            },
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id:                { type: 'number' },
                            userId:            { type: 'number' },
                            postId:            { type: 'number', nullable: true },
                            point:             { type: 'number' },
                            transactionType:   { type: 'string' },
                            rejectionCategory: { type: 'string', nullable: true },
                            userPost:          { type: 'string' },
                            comment:           { type: 'string' },
                            createdBy:         { type: 'number' },
                            createdAt:         { type: 'string', format: 'date-time' },
                            creator: {
                                type: 'object',
                                properties: {
                                    id:   { type: 'number' },
                                    name: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const { limit = 50, offset = 0 } = request.query as any

        const logs = await fastify.prisma.userLog.findMany({
            where: { userId: Number(id) },
            orderBy: { createdAt: 'desc' },
            take: Number(limit),
            skip: Number(offset),
            include: {
                creator: { select: { id: true, name: true } }
            }
        })

        return logs
    })

    fastify.delete('/users/:id', async (request, reply) => {
        const { id } = request.params as { id: string }

        try {
            const user = await fastify.prisma.user.delete({
                where: { id: Number(id) }
            })

            return reply.code(200).send({ message: 'User deleted', user })
        } catch (err) {
            request.log.error({ err }, 'Error deleting user')
            return reply.status(404).send({ error: 'User not found' })
        }
    })

    // GET credit balance
    fastify.get('/users/:id/credit', {
        schema: {
            params: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
            response: {
                200: { type: 'object', properties: { userId: { type: 'integer' }, credit: { type: 'integer' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const user = await fastify.prisma.user.findUnique({ where: { id: Number(id) }, select: { id: true, credit: true } })
        if (!user) return reply.code(404).send({ message: 'User not found' })
        return { userId: user.id, credit: user.credit }
    })

    // ADJUST credit (admin use / webhook)
    fastify.post('/users/:id/credit/adjust', {
        schema: {
            params: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
            body: {
                type: 'object',
                required: ['delta'],
                properties: { delta: { type: 'integer' } }
            },
            response: {
                200: { type: 'object', properties: { userId: { type: 'integer' }, credit: { type: 'integer' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const { delta } = request.body as { delta: number }

        try {
            const user = await fastify.prisma.user.update({
                where: { id: Number(id) },
                data: { credit: { increment: delta } },
                select: { id: true, credit: true }
            })
            return { userId: user.id, credit: user.credit }
        } catch {
            return reply.code(404).send({ message: 'User not found' })
        }
    })

    // DEBUG — full user record + club memberships
    fastify.get('/debug/users', async (_request, reply) => {
        return fastify.prisma.user.findMany({
            select: { id: true, name: true, email: true },
            orderBy: { id: 'asc' }
        })
    })

    fastify.get('/debug/users/:id', async (request, reply) => {
        const { id } = request.params as any

        const user = await fastify.prisma.user.findUnique({
            where: { id: Number(id) },
            include: {
                clubUsers: {
                    include: {
                        club: true,
                        role: true,
                    }
                }
            }
        })

        if (!user) return reply.code(404).send({ message: 'User not found' })
        return user
    })

}