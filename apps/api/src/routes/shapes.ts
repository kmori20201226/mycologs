import { FastifyInstance } from 'fastify'
import { createShapeSchema, shapeSchema, updateShapeSchema } from '../schemas/shape'

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/shapes', {
        schema: {
            body: createShapeSchema,
            response: {
                201: shapeSchema
            }
        }
    }, async (request, reply) => {
        const { name } = request.body as any

        const shape = await fastify.prisma.shape.create({
            data: { name }
        })

        return reply.code(201).send(shape)
    })

    // READ BY ID
    fastify.get('/shapes/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: shapeSchema,
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

        const shape = await fastify.prisma.shape.findUnique({
            where: { id: Number(id) }
        })

        if (!shape) {
            return reply.code(404).send({ message: 'Shape not found' })
        }

        return shape
    })

    // LIST ALL
    fastify.get('/shapes', {
        schema: {
            response: {
                200: {
                    type: 'array',
                    items: shapeSchema
                }
            }
        }
    }, async (request, reply) => {
        const shapes = await fastify.prisma.shape.findMany({
            orderBy: { name: 'asc' }
        })

        return shapes
    })

    // UPDATE
    fastify.patch('/shapes/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            body: updateShapeSchema,
            response: {
                200: shapeSchema,
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
            const shape = await fastify.prisma.shape.update({
                where: { id: Number(id) },
                data: updateData
            })

            return shape
        } catch (error) {
            return reply.code(404).send({ message: 'Shape not found' })
        }
    })

    // DELETE
    fastify.delete('/shapes/:id', {
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
            await fastify.prisma.shape.delete({
                where: { id: Number(id) }
            })

            return { message: 'Shape deleted' }
        } catch (error) {
            return reply.code(404).send({ message: 'Shape not found' })
        }
    })
}