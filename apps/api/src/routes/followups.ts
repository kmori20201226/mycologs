import { FastifyInstance } from 'fastify'
import { createFollowupSchema, followupSchema, updateFollowupSchema } from '../schemas/followup'

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/followups', {
        schema: {
            body: createFollowupSchema,
            response: {
                201: followupSchema
            }
        }
    }, async (request, reply) => {
        const { postId, userId, contents } = request.body as any

        const followup = await fastify.prisma.followup.create({
            data: {
                postId,
                userId,
                contents
            },
            include: {
                user: { select: { id: true, name: true } },
                post: { select: { id: true, contents: true } }
            }
        })

        return reply.code(201).send(followup)
    })

    // READ BY ID
    fastify.get('/followups/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: followupSchema,
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

        const followup = await fastify.prisma.followup.findUnique({
            where: { id: Number(id) },
            include: {
                user: { select: { id: true, name: true } },
                post: { select: { id: true, contents: true } }
            }
        })

        if (!followup) {
            return reply.code(404).send({ message: 'Followup not found' })
        }

        return followup
    })

    // LIST ALL
    fastify.get('/followups', {
        schema: {
            response: {
                200: {
                    type: 'array',
                    items: followupSchema
                }
            }
        }
    }, async (request, reply) => {
        const followups = await fastify.prisma.followup.findMany({
            include: {
                user: { select: { id: true, name: true } },
                post: { select: { id: true, contents: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        return followups
    })

    // LIST BY POST
    fastify.get('/posts/:postId/followups', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    postId: { type: 'integer' }
                },
                required: ['postId']
            },
            response: {
                200: {
                    type: 'array',
                    items: followupSchema
                }
            }
        }
    }, async (request, reply) => {
        const { postId } = request.params as any

        const followups = await fastify.prisma.followup.findMany({
            where: { postId: Number(postId) },
            include: {
                user: { select: { id: true, name: true } },
                post: { select: { id: true, contents: true } }
            },
            orderBy: { createdAt: 'asc' }
        })

        return followups
    })

    // UPDATE
    fastify.patch('/followups/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            body: updateFollowupSchema,
            response: {
                200: followupSchema,
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
        const updateData = request.body as any

        try {
            const followup = await fastify.prisma.followup.update({
                where: { id: Number(id) },
                data: updateData,
                include: {
                    user: { select: { id: true, name: true } },
                    post: { select: { id: true, contents: true } }
                }
            })

            return followup
        } catch (error) {
            return reply.code(404).send({ message: 'Followup not found' })
        }
    })

    // DELETE
    fastify.delete('/followups/:id', {
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

        try {
            await fastify.prisma.followup.delete({
                where: { id: Number(id) }
            })

            return { message: 'Followup deleted' }
        } catch (error) {
            return reply.code(404).send({ message: 'Followup not found' })
        }
    })
}