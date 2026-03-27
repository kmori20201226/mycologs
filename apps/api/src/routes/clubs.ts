import { FastifyInstance } from 'fastify'
import { createClubSchema, clubSchema, updateClubSchema } from '../schemas/club'

export default async function (fastify: FastifyInstance) {

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

    // LIST ALL
    fastify.get('/clubs', async (request, reply) => {
        const clubs = await fastify.prisma.club.findMany()
        return clubs
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
        const { name } = request.body as any

        const club = await fastify.prisma.club.update({
            where: { id: Number(id) },
            data: { name }
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

    // DELETE
    fastify.delete('/clubs/:id', async (request, reply) => {
        const { id } = request.params as { id: string }

        try {
            const club = await fastify.prisma.club.delete({
                where: { id: Number(id) }
            })

            return reply.code(200).send({ message: 'Club deleted', club })
        } catch (err) {
            console.error('Error deleting club:', err)
            return reply.status(404).send({ error: 'Club not found' })
        }
    })

}
