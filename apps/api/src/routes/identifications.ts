import { FastifyInstance } from 'fastify'
import { createIdentificationSchema, identificationSchema, updateIdentificationSchema } from '../schemas/identification'

export default async function (fastify: FastifyInstance) {

    // Helper function to calculate confidence for an identification
    const calculateConfidence = async (identificationId: number) => {
        const votes = await fastify.prisma.vote.findMany({
            where: { identificationId },
            include: { user: { select: { voteWeight: true } } }
        })

        if (votes.length === 0) {
            return null
        }

        const totalWeight = votes.reduce((sum, vote) => sum + (vote.user.voteWeight || 1), 0)
        const weightedSum = votes.reduce((sum, vote) => sum + (vote.probability * (vote.user.voteWeight || 1)), 0)

        return weightedSum / totalWeight
    }

    // CREATE
    fastify.post('/identifications', {
        schema: {
            body: createIdentificationSchema,
            response: {
                201: identificationSchema
            }
        }
    }, async (request, reply) => {
        const { postId, userId, specieId: _specieId, identificationHint, score: _score, description } = request.body as any
        const score = _score ?? (description as any)?.score ?? null

        let specieId: number | null = _specieId ?? null
        if (specieId == null && (description as any)?.scientific_name) {
            const species = await fastify.prisma.species.findFirst({
                where: { scientificName: (description as any).scientific_name, deletedAt: null },
                select: { id: true }
            })
            if (species) specieId = species.id
        }

        const identification = await fastify.prisma.identification.create({
            data: {
                postId,
                userId,
                specieId,
                identificationHint: identificationHint ?? null,
                score,
                description: description ?? null
            },
            include: {
                user: { select: { id: true, name: true, handleName: true } },
                post: { select: { id: true, contents: true } },
                species: { select: { id: true, scientificName: true } }
            }
        })

        // Calculate initial confidence (will be null since no votes yet)
        const confidence = await calculateConfidence(identification.id)
        await fastify.prisma.identification.update({
            where: { id: identification.id },
            data: { confidence }
        })

        return reply.code(201).send({ ...identification, confidence })
    })

    // READ BY ID
    fastify.get('/identifications/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: identificationSchema,
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

        const identification = await fastify.prisma.identification.findFirst({
            where: { id: Number(id), deletedAt: null },
            include: {
                user: { select: { id: true, name: true, handleName: true } },
                post: { select: { id: true, contents: true } },
                species: { select: { id: true, scientificName: true } }
            }
        })

        if (!identification) {
            return reply.code(404).send({ message: 'Identification not found' })
        }

        // Recalculate confidence on-the-fly
        const confidence = await calculateConfidence(identification.id)

        return { ...identification, confidence }
    })

    // LIST ALL
    fastify.get('/identifications', {
        schema: {
            response: {
                200: {
                    type: 'array',
                    items: identificationSchema
                }
            }
        }
    }, async (request, reply) => {
        const identifications = await fastify.prisma.identification.findMany({
            where: { deletedAt: null },
            include: {
                user: { select: { id: true, name: true, handleName: true } },
                post: { select: { id: true, contents: true } },
                species: { select: { id: true, scientificName: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        // Calculate confidence for each identification
        const identificationsWithConfidence = await Promise.all(
            identifications.map(async (identification) => {
                const confidence = await calculateConfidence(identification.id)
                return { ...identification, confidence }
            })
        )

        return identificationsWithConfidence
    })

    // LIST BY POST
    fastify.get('/posts/:postId/identifications', {
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
                    items: identificationSchema
                }
            }
        }
    }, async (request, reply) => {
        const { postId } = request.params as any

        const identifications = await fastify.prisma.identification.findMany({
            where: { postId: Number(postId), deletedAt: null },
            include: {
                user: { select: { id: true, name: true, handleName: true } },
                post: { select: { id: true, contents: true } },
                species: { select: { id: true, scientificName: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        // Calculate confidence for each identification
        const identificationsWithConfidence = await Promise.all(
            identifications.map(async (identification) => {
                const confidence = await calculateConfidence(identification.id)
                return { ...identification, confidence }
            })
        )

        return identificationsWithConfidence
    })

    // UPDATE
    fastify.patch('/identifications/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            body: updateIdentificationSchema,
            response: {
                200: identificationSchema,
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
            const identification = await fastify.prisma.identification.update({
                where: { id: Number(id) },
                data: updateData,
                include: {
                    user: { select: { id: true, name: true, handleName: true } },
                    post: { select: { id: true, contents: true } },
                    species: { select: { id: true, scientificName: true } }
                }
            })

            // Recalculate confidence
            const confidence = await calculateConfidence(identification.id)

            return { ...identification, confidence }
        } catch (error) {
            return reply.code(404).send({ message: 'Identification not found' })
        }
    })

    // ACCEPT — toggles accepted on this identification only
    fastify.post('/identifications/:id/accept', {
        schema: {
            params: {
                type: 'object',
                properties: { id: { type: 'integer' } },
                required: ['id']
            },
            response: {
                200: identificationSchema,
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any

        const target = await fastify.prisma.identification.findFirst({
            where: { id: Number(id), deletedAt: null }
        })
        if (!target) return reply.code(404).send({ message: 'Identification not found' })

        const identification = await fastify.prisma.identification.update({
            where: { id: Number(id) },
            data: { accepted: !target.accepted },
            include: {
                user: { select: { id: true, name: true, handleName: true } },
                post: { select: { id: true, contents: true } },
                species: { select: { id: true, scientificName: true } }
            }
        })

        const confidence = await calculateConfidence(identification.id)
        return { ...identification, confidence }
    })

    // DELETE
    fastify.delete('/identifications/:id', {
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
            await fastify.prisma.identification.update({
                where: { id: Number(id) },
                data: { deletedAt: new Date() }
            })

            return { message: 'Identification deleted' }
        } catch (error) {
            return reply.code(404).send({ message: 'Identification not found' })
        }
    })
}