import { FastifyInstance } from 'fastify'
import { planSchema } from '../schemas/plan'

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
                    id:         { type: 'string' },
                    name:       { type: 'string' },
                    maxMembers: { type: 'integer' },
                    priceYen:   { type: 'integer' },
                    active:     { type: 'boolean' },
                    sortOrder:  { type: 'integer' },
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
                id:         data.id,
                name:       data.name,
                maxMembers: data.maxMembers,
                priceYen:   data.priceYen,
                active:     data.active  ?? true,
                sortOrder:  data.sortOrder ?? 0,
            }
        })
        return reply.code(201).send(plan)
    })

    // PATCH — update plan (admin only)
    fastify.patch<{ Params: { id: string } }>('/plans/:id', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    name:       { type: 'string' },
                    maxMembers: { type: 'integer' },
                    priceYen:   { type: 'integer' },
                    active:     { type: 'boolean' },
                    sortOrder:  { type: 'integer' },
                }
            },
            response: { 200: planSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id: userId } = request.user as { id: number }
        if (!await isAdmin(fastify, userId)) return reply.code(403).send({ error: 'Forbidden' })

        const data = request.body as any
        try {
            const plan = await fastify.prisma.plan.update({
                where: { id: request.params.id },
                data: {
                    ...(data.name       !== undefined && { name:       data.name }),
                    ...(data.maxMembers !== undefined && { maxMembers: data.maxMembers }),
                    ...(data.priceYen   !== undefined && { priceYen:   data.priceYen }),
                    ...(data.active     !== undefined && { active:     data.active }),
                    ...(data.sortOrder  !== undefined && { sortOrder:  data.sortOrder }),
                }
            })
            return plan
        } catch {
            return reply.code(404).send({ error: 'Plan not found' })
        }
    })

    // DELETE — remove plan (admin only)
    fastify.delete<{ Params: { id: string } }>('/plans/:id', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id: userId } = request.user as { id: number }
        if (!await isAdmin(fastify, userId)) return reply.code(403).send({ error: 'Forbidden' })

        try {
            await fastify.prisma.plan.delete({ where: { id: request.params.id } })
            return reply.code(204).send()
        } catch {
            return reply.code(404).send({ error: 'Plan not found' })
        }
    })
}
