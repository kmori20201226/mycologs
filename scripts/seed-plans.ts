import { PrismaClient } from '../generated/prisma'

const prisma = new PrismaClient()

const plans = [
    { id: 'free',     name: 'フリー',            maxMembers: 5,   priceYen: 0,    sortOrder: 0 },
    { id: 'starter',  name: 'スタータープラン',   maxMembers: 30,  priceYen: 1000, sortOrder: 1 },
    { id: 'standard', name: 'スタンダードプラン',  maxMembers: 100, priceYen: 3000, sortOrder: 2 },
    { id: 'pro',      name: 'プロプラン',          maxMembers: -1,  priceYen: 8000, sortOrder: 3 },
]

async function main() {
    for (const plan of plans) {
        await prisma.plan.upsert({ where: { id: plan.id }, create: plan, update: plan })
        console.log(`Upserted: ${plan.name} (maxMembers: ${plan.maxMembers === -1 ? '無制限' : plan.maxMembers})`)
    }
    console.log('Done.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
