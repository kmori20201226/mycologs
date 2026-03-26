import { FastifyInstance } from 'fastify'
import { createVoteSchema, voteSchema } from '../schemas/vote'

export default async function (fastify: FastifyInstance) {

    // CREATE (or REPLACE existing vote for same user/post)
    fastify.post('/votes', {
        schema: {
            body: createVoteSchema,
            response: {
                201: voteSchema
            }
        }
    }, async (request, reply) => {
        const { postId, userId, identificationId, probability } = request.body as any

        // Check if user already voted on this post
        const existingVote = await fastify.prisma.vote.findUnique({
            where: {
                postId_userId: {
                    postId,
                    userId
                }
            }
        })

        if (existingVote) {
            // Replace existing vote
            const vote = await fastify.prisma.vote.update({
                where: { id: existingVote.id },
                data: { identificationId, probability },
                include: {
                    user: { select: { id: true, name: true } },
                    post: { select: { id: true, contents: true } },
                    identification: { select: { id: true, confidence: true } }
                }
            })

            // Trigger confidence recalculation for affected identifications
            await updateIdentificationConfidence(fastify, existingVote.identificationId)
            await updateIdentificationConfidence(fastify, identificationId)

            return reply.code(201).send(vote)
        } else {
            // Create new vote
            const vote = await fastify.prisma.vote.create({
                data: {
                    postId,
                    userId,
                    identificationId,
                    probability
                },
                include: {
                    user: { select: { id: true, name: true } },
                    post: { select: { id: true, contents: true } },
                    identification: { select: { id: true, confidence: true } }
                }
            })

            // Trigger confidence recalculation
            await updateIdentificationConfidence(fastify, identificationId)

            return reply.code(201).send(vote)
        }
    })

    // READ BY ID
    fastify.get('/votes/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: voteSchema,
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

        const vote = await fastify.prisma.vote.findUnique({
            where: { id: Number(id) },
            include: {
                user: { select: { id: true, name: true } },
                post: { select: { id: true, contents: true } },
                identification: { select: { id: true, confidence: true } }
            }
        })

        if (!vote) {
            return reply.code(404).send({ message: 'Vote not found' })
        }

        return vote
    })

    // LIST ALL
    fastify.get('/votes', {
        schema: {
            response: {
                200: {
                    type: 'array',
                    items: voteSchema
                }
            }
        }
    }, async (request, reply) => {
        const votes = await fastify.prisma.vote.findMany({
            include: {
                user: { select: { id: true, name: true } },
                post: { select: { id: true, contents: true } },
                identification: { select: { id: true, confidence: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        return votes
    })

    // LIST BY POST
    fastify.get('/posts/:postId/votes', {
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
                    items: voteSchema
                }
            }
        }
    }, async (request, reply) => {
        const { postId } = request.params as any

        const votes = await fastify.prisma.vote.findMany({
            where: { postId: Number(postId) },
            include: {
                user: { select: { id: true, name: true } },
                post: { select: { id: true, contents: true } },
                identification: { select: { id: true, confidence: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        return votes
    })

    // LIST BY USER
    fastify.get('/users/:userId/votes', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    userId: { type: 'integer' }
                },
                required: ['userId']
            },
            response: {
                200: {
                    type: 'array',
                    items: voteSchema
                }
            }
        }
    }, async (request, reply) => {
        const { userId } = request.params as any

        const votes = await fastify.prisma.vote.findMany({
            where: { userId: Number(userId) },
            include: {
                user: { select: { id: true, name: true } },
                post: { select: { id: true, contents: true } },
                identification: { select: { id: true, confidence: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        return votes
    })

    // DELETE
    fastify.delete('/votes/:id', {
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

        const vote = await fastify.prisma.vote.findUnique({
            where: { id: Number(id) }
        })

        if (!vote) {
            return reply.code(404).send({ message: 'Vote not found' })
        }

        await fastify.prisma.vote.delete({
            where: { id: Number(id) }
        })

        // Trigger confidence recalculation
        await updateIdentificationConfidence(fastify, vote.identificationId)

        return { message: 'Vote deleted' }
    })
}

// Helper function to update identification confidence
async function updateIdentificationConfidence(fastify: FastifyInstance, identificationId: number) {
    const votes = await fastify.prisma.vote.findMany({
        where: { identificationId },
        include: { user: { select: { voteWeight: true } } }
    })

    if (votes.length === 0) {
        await fastify.prisma.identification.update({
            where: { id: identificationId },
            data: { confidence: null }
        })
        return
    }

    const totalWeight = votes.reduce((sum, vote) => sum + (vote.user.voteWeight || 1), 0)
    const weightedSum = votes.reduce((sum, vote) => sum + (vote.probability * (vote.user.voteWeight || 1)), 0)
    const confidence = weightedSum / totalWeight

    await fastify.prisma.identification.update({
        where: { id: identificationId },
        data: { confidence }
    })
}