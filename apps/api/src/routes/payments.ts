import { FastifyInstance } from 'fastify'
import { paymentSchema, createPaymentSchema } from '../schemas/payment'

const notFound = {
    type: 'object',
    properties: { message: { type: 'string' } }
}

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/payments', {
        schema: {
            body: createPaymentSchema,
            response: { 201: paymentSchema }
        }
    }, async (request, reply) => {
        const data = request.body as any

        const payment = await fastify.prisma.payment.create({
            data: {
                userId:         data.userId         ?? null,
                clubId:         data.clubId         ?? null,
                subscriptionId: data.subscriptionId ?? null,
                amount:         data.amount,
                currency:       data.currency,
                status:         data.status,
                provider:       data.provider,
                providerRef:    data.providerRef    ?? null,
                paidAt:         data.paidAt         ? new Date(data.paidAt) : null,
            }
        })

        return reply.code(201).send(payment)
    })

    // READ BY ID
    fastify.get('/payments/:id', {
        schema: {
            params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
            response: { 200: paymentSchema, 404: notFound }
        }
    }, async (request, reply) => {
        const { id } = request.params as any

        const payment = await fastify.prisma.payment.findUnique({ where: { id } })
        if (!payment) return reply.code(404).send({ message: 'Payment not found' })
        return payment
    })

    // LIST BY USER
    fastify.get('/users/:userId/payments', {
        schema: {
            params: { type: 'object', required: ['userId'], properties: { userId: { type: 'integer' } } },
            response: { 200: { type: 'array', items: paymentSchema } }
        }
    }, async (request, reply) => {
        const { userId } = request.params as any

        return fastify.prisma.payment.findMany({
            where: { userId: Number(userId) },
            orderBy: { createdAt: 'desc' }
        })
    })

    // LIST BY CLUB
    fastify.get('/clubs/:clubId/payments', {
        schema: {
            params: { type: 'object', required: ['clubId'], properties: { clubId: { type: 'integer' } } },
            response: { 200: { type: 'array', items: paymentSchema } }
        }
    }, async (request, reply) => {
        const { clubId } = request.params as any

        return fastify.prisma.payment.findMany({
            where: { clubId: Number(clubId) },
            orderBy: { createdAt: 'desc' }
        })
    })
}
