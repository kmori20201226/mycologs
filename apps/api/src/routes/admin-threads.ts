import { FastifyInstance } from 'fastify'
import { adminThreadSchema } from '../schemas/admin-thread'

const includeThread = {
    user:     { select: { id: true, name: true } },
    messages: {
        orderBy: { createdAt: 'asc' as const },
        include: { sender: { select: { id: true, name: true, role: true } } }
    }
}

export default async function (fastify: FastifyInstance) {

    // CREATE thread with first message
    fastify.post('/admin-threads', {
        schema: {
            body: {
                type: 'object',
                required: ['subject', 'body'],
                properties: {
                    subject: { type: 'string' },
                    body:    { type: 'string' }
                }
            },
            response: { 201: adminThreadSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { subject, body } = request.body as { subject: string; body: string }
        const { id: userId } = request.user as { id: number }

        const thread = await fastify.prisma.$transaction(async (tx) => {
            const t = await tx.adminThread.create({
                data: { userId, subject }
            })
            await tx.adminMessage.create({
                data: { threadId: t.id, senderId: userId, body }
            })
            return tx.adminThread.findUniqueOrThrow({
                where: { id: t.id },
                include: includeThread
            })
        })

        return reply.code(201).send(thread)
    })

    // LIST — own threads for users, all threads for admins
    fastify.get('/admin-threads', {
        schema: {
            response: { 200: { type: 'array', items: adminThreadSchema } }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id: userId, role } = request.user as { id: number; role?: string }
        const isAdmin = role === 'ADMIN' || role === 'DEVELOPER' || role === 'MODERATOR'

        const threads = await fastify.prisma.adminThread.findMany({
            where: isAdmin ? {} : { userId },
            include: includeThread,
            orderBy: { updatedAt: 'desc' }
        })

        return threads
    })

    // GET single thread
    fastify.get<{ Params: { id: string } }>('/admin-threads/:id', {
        schema: {
            response: { 200: adminThreadSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const threadId = Number(request.params.id)
        const { id: userId, role } = request.user as { id: number; role?: string }
        const isAdmin = role === 'ADMIN' || role === 'DEVELOPER' || role === 'MODERATOR'

        const thread = await fastify.prisma.adminThread.findUnique({
            where: { id: threadId },
            include: includeThread
        })

        if (!thread) return reply.code(404).send({ error: 'Thread not found' })
        if (!isAdmin && thread.userId !== userId) return reply.code(403).send({ error: 'Forbidden' })

        // Mark unread messages as read
        await fastify.prisma.adminMessage.updateMany({
            where: { threadId, senderId: { not: userId }, readAt: null },
            data:  { readAt: new Date() }
        })

        return thread
    })

    // POST message to existing thread
    fastify.post<{ Params: { id: string } }>('/admin-threads/:id/messages', {
        schema: {
            body: {
                type: 'object',
                required: ['body'],
                properties: { body: { type: 'string' } }
            },
            response: { 201: adminThreadSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const threadId = Number(request.params.id)
        const { id: userId, role } = request.user as { id: number; role?: string }
        const isAdmin = role === 'ADMIN' || role === 'DEVELOPER' || role === 'MODERATOR'
        const { body } = request.body as { body: string }

        const thread = await fastify.prisma.adminThread.findUnique({ where: { id: threadId } })
        if (!thread) return reply.code(404).send({ error: 'Thread not found' })
        if (!isAdmin && thread.userId !== userId) return reply.code(403).send({ error: 'Forbidden' })
        if (thread.status === 'CLOSED') return reply.code(409).send({ error: 'Thread is closed' })

        await fastify.prisma.$transaction([
            fastify.prisma.adminMessage.create({
                data: { threadId, senderId: userId, body }
            }),
            fastify.prisma.adminThread.update({
                where: { id: threadId },
                data:  { updatedAt: new Date() }
            })
        ])

        const updated = await fastify.prisma.adminThread.findUniqueOrThrow({
            where: { id: threadId },
            include: includeThread
        })

        return reply.code(201).send(updated)
    })

    // PATCH status (admin only)
    fastify.patch<{ Params: { id: string } }>('/admin-threads/:id/status', {
        schema: {
            body: {
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', enum: ['OPEN', 'CLOSED'] } }
            },
            response: { 200: adminThreadSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const threadId = Number(request.params.id)
        const { role } = request.user as { role?: string }
        const isAdmin = role === 'ADMIN' || role === 'DEVELOPER' || role === 'MODERATOR'
        if (!isAdmin) return reply.code(403).send({ error: 'Forbidden' })

        const { status } = request.body as { status: 'OPEN' | 'CLOSED' }
        const thread = await fastify.prisma.adminThread.update({
            where: { id: threadId },
            data:  { status },
            include: includeThread
        })

        return thread
    })
}
