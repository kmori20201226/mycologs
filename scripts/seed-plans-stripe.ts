import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import Stripe from 'stripe'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set')
    process.exit(1)
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const FREE_PLAN = {
    id: 'free',
    name: 'フリー',
    maxMembers: 5,
    priceYen: 0,
    creditsPerPeriod: 50,
    active: true,
    sortOrder: 0,
}

async function main() {
    // Always upsert free plan
    await prisma.plan.upsert({ where: { id: FREE_PLAN.id }, create: FREE_PLAN, update: FREE_PLAN })
    console.log(`Upserted: ${FREE_PLAN.name} (${FREE_PLAN.id})`)

    // Fetch active recurring prices from Stripe
    const result = await stripe.prices.list({ limit: 20, active: true, expand: ['data.product'] })
    const prices = result.data.filter(p => p.type === 'recurring')

    if (prices.length === 0) {
        console.log('No recurring prices found in Stripe — only free plan seeded')
    }

    let sortOrder = 1
    for (const price of prices) {
        const product = price.product as any
        const productName: string = product?.name ?? price.id
        const priceYen: number = price.unit_amount ?? 0

        // Read optional metadata set on the Stripe price
        const meta = price.metadata ?? {}
        const maxMembers: number = meta.max_members ? Number(meta.max_members) : -1
        const creditsPerPeriod: number = meta.credits_per_period ? Number(meta.credits_per_period) : 0

        const plan = {
            id: price.id,
            name: productName,
            priceYen,
            maxMembers,
            creditsPerPeriod,
            active: true,
            sortOrder: sortOrder++,
        }

        await prisma.plan.upsert({ where: { id: plan.id }, create: plan, update: plan })
        console.log(`Upserted: ${plan.name} (${plan.id}) — ¥${plan.priceYen}/month, maxMembers=${plan.maxMembers === -1 ? '無制限' : plan.maxMembers}`)
    }

    console.log('\nDone. You can adjust maxMembers and creditsPerPeriod via the admin panel.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
