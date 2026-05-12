import { FastifyInstance } from 'fastify'

const ADMIN_ROLES = ['ADMIN', 'DEVELOPER', 'MODERATOR']

export default async function (fastify: FastifyInstance) {

    // GET /settings/site — public
    fastify.get('/settings/site', async (_request, reply) => {
        const rows = await fastify.prisma.siteSetting.findMany({
            where: { key: { in: ['maintenanceMode', 'adminEmail1', 'adminEmail2', 'adminEmail3'] } }
        })
        const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
        return reply.send({
            maintenanceMode: map['maintenanceMode'] === 'true',
            adminEmail1: map['adminEmail1'] ?? '',
            adminEmail2: map['adminEmail2'] ?? '',
            adminEmail3: map['adminEmail3'] ?? '',
        })
    })

    // PUT /settings/site — admin only
    fastify.put('/settings/site', {
        preHandler: [fastify.authenticate],
        schema: {
            body: {
                type: 'object',
                properties: {
                    maintenanceMode: { type: 'boolean' },
                    adminEmail1: { type: 'string', nullable: true },
                    adminEmail2: { type: 'string', nullable: true },
                    adminEmail3: { type: 'string', nullable: true },
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.user as { id: number }
        const user = await fastify.prisma.user.findUnique({
            where: { id },
            select: { role: true }
        })
        if (!user || !ADMIN_ROLES.includes(user.role ?? '')) {
            return reply.code(403).send({ message: 'Forbidden' })
        }

        const body = request.body as {
            maintenanceMode?: boolean
            adminEmail1?: string | null
            adminEmail2?: string | null
            adminEmail3?: string | null
        }

        const upserts: Promise<unknown>[] = []
        if (body.maintenanceMode !== undefined) {
            upserts.push(fastify.prisma.siteSetting.upsert({
                where: { key: 'maintenanceMode' },
                create: { key: 'maintenanceMode', value: String(body.maintenanceMode) },
                update: { value: String(body.maintenanceMode) }
            }))
        }
        for (const key of ['adminEmail1', 'adminEmail2', 'adminEmail3'] as const) {
            if (body[key] !== undefined) {
                upserts.push(fastify.prisma.siteSetting.upsert({
                    where: { key },
                    create: { key, value: body[key] ?? '' },
                    update: { value: body[key] ?? '' }
                }))
            }
        }
        await Promise.all(upserts)

        const rows = await fastify.prisma.siteSetting.findMany({
            where: { key: { in: ['maintenanceMode', 'adminEmail1', 'adminEmail2', 'adminEmail3'] } }
        })
        const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
        return reply.send({
            maintenanceMode: map['maintenanceMode'] === 'true',
            adminEmail1: map['adminEmail1'] ?? '',
            adminEmail2: map['adminEmail2'] ?? '',
            adminEmail3: map['adminEmail3'] ?? '',
        })
    })
}
