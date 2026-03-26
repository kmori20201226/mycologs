import { FastifyInstance } from 'fastify'
import { createRoleSchema, roleSchema } from '../schemas/role'

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/roles', {
        schema: {
            body: createRoleSchema,
            response: {
                201: roleSchema
            }
        }
    }, async (request, reply) => {
        const { name } = request.body as any

        const role = await fastify.prisma.role.create({
            data: { name }
        })

        return reply.code(201).send(role)
    })

    // READ BY ID
    fastify.get('/roles/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: roleSchema,
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

        const role = await fastify.prisma.role.findUnique({
            where: { id: Number(id) }
        })

        if (!role) {
            return reply.code(404).send({ message: 'Role not found' })
        }

        return role
    })

    // LIST ALL
    fastify.get('/roles', async (request, reply) => {
        const roles = await fastify.prisma.role.findMany()
        return roles
    })

    // DELETE
    fastify.delete('/roles/:id', async (request, reply) => {
        const { id } = request.params as { id: string }

        try {
            const role = await fastify.prisma.role.delete({
                where: { id: Number(id) }
            })

            return reply.code(200).send({ message: 'Role deleted', role })
        } catch (err) {
            console.error('Error deleting role:', err)
            return reply.status(404).send({ error: 'Role not found' })
        }
    })

}
