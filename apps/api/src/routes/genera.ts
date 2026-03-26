import { FastifyInstance } from 'fastify'
import { createGenusSchema, genusSchema, updateGenusSchema } from '../schemas/genus'

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/genera', {
        schema: {
            body: createGenusSchema,
            response: {
                201: genusSchema
            }
        }
    }, async (request, reply) => {
        const { name, familyId } = request.body as any

        const genus = await fastify.prisma.genus.create({
            data: { name, familyId },
            include: { family: true }
        })

        return reply.code(201).send(genus)
    })

    // READ BY ID
    fastify.get('/genera/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: genusSchema,
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

        const genus = await fastify.prisma.genus.findUnique({
            where: { id: Number(id) },
            include: { family: true }
        })

        if (!genus) {
            return reply.code(404).send({ message: 'Genus not found' })
        }

        return genus
    })

    // LIST ALL
    fastify.get('/genera', {
        schema: {
            response: {
                200: {
                    type: 'array',
                    items: genusSchema
                }
            }
        }
    }, async (request, reply) => {
        const genera = await fastify.prisma.genus.findMany({
            include: { family: true },
            orderBy: { name: 'asc' }
        })

        return genera
    })

    // UPDATE
    fastify.patch('/genera/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            body: updateGenusSchema,
            response: {
                200: genusSchema,
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
            const genus = await fastify.prisma.genus.update({
                where: { id: Number(id) },
                data: updateData,
                include: { family: true }
            })

            return genus
        } catch (error) {
            return reply.code(404).send({ message: 'Genus not found' })
        }
    })

    // DELETE
    fastify.delete('/genera/:id', {
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
            await fastify.prisma.genus.delete({
                where: { id: Number(id) }
            })

            return { message: 'Genus deleted' }
        } catch (error) {
            return reply.code(404).send({ message: 'Genus not found' })
        }
    })
}