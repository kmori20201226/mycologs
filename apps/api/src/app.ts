import 'dotenv/config'
import Fastify from 'fastify'
import dbPlugin from './plugins/db'
import userRoutes from './routes/users'

export async function buildApp() {
    const app = Fastify({
        logger: true
    })

    await app.register(dbPlugin)
    await app.register(userRoutes)

    return app
}