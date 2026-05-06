import { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { planSchema } from '../schemas/plan'

function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
    return new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
}

const ADMIN_ROLES = ['ADMIN', 'DEVELOPER', 'MODERATOR']

async function isAdmin(fastify: FastifyInstance, userId: number): Promise<boolean> {
    const user = await fastify.prisma.user.findUnique({
        where: { id: userId }, select: { role: true }
    })
    return ADMIN_ROLES.includes(user?.role ?? '')
}

const FREE_PLAN_ID = 'free'

export default async function (fastify: FastifyInstance) {

    // GET all active plans — public
    fastify.get('/plans', {
        schema: { response: { 200: { type: 'array', items: planSchema } } }
    }, async () => {
        return fastify.prisma.plan.findMany({
            where: { active: true },
            orderBy: { sortOrder: 'asc' }
        })
    })

    // GET effective plan for a club (active subscription → plan, else free)
    fastify.get<{ Params: { clubId: string } }>('/clubs/:clubId/member-limit', {
        schema: {
            response: {
                200: {
                    type: 'object',
                    properties: {
                        planId:     { type: 'string' },
                        planName:   { type: 'string' },
                        maxMembers: { type: 'integer' },
                    }
                }
            }
        }
    }, async (request) => {
        const clubId = Number(request.params.clubId)
        const now = new Date()
        const sub = await fastify.prisma.subscription.findFirst({
            where: { clubId, status: { in: ['active', 'trialing'] }, accessUntil: { gte: now } }
        })
        const planId = sub?.planId ?? FREE_PLAN_ID
        const plan = await fastify.prisma.plan.findUnique({ where: { id: planId } })
        return {
            planId,
            planName:   plan?.name       ?? 'フリー',
            maxMembers: plan?.maxMembers ?? 5,
        }
    })

    // POST — create plan (admin only)
    fastify.post('/plans', {
        schema: {
            body: {
                type: 'object',
                required: ['id', 'name', 'maxMembers', 'priceYen'],
                properties: {
                    id:               { type: 'string' },
                    name:             { type: 'string' },
                    maxMembers:       { type: 'integer' },
                    priceYen:         { type: 'integer' },
                    creditsPerPeriod: { type: 'integer' },
                    active:           { type: 'boolean' },
                    sortOrder:        { type: 'integer' },
                }
            },
            response: { 201: planSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id: userId } = request.user as { id: number }
        if (!await isAdmin(fastify, userId)) { void (reply as any).code(403).send({ error: 'Forbidden' }); return }

        const data = request.body as any
        const plan = await fastify.prisma.plan.create({
            data: {
                id:               data.id,
                name:             data.name,
                maxMembers:       data.maxMembers,
                priceYen:         data.priceYen,
                creditsPerPeriod: data.creditsPerPeriod ?? 0,
                active:           data.active  ?? true,
                sortOrder:        data.sortOrder ?? 0,
            }
        })
        return reply.code(201).send(plan)
    })

    // PATCH — update plan (admin only); accepts new `id` to rename Stripe price ID
    fastify.patch<{ Params: { id: string } }>('/plans/:id', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    id:               { type: 'string' },
                    name:             { type: 'string' },
                    maxMembers:       { type: 'integer' },
                    priceYen:         { type: 'integer' },
                    creditsPerPeriod: { type: 'integer' },
                    active:           { type: 'boolean' },
                    sortOrder:  { type: 'integer' },
                }
            },
            response: { 200: planSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id: userId } = request.user as { id: number }
        if (!await isAdmin(fastify, userId)) return reply.code(403).send({ error: 'Forbidden' })

        const oldId = request.params.id
        const data = request.body as any
        try {
            const plan = await fastify.prisma.plan.update({
                where: { id: oldId },
                data: {
                    ...(data.id               !== undefined && { id:               data.id }),
                    ...(data.name             !== undefined && { name:             data.name }),
                    ...(data.maxMembers       !== undefined && { maxMembers:       data.maxMembers }),
                    ...(data.priceYen         !== undefined && { priceYen:         data.priceYen }),
                    ...(data.creditsPerPeriod !== undefined && { creditsPerPeriod: data.creditsPerPeriod }),
                    ...(data.active           !== undefined && { active:           data.active }),
                    ...(data.sortOrder        !== undefined && { sortOrder:        data.sortOrder }),
                }
            })
            // If the ID changed, migrate existing subscription references
            if (data.id && data.id !== oldId) {
                await fastify.prisma.subscription.updateMany({
                    where: { planId: oldId },
                    data:  { planId: data.id }
                })
            }
            return plan
        } catch {
            return reply.code(404).send({ error: 'Plan not found' })
        }
    })

    // GET /plans/:id/stripe-sync — fetch name and priceYen from Stripe (admin only)
    fastify.get<{ Params: { id: string } }>('/plans/:id/stripe-sync', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id: userId } = request.user as { id: number }
        if (!await isAdmin(fastify, userId)) return reply.code(403).send({ error: 'Forbidden' })

        try {
            const price = await getStripe().prices.retrieve(request.params.id, { expand: ['product'] })
            const product = price.product as { name: string }
            return { name: product.name, priceYen: price.unit_amount ?? 0 }
        } catch (err: any) {
            const msg = err?.message ?? 'Stripe price not found'
            return reply.code(404).send({ message: msg })
        }
    })

    // DELETE — remove plan (admin only)
    fastify.delete<{ Params: { id: string } }>('/plans/:id', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id: userId } = request.user as { id: number }
        if (!await isAdmin(fastify, userId)) return reply.code(403).send({ error: 'Forbidden' })

        const existing = await fastify.prisma.plan.findUnique({ where: { id: request.params.id } })
        if (!existing) return reply.code(404).send({ error: 'Plan not found' })
        await fastify.prisma.plan.delete({ where: { id: request.params.id } })
        return reply.code(200).send({})
    })
}
