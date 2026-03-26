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
