import { FastifyInstance } from 'fastify'

const ADMIN_ROLES = ['ADMIN', 'DEVELOPER', 'MODERATOR']

export default async function (fastify: FastifyInstance) {

    // GET /settings/site — public
    fastify.get('/settings/site', async (_request, reply) => {
        const setting = await fastify.prisma.siteSetting.findUnique({
            where: { key: 'maintenanceMode' }
        })
        return reply.send({ maintenanceMode: setting?.value === 'true' })
    })

    // PUT /settings/site — admin only
    fastify.put('/settings/site', {
        preHandler: [fastify.authenticate],
        schema: {
            body: {
                type: 'object',
                required: ['maintenanceMode'],
                properties: { maintenanceMode: { type: 'boolean' } }
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

        const { maintenanceMode } = request.body as { maintenanceMode: boolean }
        await fastify.prisma.siteSetting.upsert({
            where: { key: 'maintenanceMode' },
            create: { key: 'maintenanceMode', value: String(maintenanceMode) },
            update: { value: String(maintenanceMode) }
        })

        return reply.send({ maintenanceMode })
    })
}
