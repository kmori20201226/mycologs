import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
import fs from 'fs'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import staticFiles from '@fastify/static'
import dbPlugin from './plugins/db'
import jwtPlugin from './plugins/jwt'
import authRoutes from './routes/auth'
import authLineRoutes from './routes/auth-line'
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
import uploadRoutes from './routes/upload'
import aiIdentifyRoutes from './routes/ai-identify'
import aiGeocodeRoutes from './routes/ai-geocode'
import userRequestRoutes from './routes/user-requests'
import subscriptionRoutes from './routes/subscriptions'
import paymentRoutes from './routes/payments'
import stripeWebhookRoutes from './routes/webhook-stripe'
import adminThreadRoutes from './routes/admin-threads'
import announcementRoutes from './routes/announcements'
import planRoutes from './routes/plans'
import siteSettingsRoutes from './routes/site-settings'

const UPLOADS_DIR = path.resolve(__dirname, '../../../data/uploads')

export async function buildApp() {
    const LOG_DIR = path.resolve(__dirname, '../../../logs')
    fs.mkdirSync(LOG_DIR, { recursive: true })

    const app = Fastify({
        logger: {
            transport: {
                target: 'pino/file',
                options: { destination: path.join(LOG_DIR, 'api.log') }
            }
        },
        bodyLimit: 52 * 1024 * 1024, // 52 MB to accommodate 50 MB file uploads
    })

    const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3001')
        .split(',').map(s => s.trim()).filter(Boolean)
    await app.register(cors, {
        origin: (origin, cb) => {
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
            console.warn(`CORS blocked origin: "${origin}" (allowed: ${allowedOrigins.join(', ')})`)
            cb(null, false)
        },
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    })
    await app.register(multipart)
    await app.register(staticFiles, {
        root: UPLOADS_DIR,
        prefix: '/uploads/',
        decorateReply: false,
    })
    await app.register(dbPlugin)
    await app.register(jwtPlugin)
    await app.register(stripeWebhookRoutes)
    await app.register(authRoutes)
    await app.register(authLineRoutes)
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
    await app.register(uploadRoutes)
    await app.register(aiIdentifyRoutes)
    await app.register(aiGeocodeRoutes)
    await app.register(userRequestRoutes)
    await app.register(subscriptionRoutes)
    await app.register(paymentRoutes)
    await app.register(adminThreadRoutes)
    await app.register(announcementRoutes)
    await app.register(planRoutes)
    await app.register(siteSettingsRoutes)

    return app
}