import { FastifyInstance } from 'fastify'
import { createClubSchema, clubSchema, updateClubSchema } from '../schemas/club'
import { userRequestSchema } from '../schemas/user-request'
import { sendMail, getAdminEmails } from '../lib/mail'

const requestInclude = {
    requester: { select: { id: true, name: true, email: true } },
    club: { select: { id: true, name: true, introduction: true, policy: true } },
    replier: { select: { id: true, name: true } }
}

export default async function (fastify: FastifyInstance) {

    // REQUEST TO START A NEW CLUB (creates a pending club + admin approval request)
    fastify.post('/clubs/request-start', {
        schema: {
            body: {
                type: 'object',
                required: ['name'],
                properties: {
                    name:         { type: 'string' },
                    introduction: { type: 'string' },
                    policy:       { type: 'string' },
                    message:      { type: 'string' }
                }
            },
            response: { 201: userRequestSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { name, introduction, policy, message } = request.body as any
        const { id: requesterId } = request.user as any

        const result = await fastify.prisma.$transaction(async (tx) => {
            const club = await tx.club.create({
                data: {
                    name,
                    introduction: introduction?.trim() || null,
                    policy: policy?.trim() || null,
                    status: 'PENDING'
                }
            })

            const managerRole = await tx.role.findUnique({ where: { name: 'CLUBMANAGER' } })
            if (!managerRole) throw new Error('CLUBMANAGER role not found')

            await tx.clubUser.create({
                data: { clubId: club.id, userId: requesterId, roleId: managerRole.id }
            })

            return tx.userRequest.create({
                data: {
                    requesterId,
                    clubId: club.id,
                    request: { requestType: 'StartClub', message: message?.trim() || null }
                },
                include: requestInclude
            })
        })

        // Notify admins (fire-and-forget)
        const base = (process.env.FRONTEND_URL ?? '').split(',')[0].trim().replace(/\/$/, '')
        const link = `${base}/admin/requests`
        getAdminEmails(fastify.prisma).then(emails =>
            sendMail(emails, '【Mycologs】クラブ立ち上げ申請が届きました',
                `<p>${result.requester.name} さんからクラブ「${name}」の立ち上げ申請が届きました。</p><p><a href="${link}">管理画面で確認する</a></p>`)
        ).catch(() => {})

        return reply.code(201).send(result)
    })

    // CREATE
    fastify.post('/clubs', {
        schema: {
            body: createClubSchema,
            response: {
                201: clubSchema
            }
        }
    }, async (request, reply) => {
        const { name } = request.body as any

        const club = await fastify.prisma.club.create({
            data: { name }
        })

        return reply.code(201).send(club)
    })

    // READ BY ID
    fastify.get('/clubs/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: clubSchema,
                404: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any

        const club = await fastify.prisma.club.findUnique({
            where: { id: Number(id) }
        })

        if (!club) {
            return reply.code(404).send({ message: 'Club not found' })
        }

        return club
    })

    // LIST ALL — optional ?managerId=X filters to clubs where user has CLUBMANAGER role
    // Only returns ACTIVE clubs (PENDING clubs are invisible until approved)
    fastify.get('/clubs', async (request, reply) => {
        const { managerId } = request.query as any

        if (managerId) {
            const managerRole = await fastify.prisma.role.findUnique({ where: { name: 'CLUBMANAGER' } })
            if (!managerRole) return []

            const clubUsers = await fastify.prisma.clubUser.findMany({
                where: { userId: Number(managerId), roleId: managerRole.id },
                include: { club: true }
            })
            return clubUsers.map((cu) => cu.club).filter((c) => c.status === 'ACTIVE')
        }

        return fastify.prisma.club.findMany({ where: { status: 'ACTIVE' } })
    })

    // UPDATE
    fastify.patch('/clubs/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            body: updateClubSchema,
            response: {
                200: clubSchema,
                404: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const { name, introduction, policy } = request.body as any

        const data: any = {}
        if (name !== undefined)         data.name = name
        if (introduction !== undefined) data.introduction = introduction
        if (policy !== undefined)       data.policy = policy

        const club = await fastify.prisma.club.update({
            where: { id: Number(id) },
            data
        })

        return club
    })

    // LIST MEMBERS
    fastify.get('/clubs/:id/members', async (request, reply) => {
        const { id } = request.params as { id: string }

        const members = await fastify.prisma.clubUser.findMany({
            where: { clubId: Number(id) },
            include: {
                user: { select: { id: true, name: true, email: true } },
                role: { select: { id: true, name: true } }
            }
        })

        return members
    })

    // ADD MEMBER
    fastify.post('/clubs/:id/members', {
        schema: {
            body: {
                type: 'object',
                required: ['userId', 'roleName'],
                properties: {
                    userId: { type: 'integer' },
                    roleName: { type: 'string', enum: ['ADMIN', 'DEVELOPER', 'MODERATOR', 'CLUBMEMBER', 'CLUBMANAGER'] }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const { userId, roleName } = request.body as { userId: number; roleName: string }

        // Ensure role row exists (upsert so it's created on first use)
        const role = await fastify.prisma.role.upsert({
            where: { name: roleName as any },
            update: {},
            create: { name: roleName as any }
        })

        try {
            const member = await fastify.prisma.clubUser.create({
                data: { clubId: Number(id), userId, roleId: role.id },
                include: {
                    user: { select: { id: true, name: true, email: true } },
                    role: { select: { id: true, name: true } }
                }
            })
            return reply.code(201).send(member)
        } catch {
            return reply.code(409).send({ message: 'User is already a member of this club' })
        }
    })

    // UPDATE MEMBER ROLE
    fastify.patch('/clubs/:id/members/:userId', {
        schema: {
            body: {
                type: 'object',
                required: ['roleName'],
                properties: {
                    roleName: { type: 'string', enum: ['CLUBMEMBER', 'CLUBMANAGER'] }
                }
            }
        }
    }, async (request, reply) => {
        const { id, userId } = request.params as { id: string; userId: string }
        const { roleName } = request.body as { roleName: string }

        const role = await fastify.prisma.role.upsert({
            where: { name: roleName as any },
            update: {},
            create: { name: roleName as any }
        })

        const updated = await fastify.prisma.clubUser.updateMany({
            where: { clubId: Number(id), userId: Number(userId) },
            data: { roleId: role.id }
        })

        if (updated.count === 0) {
            return reply.code(404).send({ message: 'Member not found' })
        }

        return reply.send({ message: 'Role updated' })
    })

    // REMOVE MEMBER
    fastify.delete('/clubs/:id/members/:userId', async (request, reply) => {
        const { id, userId } = request.params as { id: string; userId: string }

        try {
            await fastify.prisma.clubUser.deleteMany({
                where: { clubId: Number(id), userId: Number(userId) }
            })
            return reply.send({ message: 'Member removed' })
        } catch {
            return reply.code(404).send({ message: 'Member not found' })
        }
    })

    // GET credit balance
    fastify.get('/clubs/:id/credit', {
        schema: {
            params: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
            response: {
                200: { type: 'object', properties: { clubId: { type: 'integer' }, credit: { type: 'integer' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const club = await fastify.prisma.club.findUnique({ where: { id: Number(id) }, select: { id: true, credit: true } })
        if (!club) return reply.code(404).send({ message: 'Club not found' })
        return { clubId: club.id, credit: club.credit }
    })

    // ADJUST credit (admin use / webhook)
    fastify.post('/clubs/:id/credit/adjust', {
        schema: {
            params: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
            body: {
                type: 'object',
                required: ['delta'],
                properties: { delta: { type: 'integer' } }
            },
            response: {
                200: { type: 'object', properties: { clubId: { type: 'integer' }, credit: { type: 'integer' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const { delta } = request.body as { delta: number }

        try {
            const club = await fastify.prisma.club.update({
                where: { id: Number(id) },
                data: { credit: { increment: delta } },
                select: { id: true, credit: true }
            })
            return { clubId: club.id, credit: club.credit }
        } catch {
            return reply.code(404).send({ message: 'Club not found' })
        }
    })

    // DELETE
    // DEBUG — full club record
    fastify.get('/debug/clubs/:id', async (request, reply) => {
        const { id } = request.params as any
        const club = await fastify.prisma.club.findUnique({ where: { id: Number(id) } })
        if (!club) return reply.code(404).send({ message: 'Club not found' })
        return club
    })

    fastify.delete('/clubs/:id', async (request, reply) => {
        const { id } = request.params as { id: string }

        try {
            const club = await fastify.prisma.club.delete({
                where: { id: Number(id) }
            })

            return reply.code(200).send({ message: 'Club deleted', club })
        } catch (err) {
            request.log.error({ err }, 'Error deleting club')
            return reply.status(404).send({ error: 'Club not found' })
        }
    })

}
