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
        const { scientificName, japaneseName, gbifTaxonKey, edibility, genusId } = request.body as any

        const species = await fastify.prisma.species.create({
            data: { scientificName, japaneseName, gbifTaxonKey, edibility, genusId },
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
        // Explicit `select`, and deliberately no `include: { genus: true }`.
        //
        // This route returns every species — 11,513 rows in production — and
        // with the relation included it reliably exhausted the API's heap:
        // "FATAL ERROR: Reached heap limit", 38 seconds after a cold start, on a
        // single request. The process aborts, so one visitor to the public
        // /taxonomy page took the API down for everyone until it restarted.
        //
        // The payload was never the problem: the response is 4.3 MB of JSON
        // (2.6 MB without the join). The cost is in building 11,513 Prisma
        // objects each carrying a materialised genus, which nothing consumes —
        // both /taxonomy and /admin/taxonomy fetch genera separately and join
        // client-side on the scalar genusId. `genus` is optional in
        // speciesSchema and absent from every caller, so dropping it changes no
        // contract.
        //
        // This bounds the cost, it does not remove it. The durable fix is
        // pagination, which needs both taxonomy pages reworked because they
        // filter the full list in the browser.
        const species = await fastify.prisma.species.findMany({
            where: { deletedAt: null },
            orderBy: { scientificName: 'asc' },
            select: {
                id:            true,
                scientificName: true,
                japaneseName:  true,
                gbifTaxonKey:  true,
                edibility:     true,
                genusId:       true,
                createdAt:     true,
                updatedAt:     true,
                deletedAt:     true,
            },
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

    // SOFT DELETE
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
            await fastify.prisma.species.update({
                where: { id: Number(id) },
                data: { deletedAt: new Date() }
            })

            return { message: 'Species deleted' }
        } catch (error) {
            return reply.code(404).send({ message: 'Species not found' })
        }
    })
}
