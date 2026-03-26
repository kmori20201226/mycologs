import { FastifyInstance } from 'fastify'
import { createMediaSchema, mediaSchema, updateMediaSchema } from '../schemas/media'

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/media', {
        schema: {
            body: createMediaSchema,
            response: {
                201: mediaSchema
            }
        }
    }, async (request, reply) => {
        const {
            filename,
            originalName,
            url,
            type,
            mimeType,
            size,
            duration,
            width,
            height,
            postId,
            thumbnailUrl,
            isPublic,
            description,
            tags
        } = request.body as any

        const media = await fastify.prisma.media.create({
            data: {
                filename,
                originalName,
                url,
                type,
                mimeType,
                size,
                duration,
                width,
                height,
                postId,
                thumbnailUrl,
                isPublic: isPublic ?? false,
                description,
                tags: tags || []
            },
            include: {
                post: { select: { id: true, contents: true } }
            }
        })

        return reply.code(201).send(media)
    })

    // READ BY ID
    fastify.get('/media/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            },
            response: {
                200: mediaSchema,
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

        const media = await fastify.prisma.media.findUnique({
            where: { id },
            include: {
                post: { select: { id: true, contents: true } }
            }
        })

        if (!media) {
            return reply.code(404).send({ message: 'Media not found' })
        }

        return media
    })

    // LIST ALL
    fastify.get('/media', {
        schema: {
            response: {
                200: {
                    type: 'array',
                    items: mediaSchema
                }
            }
        }
    }, async (request, reply) => {
        const media = await fastify.prisma.media.findMany({
            include: {
                post: { select: { id: true, contents: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        return media
    })

    // LIST BY POST
    fastify.get('/posts/:postId/media', {
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
                    items: mediaSchema
                }
            }
        }
    }, async (request, reply) => {
        const { postId } = request.params as any

        const media = await fastify.prisma.media.findMany({
            where: { postId: Number(postId) },
            include: {
                post: { select: { id: true, contents: true } }
            },
            orderBy: { createdAt: 'asc' }
        })

        return media
    })

    // UPDATE
    fastify.patch('/media/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            },
            body: updateMediaSchema,
            response: {
                200: mediaSchema,
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
            const media = await fastify.prisma.media.update({
                where: { id },
                data: updateData,
                include: {
                    post: { select: { id: true, contents: true } }
                }
            })

            return media
        } catch (error) {
            return reply.code(404).send({ message: 'Media not found' })
        }
    })

    // DELETE (Soft delete)
    fastify.delete('/media/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
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
            await fastify.prisma.media.update({
                where: { id },
                data: { deletedAt: new Date() }
            })

            return { message: 'Media soft deleted' }
        } catch (error) {
            return reply.code(404).send({ message: 'Media not found' })
        }
    })
}