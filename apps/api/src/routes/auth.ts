import { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'

const BCRYPT_ROUNDS = 12

const registerSchema = {
    type: 'object',
    required: ['name', 'email', 'password'],
    properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 8 }
    }
}

const loginSchema = {
    type: 'object',
    required: ['email', 'password'],
    properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string' }
    }
}

const authResponseSchema = {
    type: 'object',
    properties: {
        token: { type: 'string' },
        user: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                email: { type: 'string' }
            }
        }
    }
}

const errorSchema = {
    type: 'object',
    properties: {
        message: { type: 'string' }
    }
}

export default async function (fastify: FastifyInstance) {

    // POST /auth/register
    fastify.post('/auth/register', {
        schema: {
            body: registerSchema,
            response: { 201: authResponseSchema, 409: errorSchema }
        }
    }, async (request, reply) => {
        const { name, email, password } = request.body as {
            name: string
            email: string
            password: string
        }

        const existing = await fastify.prisma.user.findUnique({ where: { email } })
        if (existing) {
            return reply.code(409).send({ message: 'Email already in use' })
        }

        const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS)

        const user = await fastify.prisma.user.create({
            data: { name, email, password_hash },
            select: { id: true, name: true, email: true }
        })

        const token = fastify.jwt.sign({ id: user.id, email: user.email })

        return reply.code(201).send({ token, user })
    })

    // POST /auth/login
    fastify.post('/auth/login', {
        schema: {
            body: loginSchema,
            response: { 200: authResponseSchema, 401: errorSchema }
        }
    }, async (request, reply) => {
        const { email, password } = request.body as {
            email: string
            password: string
        }

        const user = await fastify.prisma.user.findUnique({
            where: { email },
            select: { id: true, name: true, email: true, password_hash: true }
        })

        if (!user || !user.password_hash) {
            return reply.code(401).send({ message: 'Invalid email or password' })
        }

        const valid = await bcrypt.compare(password, user.password_hash)
        if (!valid) {
            return reply.code(401).send({ message: 'Invalid email or password' })
        }

        const token = fastify.jwt.sign({ id: user.id, email: user.email })

        return reply.send({
            token,
            user: { id: user.id, name: user.name, email: user.email }
        })
    })

}
