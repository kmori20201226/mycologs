import { FastifyInstance } from 'fastify'
import { createUserSchema, userSchema } from '../schemas/user'
import crypto from 'crypto'

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/users', {
        schema: {
            body: createUserSchema,
            response: {
                201: userSchema
            }
        }
    }, async (request, reply) => {
        const { name, email, password } = request.body as any
        const password_hash = password ? crypto
            .createHash('sha256')
            .update(password)
            .digest('hex') : null

        const user = await fastify.prisma.user.create({
            data: {
                name,
                email,
                password_hash
            }
        })

        return reply.code(201).send(user)
    })

    // READ
    fastify.get('/users/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: userSchema,
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

        const user = await fastify.prisma.user.findUnique({
            where: { id: Number(id) },
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true
            }
        })

        if (!user) {
            return reply.code(404).send({ message: 'Not found' })
        }

        return user
    })

    // DELETE /users/:id
    fastify.delete('/users/:id', async (request, reply) => {
        const { id } = request.params as { id: string }

        try {
            const user = await fastify.prisma.user.delete({
                where: { id: Number(id) }
            })

            return reply.code(200).send({ message: 'User deleted', user })
        } catch (err) {
            console.error('Error deleting user:', err)
            return reply.status(404).send({ error: 'User not found' })
        }
    })

}