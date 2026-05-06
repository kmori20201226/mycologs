import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const plans = [
    { id: 'free',                               name: 'フリー',                maxMembers: 5,   priceYen: 0,    creditsPerPeriod: 50,    sortOrder: 0 },
    { id: 'price_1TQL1kCZ4b6iBRA9isHq48Pm',    name: 'パーソナルプラン',      maxMembers: 1,   priceYen: 500,  creditsPerPeriod: 1000,  sortOrder: 1 },
    { id: 'starter',                            name: 'スタータープラン',      maxMembers: 30,  priceYen: 1000, creditsPerPeriod: 5000,  sortOrder: 2 },
    { id: 'standard',                           name: 'スタンダードプラン',    maxMembers: 100, priceYen: 3000, creditsPerPeriod: 10000, sortOrder: 3 },
    { id: 'pro',                                name: 'プロプラン',            maxMembers: -1,  priceYen: 8000, creditsPerPeriod: 20000, sortOrder: 4 },
]

async function main() {
    for (const plan of plans) {
        await prisma.plan.upsert({ where: { id: plan.id }, create: plan, update: plan })
        console.log(`Upserted: ${plan.name} (maxMembers: ${plan.maxMembers === -1 ? '無制限' : plan.maxMembers})`)
    }
    console.log('Done.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
