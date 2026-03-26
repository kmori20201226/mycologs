import { FastifyInstance } from 'fastify'
import { createOAuthAccountSchema, oauthAccountSchema } from '../schemas/oauth-account'

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/oauth-accounts', {
        schema: {
            body: createOAuthAccountSchema,
            response: {
                201: oauthAccountSchema
            }
        }
    }, async (request, reply) => {
        const { userId, provider, providerAccountId, accessToken, refreshToken, expiresAt, tokenType, scope, idToken } = request.body as any

        const oauthAccount = await fastify.prisma.oAuthAccount.create({
            data: {
                userId: Number(userId),
                provider,
                providerAccountId,
                accessToken,
                refreshToken,
                expiresAt,
                tokenType,
                scope,
                idToken
            }
        })

        return reply.code(201).send(oauthAccount)
    })

    // READ BY ID
    fastify.get('/oauth-accounts/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            },
            response: {
                200: oauthAccountSchema,
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

        const oauthAccount = await fastify.prisma.oAuthAccount.findUnique({
            where: { id }
        })

        if (!oauthAccount) {
            return reply.code(404).send({ message: 'OAuth Account not found' })
        }

        return oauthAccount
    })

    // LIST ALL FOR USER
    fastify.get('/users/:userId/oauth-accounts', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    userId: { type: 'integer' }
                },
                required: ['userId']
            }
        }
    }, async (request, reply) => {
        const { userId } = request.params as any

        const oauthAccounts = await fastify.prisma.oAuthAccount.findMany({
            where: { userId: Number(userId) }
        })

        return oauthAccounts
    })

    // DELETE
    fastify.delete('/oauth-accounts/:id', async (request, reply) => {
        const { id } = request.params as { id: string }

        try {
            const oauthAccount = await fastify.prisma.oAuthAccount.delete({
                where: { id }
            })

            return reply.code(200).send({ message: 'OAuth Account deleted', oauthAccount })
        } catch (err) {
            console.error('Error deleting oauth account:', err)
            return reply.status(404).send({ error: 'OAuth Account not found' })
        }
    })

}
