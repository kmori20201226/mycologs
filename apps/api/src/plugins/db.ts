import fp from 'fastify-plugin'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
})

import { FastifyInstance } from 'fastify'

const prisma = new PrismaClient({ adapter })

export default fp(async (fastify: FastifyInstance) => {
    fastify.decorate('prisma', prisma)

    fastify.addHook('onClose', async () => {
        await prisma.$disconnect()
    })
})

declare module 'fastify' {
    interface FastifyInstance {
        prisma: PrismaClient
    }
}