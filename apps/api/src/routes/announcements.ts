import { FastifyInstance } from 'fastify'
import { announcementSchema } from '../schemas/announcement'

const ADMIN_ROLES = ['ADMIN', 'DEVELOPER', 'MODERATOR']

async function isAdmin(fastify: FastifyInstance, userId: number): Promise<boolean> {
    const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
    })
    return ADMIN_ROLES.includes(user?.role ?? '')
}

async function isClubManager(fastify: FastifyInstance, userId: number, clubId: number): Promise<boolean> {
    const cu = await fastify.prisma.clubUser.findFirst({
        where: { userId, clubId },
        include: { role: true }
    })
    return cu?.role.name === 'CLUBMANAGER'
}

export default async function (fastify: FastifyInstance) {

    // GET — public, filtered by ?site=true or ?clubId=X, returns active only
    fastify.get('/announcements', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    site:   { type: 'string' },
                    clubId: { type: 'integer' },
                }
            },
            response: { 200: { type: 'array', items: announcementSchema } }
        }
    }, async (request) => {
        const { site, clubId } = request.query as { site?: string; clubId?: number }

        if (site === 'true') {
            return fastify.prisma.announcement.findMany({
                where: { active: true, clubId: null },
                orderBy: { updatedAt: 'desc' }
            })
        }

        if (clubId != null) {
            return fastify.prisma.announcement.findMany({
                where: { active: true, clubId: Number(clubId) },
                orderBy: { updatedAt: 'desc' }
            })
        }

        return fastify.prisma.announcement.findMany({
            where: { active: true },
            orderBy: { updatedAt: 'desc' }
        })
    })

    // POST — create (admin for site-wide, clubmanager for club)
    fastify.post('/announcements', {
        schema: {
            body: {
                type: 'object',
                required: ['body'],
                properties: {
                    body:   { type: 'string' },
                    clubId: { type: ['integer', 'null'] },
                }
            },
            response: { 201: announcementSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id: userId } = request.user as { id: number }
        const { body, clubId } = request.body as { body: string; clubId?: number | null }

        if (clubId != null) {
            if (!await isClubManager(fastify, userId, clubId)) {
                void (reply as any).code(403).send({ error: 'Forbidden' }); return
            }
        } else {
            if (!await isAdmin(fastify, userId)) {
                void (reply as any).code(403).send({ error: 'Forbidden' }); return
            }
        }

        // Deactivate existing announcements in the same scope
        await fastify.prisma.announcement.updateMany({
            where: { clubId: clubId ?? null, active: true },
            data:  { active: false }
        })

        const ann = await fastify.prisma.announcement.create({
            data: { body, authorId: userId, clubId: clubId ?? null, active: true }
        })
        return reply.code(201).send(ann)
    })

    // PATCH — update body or toggle active
    fastify.patch<{ Params: { id: string } }>('/announcements/:id', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    body:   { type: 'string' },
                    active: { type: 'boolean' },
                }
            },
            response: { 200: announcementSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id: userId } = request.user as { id: number }
        const annId = Number(request.params.id)
        const data = request.body as { body?: string; active?: boolean }

        const existing = await fastify.prisma.announcement.findUnique({ where: { id: annId } })
        if (!existing) return reply.code(404).send({ error: 'Not found' })

        if (existing.clubId != null) {
            if (!await isClubManager(fastify, userId, existing.clubId)) {
                return reply.code(403).send({ error: 'Forbidden' })
            }
        } else {
            if (!await isAdmin(fastify, userId)) {
                return reply.code(403).send({ error: 'Forbidden' })
            }
        }

        const updated = await fastify.prisma.announcement.update({
            where: { id: annId },
            data: {
                ...(data.body   !== undefined && { body:   data.body }),
                ...(data.active !== undefined && { active: data.active }),
            }
        })
        return updated
    })

    // DELETE
    fastify.delete<{ Params: { id: string } }>('/announcements/:id', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id: userId } = request.user as { id: number }
        const annId = Number(request.params.id)

        const existing = await fastify.prisma.announcement.findUnique({ where: { id: annId } })
        if (!existing) return reply.code(404).send({ error: 'Not found' })

        if (existing.clubId != null) {
            if (!await isClubManager(fastify, userId, existing.clubId)) {
                return reply.code(403).send({ error: 'Forbidden' })
            }
        } else {
            if (!await isAdmin(fastify, userId)) {
                return reply.code(403).send({ error: 'Forbidden' })
            }
        }

        await fastify.prisma.announcement.delete({ where: { id: annId } })
        return reply.code(204).send()
    })
}
