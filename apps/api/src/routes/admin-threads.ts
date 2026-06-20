import { FastifyInstance } from 'fastify'
import { adminThreadSchema } from '../schemas/admin-thread'
import { escapeHtml } from '../lib/mail'
import { notifyUser } from '../lib/notify'

const includeThread = {
    user:     { select: { id: true, name: true } },
    messages: {
        orderBy: { createdAt: 'asc' as const },
        include: { sender: { select: { id: true, name: true, role: true } } }
    }
}

const ADMIN_ROLES = ['ADMIN', 'DEVELOPER', 'MODERATOR']

async function isAdmin(fastify: FastifyInstance, userId: number): Promise<boolean> {
    const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
    })
    return ADMIN_ROLES.includes(user?.role ?? '')
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
        const { id: userId } = request.user as { id: number }
        const admin = await isAdmin(fastify, userId)

        const threads = await fastify.prisma.adminThread.findMany({
            where: admin ? {} : { userId },
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
        const { id: userId } = request.user as { id: number }
        const admin = await isAdmin(fastify, userId)

        const thread = await fastify.prisma.adminThread.findUnique({
            where: { id: threadId },
            include: includeThread
        })

        if (!thread) return reply.code(404).send({ error: 'Thread not found' })
        if (!admin && thread.userId !== userId) return reply.code(403).send({ error: 'Forbidden' })

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
        const { id: userId } = request.user as { id: number }
        const admin = await isAdmin(fastify, userId)
        const { body } = request.body as { body: string }

        const thread = await fastify.prisma.adminThread.findUnique({ where: { id: threadId } })
        if (!thread) return reply.code(404).send({ error: 'Thread not found' })
        if (!admin && thread.userId !== userId) return reply.code(403).send({ error: 'Forbidden' })
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

        // Notify the thread owner when an admin replies (fire-and-forget): email
        // if they have one, otherwise a LINE push for LINE-only users. notifyUser
        // looks the contact details up itself, so nothing leaks into the response.
        if (admin && thread.userId !== userId) {
            const base = (process.env.APP_URL ?? (process.env.CORS_ORIGINS ?? '').split(',')[0]!.trim()).replace(/\/$/, '')
            const url  = `${base}/about`
            notifyUser(fastify.prisma, thread.userId, {
                subject: '【Mycologs】お問い合わせに返信がありました',
                html: `<p>お問い合わせ「${escapeHtml(thread.subject)}」に管理者からの返信が届きました。</p><p><a href="${escapeHtml(url)}">サイトで確認する</a></p>`,
                text: `お問い合わせ「${thread.subject}」に管理者からの返信が届きました。\n${url}`,
            }, request.log).catch(err => request.log.error({ err }, 'Failed to notify thread owner of admin reply'))
        }

        return reply.code(201).send(updated)
    })

    // GET unread count (admin only) — messages from non-admins that have not been read
    fastify.get('/admin-threads/unread-count', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id: userId } = request.user as { id: number }
        if (!await isAdmin(fastify, userId)) {
            return reply.code(403).send({ error: 'Forbidden' })
        }

        // Regular users have role: null; admin-level users have ADMIN/DEVELOPER/MODERATOR
        const count = await fastify.prisma.adminMessage.count({
            where: {
                readAt: null,
                sender: { role: null }
            }
        })

        return { count }
    })

    // GET unread count for the current user — admin replies in the user's own
    // threads that they have not opened yet. Available to every authenticated user.
    fastify.get('/admin-threads/my-unread-count', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id: userId } = request.user as { id: number }

        const count = await fastify.prisma.adminMessage.count({
            where: {
                readAt: null,
                thread: { userId },
                sender: { role: { in: ADMIN_ROLES as any } }
            }
        })

        return { count }
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
        const { id: userId } = request.user as { id: number }
        if (!await isAdmin(fastify, userId)) return reply.code(403).send({ error: 'Forbidden' })

        const { status } = request.body as { status: 'OPEN' | 'CLOSED' }
        const thread = await fastify.prisma.adminThread.update({
            where: { id: threadId },
            data:  { status },
            include: includeThread
        })

        return thread
    })
}
