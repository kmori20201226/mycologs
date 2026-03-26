import 'dotenv/config'
import Fastify from 'fastify'
import dbPlugin from './plugins/db'
import userRoutes from './routes/users'
import clubRoutes from './routes/clubs'
import roleRoutes from './routes/roles'
import oauthAccountRoutes from './routes/oauth-accounts'
import shapeRoutes from './routes/shapes'
import familyRoutes from './routes/families'
import genusRoutes from './routes/genera'
import speciesRoutes from './routes/species'
import eventRoutes from './routes/events'
import postRoutes from './routes/posts'
import followupRoutes from './routes/followups'
import identificationRoutes from './routes/identifications'
import voteRoutes from './routes/votes'
import mediaRoutes from './routes/media'

export async function buildApp() {
    const app = Fastify({
        logger: true
    })

    await app.register(dbPlugin)
    await app.register(userRoutes)
    await app.register(clubRoutes)
    await app.register(roleRoutes)
    await app.register(oauthAccountRoutes)
    await app.register(shapeRoutes)
    await app.register(familyRoutes)
    await app.register(genusRoutes)
    await app.register(speciesRoutes)
    await app.register(eventRoutes)
    await app.register(postRoutes)
    await app.register(followupRoutes)
    await app.register(identificationRoutes)
    await app.register(voteRoutes)
    await app.register(mediaRoutes)

    return app
}