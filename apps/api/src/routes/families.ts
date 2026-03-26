import { FastifyInstance } from 'fastify'
import { createFamilySchema, familySchema, updateFamilySchema } from '../schemas/family'

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/families', {
        schema: {
            body: createFamilySchema,
            response: {
                201: familySchema
            }
        }
    }, async (request, reply) => {
        const { name, shapeId } = request.body as any

        const family = await fastify.prisma.family.create({
            data: { name, shapeId },
            include: { shape: true }
        })

        return reply.code(201).send(family)
    })

    // READ BY ID
    fastify.get('/families/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: familySchema,
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

        const family = await fastify.prisma.family.findUnique({
            where: { id: Number(id) },
            include: { shape: true }
        })

        if (!family) {
            return reply.code(404).send({ message: 'Family not found' })
        }

        return family
    })

    // LIST ALL
    fastify.get('/families', {
        schema: {
            response: {
                200: {
                    type: 'array',
                    items: familySchema
                }
            }
        }
    }, async (request, reply) => {
        const families = await fastify.prisma.family.findMany({
            include: { shape: true },
            orderBy: { name: 'asc' }
        })

        return families
    })

    // UPDATE
    fastify.patch('/families/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            body: updateFamilySchema,
            response: {
                200: familySchema,
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
            const family = await fastify.prisma.family.update({
                where: { id: Number(id) },
                data: updateData,
                include: { shape: true }
            })

            return family
        } catch (error) {
            return reply.code(404).send({ message: 'Family not found' })
        }
    })

    // DELETE
    fastify.delete('/families/:id', {
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
            await fastify.prisma.family.delete({
                where: { id: Number(id) }
            })

            return { message: 'Family deleted' }
        } catch (error) {
            return reply.code(404).send({ message: 'Family not found' })
        }
    })
}