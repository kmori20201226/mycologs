import 'dotenv/config'
import Fastify from 'fastify'
import dbPlugin from './plugins/db'
import userRoutes from './routes/users'
import clubRoutes from './routes/clubs'
import roleRoutes from './routes/roles'
import oauthAccountRoutes from './routes/oauth-accounts'

export async function buildApp() {
    const app = Fastify({
        logger: true
    })

    await app.register(dbPlugin)
    await app.register(userRoutes)
    await app.register(clubRoutes)
    await app.register(roleRoutes)
    await app.register(oauthAccountRoutes)

    return app
}