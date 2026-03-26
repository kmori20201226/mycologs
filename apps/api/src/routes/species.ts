import { FastifyInstance } from 'fastify'
import { createSpeciesSchema, speciesSchema, updateSpeciesSchema } from '../schemas/species'

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/species', {
        schema: {
            body: createSpeciesSchema,
            response: {
                201: speciesSchema
            }
        }
    }, async (request, reply) => {
        const { name, genusId } = request.body as any

        const species = await fastify.prisma.species.create({
            data: { name, genusId },
            include: { genus: true }
        })

        return reply.code(201).send(species)
    })

    // READ BY ID
    fastify.get('/species/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: speciesSchema,
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

        const species = await fastify.prisma.species.findUnique({
            where: { id: Number(id) },
            include: { genus: true }
        })

        if (!species) {
            return reply.code(404).send({ message: 'Species not found' })
        }

        return species
    })

    // LIST ALL
    fastify.get('/species', {
        schema: {
            response: {
                200: {
                    type: 'array',
                    items: speciesSchema
                }
            }
        }
    }, async (request, reply) => {
        const species = await fastify.prisma.species.findMany({
            include: { genus: true },
            orderBy: { name: 'asc' }
        })

        return species
    })

    // UPDATE
    fastify.patch('/species/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            body: updateSpeciesSchema,
            response: {
                200: speciesSchema,
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
            const species = await fastify.prisma.species.update({
                where: { id: Number(id) },
                data: updateData,
                include: { genus: true }
            })

            return species
        } catch (error) {
            return reply.code(404).send({ message: 'Species not found' })
        }
    })

    // DELETE
    fastify.delete('/species/:id', {
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
            await fastify.prisma.species.delete({
                where: { id: Number(id) }
            })

            return { message: 'Species deleted' }
        } catch (error) {
            return reply.code(404).send({ message: 'Species not found' })
        }
    })
}