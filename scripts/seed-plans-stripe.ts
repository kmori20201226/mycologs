import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

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
    const json = process.env.STRIPE_PRICES_JSON
    if (!json) throw new Error('STRIPE_PRICES_JSON is not set')

    const data = JSON.parse(json)
    const prices: any[] = data.data ?? []

    if (prices.length === 0) {
        console.log('No prices returned from Stripe — only seeding free plan')
    }

    // Always upsert free plan
    await prisma.plan.upsert({ where: { id: FREE_PLAN.id }, create: FREE_PLAN, update: FREE_PLAN })
    console.log(`Upserted: ${FREE_PLAN.name} (${FREE_PLAN.id})`)

    // Upsert one plan per active Stripe price
    let sortOrder = 1
    for (const price of prices) {
        if (!price.active) continue
        if (price.type !== 'recurring') continue

        const productName: string = price.product?.name ?? price.id
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
