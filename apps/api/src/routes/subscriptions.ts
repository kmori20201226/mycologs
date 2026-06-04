import { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { subscriptionSchema, createSubscriptionSchema, updateSubscriptionSchema } from '../schemas/subscription'

const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'http://localhost:3001').split(',')[0].trim()

function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
    return new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
}

const notFound = {
    type: 'object',
    properties: { message: { type: 'string' } }
}

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/subscriptions', {
        schema: {
            body: createSubscriptionSchema,
            response: { 201: subscriptionSchema }
        }
    }, async (request, reply) => {
        const data = request.body as any

        const sub = await fastify.prisma.subscription.create({
            data: {
                userId:             data.userId ?? null,
                clubId:             data.clubId ?? null,
                status:             data.status,
                planId:             data.planId,
                currentPeriodStart: data.currentPeriodStart ? new Date(data.currentPeriodStart) : null,
                currentPeriodEnd:   data.currentPeriodEnd   ? new Date(data.currentPeriodEnd)   : null,
                cancelAtPeriodEnd:  data.cancelAtPeriodEnd  ?? false,
                canceledAt:         data.canceledAt         ? new Date(data.canceledAt)         : null,
                trialStart:         data.trialStart         ? new Date(data.trialStart)         : null,
                trialEnd:           data.trialEnd           ? new Date(data.trialEnd)           : null,
                accessUntil:        data.accessUntil        ? new Date(data.accessUntil)        : null,
            }
        })

        return reply.code(201).send(sub)
    })

    // READ BY ID
    fastify.get('/subscriptions/:id', {
        schema: {
            params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
            response: { 200: subscriptionSchema, 404: notFound }
        }
    }, async (request, reply) => {
        const { id } = request.params as any

        const sub = await fastify.prisma.subscription.findUnique({ where: { id } })
        if (!sub) return reply.code(404).send({ message: 'Subscription not found' })
        return sub
    })

    // LIST BY USER
    fastify.get('/users/:userId/subscriptions', {
        schema: {
            params: { type: 'object', required: ['userId'], properties: { userId: { type: 'integer' } } },
            response: { 200: { type: 'array', items: subscriptionSchema } }
        }
    }, async (request, reply) => {
        const { userId } = request.params as any

        return fastify.prisma.subscription.findMany({
            where: { userId: Number(userId) },
            orderBy: { createdAt: 'desc' }
        })
    })

    // LIST BY CLUB
    fastify.get('/clubs/:clubId/subscriptions', {
        schema: {
            params: { type: 'object', required: ['clubId'], properties: { clubId: { type: 'integer' } } },
            response: { 200: { type: 'array', items: subscriptionSchema } }
        }
    }, async (request, reply) => {
        const { clubId } = request.params as any

        return fastify.prisma.subscription.findMany({
            where: { clubId: Number(clubId) },
            orderBy: { createdAt: 'desc' }
        })
    })

    // ACCESS CHECK — GET /users/:userId/subscription/active or /clubs/:clubId/subscription/active
    fastify.get('/users/:userId/subscription/active', {
        schema: {
            params: { type: 'object', required: ['userId'], properties: { userId: { type: 'integer' } } },
            response: { 200: { type: 'object', properties: { active: { type: 'boolean' } } } }
        }
    }, async (request, reply) => {
        const { userId } = request.params as any
        const now = new Date()
        const sub = await fastify.prisma.subscription.findFirst({
            where: { userId: Number(userId), status: { in: ['active', 'trialing'] }, accessUntil: { gte: now } },
            select: { id: true }
        })
        return { active: sub !== null }
    })

    fastify.get('/clubs/:clubId/subscription/active', {
        schema: {
            params: { type: 'object', required: ['clubId'], properties: { clubId: { type: 'integer' } } },
            response: { 200: { type: 'object', properties: { active: { type: 'boolean' } } } }
        }
    }, async (request, reply) => {
        const { clubId } = request.params as any
        const now = new Date()
        const sub = await fastify.prisma.subscription.findFirst({
            where: { clubId: Number(clubId), status: { in: ['active', 'trialing'] }, accessUntil: { gte: now } },
            select: { id: true }
        })
        return { active: sub !== null }
    })

    // UPDATE
    fastify.patch('/subscriptions/:id', {
        schema: {
            params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
            body: updateSubscriptionSchema,
            response: { 200: subscriptionSchema, 404: notFound }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const data = request.body as any

        try {
            const sub = await fastify.prisma.subscription.update({
                where: { id },
                data: {
                    ...(data.status             !== undefined && { status:             data.status }),
                    ...(data.planId             !== undefined && { planId:             data.planId }),
                    ...(data.currentPeriodStart !== undefined && { currentPeriodStart: data.currentPeriodStart ? new Date(data.currentPeriodStart) : null }),
                    ...(data.currentPeriodEnd   !== undefined && { currentPeriodEnd:   data.currentPeriodEnd   ? new Date(data.currentPeriodEnd)   : null }),
                    ...(data.cancelAtPeriodEnd  !== undefined && { cancelAtPeriodEnd:  data.cancelAtPeriodEnd }),
                    ...(data.canceledAt         !== undefined && { canceledAt:         data.canceledAt         ? new Date(data.canceledAt)         : null }),
                    ...(data.trialStart         !== undefined && { trialStart:         data.trialStart         ? new Date(data.trialStart)         : null }),
                    ...(data.trialEnd           !== undefined && { trialEnd:           data.trialEnd           ? new Date(data.trialEnd)           : null }),
                    ...(data.accessUntil        !== undefined && { accessUntil:        data.accessUntil        ? new Date(data.accessUntil)        : null }),
                }
            })
            return sub
        } catch {
            return reply.code(404).send({ message: 'Subscription not found' })
        }
    })

    // CREATE CHECKOUT SESSION
    fastify.post('/subscriptions/checkout', {
        schema: {
            body: {
                type: 'object',
                required: ['planId'],
                properties: {
                    userId:  { type: 'integer' },
                    clubId:  { type: 'integer' },
                    planId:  { type: 'string' },
                }
            },
            response: {
                200: { type: 'object', properties: { url: { type: 'string' } } },
                400: notFound,
                404: notFound,
            }
        }
    }, async (request, reply) => {
        const { userId, clubId, planId } = request.body as any

        // Resolve owner and get/create Stripe customer
        let stripeCustomerId: string
        let email: string

        if (userId) {
            const user = await fastify.prisma.user.findUnique({
                where: { id: Number(userId) },
                select: { id: true, name: true, email: true, stripeCustomerId: true }
            })
            if (!user) return reply.code(404).send({ message: 'User not found' })

            if (user.stripeCustomerId) {
                stripeCustomerId = user.stripeCustomerId
            } else {
                const isRealEmail = user.email.includes('@') && !user.email.endsWith('@localhost')
                const customer = await getStripe().customers.create({
                    name: user.name,
                    ...(isRealEmail ? { email: user.email } : {})
                })
                stripeCustomerId = customer.id
                await fastify.prisma.user.update({
                    where: { id: user.id },
                    data: { stripeCustomerId }
                })
            }
            email = user.email
        } else if (clubId) {
            const club = await fastify.prisma.club.findUnique({
                where: { id: Number(clubId) },
                select: { id: true, name: true, stripeCustomerId: true }
            })
            if (!club) return reply.code(404).send({ message: 'Club not found' })

            if (club.stripeCustomerId) {
                stripeCustomerId = club.stripeCustomerId
            } else {
                const customer = await getStripe().customers.create({ name: club.name })
                stripeCustomerId = customer.id
                await fastify.prisma.club.update({
                    where: { id: club.id },
                    data: { stripeCustomerId }
                })
            }
            email = ''
        } else {
            return reply.code(400).send({ message: 'userId or clubId required' })
        }

        if (!planId.startsWith('price_')) {
            return reply.code(400).send({ message: 'このプランはまだStripe価格IDが設定されていません。管理者にお問い合わせください。' })
        }

        const ownerMeta = clubId
            ? { clubId: String(clubId), userId: '' }
            : { clubId: '', userId: String(userId) }

        let sessionUrl: string
        try {
            const session = await getStripe().checkout.sessions.create({
                customer: stripeCustomerId,
                mode: 'subscription',
                line_items: [{ price: planId, quantity: 1 }],
                subscription_data: { metadata: ownerMeta },
                success_url: `${FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url:  `${FRONTEND_URL}/subscription/cancel`,
            })
            if (!session.url) {
                return reply.code(400).send({ message: 'Stripeから決済URLが返されませんでした' })
            }
            sessionUrl = session.url
        } catch (err: any) {
            const msg = err?.message ?? 'Stripeエラーが発生しました'
            return reply.code(400).send({ message: msg })
        }

        return { url: sessionUrl }
    })

    // OPEN BILLING PORTAL
    fastify.post('/subscriptions/portal', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    userId: { type: 'integer' },
                    clubId: { type: 'integer' },
                }
            },
            response: {
                200: { type: 'object', properties: { url: { type: 'string' } } },
                404: notFound,
            }
        }
    }, async (request, reply) => {
        const { userId, clubId } = request.body as any

        let stripeCustomerId: string | null = null

        if (userId) {
            const user = await fastify.prisma.user.findUnique({
                where: { id: Number(userId) },
                select: { stripeCustomerId: true }
            })
            if (!user) return reply.code(404).send({ message: 'User not found' })
            stripeCustomerId = user.stripeCustomerId
        } else if (clubId) {
            const club = await fastify.prisma.club.findUnique({
                where: { id: Number(clubId) },
                select: { stripeCustomerId: true }
            })
            if (!club) return reply.code(404).send({ message: 'Club not found' })
            stripeCustomerId = club.stripeCustomerId
        }

        if (!stripeCustomerId) {
            return reply.code(404).send({ message: 'No subscription found' })
        }

        const portalSession = await getStripe().billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: `${FRONTEND_URL}/profile`,
        })

        return { url: portalSession.url }
    })
}
