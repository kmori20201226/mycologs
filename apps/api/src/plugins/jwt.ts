import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export default fp(async (fastify: FastifyInstance) => {
    fastify.register(fastifyJwt, {
        secret: process.env.JWT_SECRET!,
        // Bound the lifetime of every signed token so a leaked one can't be used
        // forever (previously tokens had no exp at all). This applies to all
        // fastify.jwt.sign() calls unless they override it.
        //
        // Must stay LONGER than the frontend auth cookie's max-age (7 days, see
        // apps/web/src/lib/auth.ts setToken) so the browser always drops the
        // cookie *before* the token would be rejected — that keeps expiry a
        // "cookie is gone" signal, which is what SessionExpiryBanner detects.
        // If you shorten this below the cookie's max-age, expired-but-present
        // tokens will start 401ing / falling back to anonymous with no banner.
        sign: { expiresIn: '8d' },
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
