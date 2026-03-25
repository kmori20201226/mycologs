import fp from 'fastify-plugin'
import { Pool } from 'pg'
import { FastifyInstance } from 'fastify'

declare module 'fastify' {
    interface FastifyInstance {
        db: Pool
    }
}

export default fp(async (fastify: FastifyInstance) => {
    const pool = new Pool({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'password',
        database: 'mycologs',
    })

    fastify.decorate('db', pool)

    fastify.addHook('onClose', async () => {
        await pool.end()
    })
})