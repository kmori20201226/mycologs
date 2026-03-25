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
        const password_hash = crypto
            .createHash('sha256')  // or 'sha512'
            .update(password)
            .digest('hex')

        const result = await fastify.db.query(
            'INSERT INTO users(name, email, password_hash) VALUES($1, $2, $3) RETURNING *',
            [name, email, password_hash]
        )

        return reply.code(201).send(result.rows[0])
    })

    // READ
    fastify.get('/users/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'number' }
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

        const result = await fastify.db.query(
            'SELECT name, email FROM users WHERE id = $1',
            [id]
        )

        if (result.rows.length === 0) {
            return reply.code(404).send({ message: 'Not found' })
        }

        return result.rows[0]
    })

    // DELETE /users/:id
    fastify.delete('/users/:id', async (request, reply) => {
        const { id } = request.params as { id: string }

        try {
            const result = await fastify.db.query(
                'DELETE FROM users WHERE id = $1 RETURNING *',
                [id]
            )

            if (result.rows.length === 0) {
                return reply.status(404).send({ error: 'User not found' })
            }

            return reply.code(200).send({ message: 'User deleted', user: result.rows[0] })
        } catch (err) {
            console.error('Error deleting user:', err)
            return reply.status(500).send({ error: 'Internal server error' })
        }
    })

}