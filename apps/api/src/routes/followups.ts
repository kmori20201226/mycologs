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
        const { parentPostId, userId, contents } = request.body as any

        const post = await fastify.prisma.post.create({
            data: { parentPostId, userId, contents },
            include: {
                user: { select: { id: true, name: true, handleName: true } }
            }
        })

        return reply.code(201).send(post)
    })

    // READ BY ID
    fastify.get('/followups/:id', {
        schema: {
            params: {
                type: 'object',
                properties: { id: { type: 'integer' } },
                required: ['id']
            },
            response: {
                200: followupSchema,
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any

        const post = await fastify.prisma.post.findFirst({
            where: { id: Number(id), deletedAt: null, parentPostId: { not: null } },
            include: {
                user: { select: { id: true, name: true, handleName: true } }
            }
        })

        if (!post) {
            return reply.code(404).send({ message: 'Followup not found' })
        }

        return post
    })

    // LIST ALL
    fastify.get('/followups', {
        schema: {
            response: {
                200: { type: 'array', items: followupSchema }
            }
        }
    }, async (request, reply) => {
        const posts = await fastify.prisma.post.findMany({
            where: { deletedAt: null, parentPostId: { not: null } },
            include: {
                user: { select: { id: true, name: true, handleName: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        return posts
    })

    // LIST BY POST
    fastify.get('/posts/:postId/followups', {
        schema: {
            params: {
                type: 'object',
                properties: { postId: { type: 'integer' } },
                required: ['postId']
            },
            response: {
                200: { type: 'array', items: followupSchema }
            }
        }
    }, async (request, reply) => {
        const { postId } = request.params as any

        const posts = await fastify.prisma.post.findMany({
            where: { parentPostId: Number(postId), deletedAt: null },
            include: {
                user: { select: { id: true, name: true, handleName: true } }
            },
            orderBy: { createdAt: 'asc' }
        })

        return posts
    })

    // UPDATE
    fastify.patch('/followups/:id', {
        schema: {
            params: {
                type: 'object',
                properties: { id: { type: 'integer' } },
                required: ['id']
            },
            body: updateFollowupSchema,
            response: {
                200: followupSchema,
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const updateData = request.body as any

        try {
            const post = await fastify.prisma.post.update({
                where: { id: Number(id) },
                data: updateData,
                include: {
                    user: { select: { id: true, name: true, handleName: true } }
                }
            })

            return post
        } catch {
            return reply.code(404).send({ message: 'Followup not found' })
        }
    })

    // DELETE
    fastify.delete('/followups/:id', {
        schema: {
            params: {
                type: 'object',
                properties: { id: { type: 'integer' } },
                required: ['id']
            },
            response: {
                200: { type: 'object', properties: { message: { type: 'string' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any

        try {
            await fastify.prisma.post.update({
                where: { id: Number(id) },
                data: { deletedAt: new Date() }
            })

            return { message: 'Followup deleted' }
        } catch {
            return reply.code(404).send({ message: 'Followup not found' })
        }
    })
}
