import { FastifyInstance } from 'fastify'
import { createUserRequestSchema, replyUserRequestSchema, userRequestSchema } from '../schemas/user-request'

const include = {
    requester: { select: { id: true, name: true, email: true } },
    club: { select: { id: true, name: true, introduction: true, policy: true } },
    replier: { select: { id: true, name: true } }
}

export default async function (fastify: FastifyInstance) {

    // CREATE — authenticated user submits a join request
    fastify.post('/user-requests', {
        schema: {
            body: createUserRequestSchema,
            response: {
                201: userRequestSchema,
                409: { type: 'object', properties: { message: { type: 'string' } } }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { requesterId, clubId, request: requestBody } = request.body as any

        // Prevent duplicate pending request for the same club
        const existing = await fastify.prisma.userRequest.findFirst({
            where: { requesterId, clubId, accepted: null }
        })
        if (existing) {
            return reply.code(409).send({ message: 'A pending request for this club already exists' })
        }

        const userRequest = await fastify.prisma.userRequest.create({
            data: { requesterId, clubId, request: requestBody ?? null },
            include
        })
        return reply.code(201).send(userRequest)
    })

    // LIST — filter by requesterId (own requests) or clubId (manager view)
    fastify.get('/user-requests', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    requesterId:  { type: 'integer' },
                    clubId:       { type: 'integer' },
                    pending:      { type: 'boolean' },
                    requestType:  { type: 'string' }
                }
            },
            response: {
                200: { type: 'array', items: userRequestSchema }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { requesterId, clubId, pending, requestType } = request.query as any

        const where: any = {}
        if (requesterId) where.requesterId = Number(requesterId)
        if (clubId) where.clubId = Number(clubId)
        if (pending === true || pending === 'true') where.accepted = null
        if (requestType) where.request = { path: ['requestType'], equals: requestType }

        const requests = await fastify.prisma.userRequest.findMany({
            where,
            include,
            orderBy: { createdAt: 'desc' }
        })
        return requests
    })

    // GET BY ID
    fastify.get('/user-requests/:id', {
        schema: {
            params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
            response: {
                200: userRequestSchema,
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id } = request.params as any
        const userRequest = await fastify.prisma.userRequest.findUnique({
            where: { id: Number(id) },
            include
        })
        if (!userRequest) return reply.code(404).send({ message: 'Not found' })
        return userRequest
    })

    // ACCEPT — assign user to club, mark accepted
    fastify.post('/user-requests/:id/accept', {
        schema: {
            params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
            body: replyUserRequestSchema,
            response: {
                200: userRequestSchema,
                404: { type: 'object', properties: { message: { type: 'string' } } },
                409: { type: 'object', properties: { message: { type: 'string' } } },
                500: { type: 'object', properties: { message: { type: 'string' } } }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id } = request.params as any
        const { replierId, reply: replyBody } = request.body as any

        const target = await fastify.prisma.userRequest.findUnique({ where: { id: Number(id) } })
        if (!target) return reply.code(404).send({ message: 'Not found' })
        if (target.accepted !== null) return reply.code(409).send({ message: 'Request already resolved' })

        const requestType = (target.request as any)?.requestType

        if (requestType === 'StartClub') {
            // Activate the pending club
            await fastify.prisma.club.update({
                where: { id: target.clubId! },
                data: { status: 'ACTIVE' }
            })
        } else if (requestType === 'Withdraw') {
            // No club side-effect; admin has already anonymised the user via /admin/users/:id/withdraw
        } else if (requestType === 'LeaveFromMember') {
            // Remove from club
            await fastify.prisma.clubUser.deleteMany({
                where: { clubId: target.clubId!, userId: target.requesterId }
            })
        } else {
            // JoinToMember — check plan member limit before adding
            const now = new Date()
            const sub = await fastify.prisma.subscription.findFirst({
                where: { clubId: target.clubId!, status: { in: ['active', 'trialing'] }, accessUntil: { gte: now } }
            })
            const planId = sub?.planId ?? 'free'
            const plan = await fastify.prisma.plan.findUnique({ where: { id: planId } })
            const maxMembers = plan?.maxMembers ?? 5

            if (maxMembers !== -1) {
                const memberCount = await fastify.prisma.clubUser.count({ where: { clubId: target.clubId! } })
                if (memberCount >= maxMembers) {
                    return reply.code(409).send({
                        message: `プラン上限（${maxMembers}名）に達しているため承認できません。プランをアップグレードしてください。`
                    })
                }
            }

            const memberRole = await fastify.prisma.role.findUnique({ where: { name: 'CLUBMEMBER' } })
            if (!memberRole) return reply.code(500).send({ message: 'CLUBMEMBER role not found' })
            await fastify.prisma.clubUser.upsert({
                where: { clubId_userId: { clubId: target.clubId!, userId: target.requesterId } },
                create: { clubId: target.clubId!, userId: target.requesterId, roleId: memberRole.id },
                update: {}
            })
        }

        const updated = await fastify.prisma.userRequest.update({
            where: { id: Number(id) },
            data: { accepted: true, replierId, reply: replyBody ?? null, repliedAt: new Date() },
            include
        })
        return updated
    })

    // DECLINE — mark rejected with optional reply message
    fastify.post('/user-requests/:id/decline', {
        schema: {
            params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
            body: replyUserRequestSchema,
            response: {
                200: userRequestSchema,
                404: { type: 'object', properties: { message: { type: 'string' } } },
                409: { type: 'object', properties: { message: { type: 'string' } } }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id } = request.params as any
        const { replierId, reply: replyBody } = request.body as any

        const target = await fastify.prisma.userRequest.findUnique({ where: { id: Number(id) } })
        if (!target) return reply.code(404).send({ message: 'Not found' })
        if (target.accepted !== null) return reply.code(409).send({ message: 'Request already resolved' })

        const requestType = (target.request as any)?.requestType
        if (requestType === 'StartClub' && target.clubId) {
            // Soft-delete the pending club so it disappears
            await fastify.prisma.club.update({
                where: { id: target.clubId },
                data: { deletedAt: new Date() }
            })
        }

        const updated = await fastify.prisma.userRequest.update({
            where: { id: Number(id) },
            data: { accepted: false, replierId, reply: replyBody ?? null, repliedAt: new Date() },
            include
        })
        return updated
    })

    // DELETE — requester cancels their own pending request
    fastify.delete('/user-requests/:id', {
        schema: {
            params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
            response: {
                200: { type: 'object', properties: { message: { type: 'string' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id } = request.params as any
        try {
            await fastify.prisma.userRequest.delete({ where: { id: Number(id) } })
            return { message: 'Request cancelled' }
        } catch {
            return reply.code(404).send({ message: 'Not found' })
        }
    })
}
