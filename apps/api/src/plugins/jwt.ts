import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export default fp(async (fastify: FastifyInstance) => {
    fastify.register(fastifyJwt, {
        secret: process.env.JWT_SECRET!
    })

    // Decorator to protect routes — add as preHandler to any route that requires login
    fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            await request.jwtVerify()
        } catch {
            reply.code(401).send({ message: 'Unauthorized' })
        }
    })
})

declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    }
}
