import { FastifyInstance } from 'fastify'
import { createEventSchema, eventSchema, updateEventSchema } from '../schemas/event'

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/events', {
        schema: {
            body: createEventSchema,
            response: {
                201: eventSchema
            }
        }
    }, async (request, reply) => {
        const { name, description, startAt, endAt } = request.body as any

        const event = await fastify.prisma.event.create({
            data: {
                name,
                description,
                startAt: startAt ? new Date(startAt) : null,
                endAt: endAt ? new Date(endAt) : null
            }
        })

        return reply.code(201).send(event)
    })

    // READ BY ID
    fastify.get('/events/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: eventSchema,
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

        const event = await fastify.prisma.event.findUnique({
            where: { id: Number(id) }
        })

        if (!event) {
            return reply.code(404).send({ message: 'Event not found' })
        }

        return event
    })

    // LIST ALL
    fastify.get('/events', {
        schema: {
            response: {
                200: {
                    type: 'array',
                    items: eventSchema
                }
            }
        }
    }, async (request, reply) => {
        const events = await fastify.prisma.event.findMany({
            orderBy: { createdAt: 'desc' }
        })

        return events
    })

    // UPDATE
    fastify.patch('/events/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            body: updateEventSchema,
            response: {
                200: eventSchema,
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
        const updateData = request.body as any

        // Convert date strings to Date objects
        if (updateData.startAt) {
            updateData.startAt = new Date(updateData.startAt)
        }
        if (updateData.endAt) {
            updateData.endAt = new Date(updateData.endAt)
        }

        try {
            const event = await fastify.prisma.event.update({
                where: { id: Number(id) },
                data: updateData
            })

            return event
        } catch (error) {
            return reply.code(404).send({ message: 'Event not found' })
        }
    })

    // DELETE
    fastify.delete('/events/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                },
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

        try {
            await fastify.prisma.event.delete({
                where: { id: Number(id) }
            })

            return { message: 'Event deleted' }
        } catch (error) {
            return reply.code(404).send({ message: 'Event not found' })
        }
    })
}