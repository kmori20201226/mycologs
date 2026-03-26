import { FastifyInstance } from 'fastify'
import { createPostSchema, postSchema, updatePostSchema } from '../schemas/post'

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/posts', {
        schema: {
            body: createPostSchema,
            response: {
                201: postSchema
            }
        }
    }, async (request, reply) => {
        const { eventId, userId, contents } = request.body as any

        const post = await fastify.prisma.post.create({
            data: {
                eventId,
                userId,
                contents
            },
            include: {
                user: { select: { id: true, name: true, email: true } },
                event: { select: { id: true, name: true } }
            }
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
                user: { select: { id: true, name: true, email: true } },
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
            response: {
                200: {
                    type: 'array',
                    items: postSchema
                }
            }
        }
    }, async (request, reply) => {
        const posts = await fastify.prisma.post.findMany({
            include: {
                user: { select: { id: true, name: true, email: true } },
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
                }
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
                    user: { select: { id: true, name: true, email: true } },
                    event: { select: { id: true, name: true } }
                }
            })

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

        try {
            await fastify.prisma.post.delete({
                where: { id: Number(id) }
            })

            return { message: 'Post deleted' }
        } catch (error) {
            return reply.code(404).send({ message: 'Post not found' })
        }
    })
}