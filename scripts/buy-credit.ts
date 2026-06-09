/**
 * Fake "buy" of credit: add credit to a user or club, and keep a *fake*
 * subscription active for one month — without going through Stripe. Intended for
 * the business/sandbox/dev environments to top up credit and keep an account
 * "subscribed" while testing.
 *
 * The credit is incremented on the existing balance. A dedicated fake
 * subscription (identified by planId = "<fake>") is created or extended so its
 * expiry (accessUntil / currentPeriodEnd) is one month from today and its status
 * is active. Real Stripe subscriptions (sub_…) are never modified.
 *
 * Note: "<fake>" is intentionally not a real plan id — the DB allows it (plan_id
 * is NOT NULL but has no foreign key), it clearly marks the row as fake, and it
 * passes the "planId != 'free'" gate so PRIVATE posting works. Plan-name/limit
 * lookups resolve to the free defaults, which is fine for a fake subscription.
 *
 * Usage:
 *   npx ts-node scripts/buy-credit.ts <email|user-id|club:ID> [amount]
 *
 *   amount defaults to 1000.
 *
 * Examples:
 *   npx ts-node scripts/buy-credit.ts alice@example.com        # user, +1000
 *   npx ts-node scripts/buy-credit.ts alice@example.com 5000   # user, +5000
 *   npx ts-node scripts/buy-credit.ts 42                       # user id 42, +1000
 *   npx ts-node scripts/buy-credit.ts club:3 1000              # club 3, +1000
 */

import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const DEFAULT_AMOUNT = 1000
const FAKE_PLAN_ID = '<fake>'

function usage(message?: string): never {
  if (message) console.error(`Error: ${message}\n`)
  console.error('Usage: buy-credit <email|user-id|club:ID> [amount]   (amount defaults to 1000)')
  process.exit(1)
}

// One month from today (JS clamps overflow, e.g. Jan 31 → early Mar — acceptable).
function oneMonthFromNow(): Date {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d
}

async function main() {
  const identifier = process.argv[2]
  if (!identifier) usage('a user email/id or club:ID is required')

  let amount = DEFAULT_AMOUNT
  const amountArg = process.argv[3]
  if (amountArg !== undefined && amountArg.trim() !== '') {
    amount = Number(amountArg)
    if (!Number.isInteger(amount)) usage(`amount must be a whole number, got "${amountArg}"`)
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    // Resolve the owner (user by id/email, or club by club:ID) and bump credit.
    let owner: { userId?: number; clubId?: number }
    let label: string
    let creditBefore: number
    let creditAfter: number

    if (identifier.startsWith('club:')) {
      const clubId = Number(identifier.slice('club:'.length))
      if (!Number.isInteger(clubId)) usage(`invalid club id in "${identifier}"`)
      const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true, name: true, credit: true } })
      if (!club) usage(`no club found for id ${clubId}`)
      const updated = await prisma.club.update({
        where: { id: club.id },
        data: { credit: { increment: amount } },
        select: { credit: true },
      })
      owner = { clubId: club.id }
      label = `Club ${club.id} (${club.name})`
      creditBefore = club.credit
      creditAfter = updated.credit
    } else {
      const where = /^\d+$/.test(identifier) ? { id: Number(identifier) } : { email: identifier }
      const user = await prisma.user.findUnique({ where, select: { id: true, email: true, credit: true } })
      if (!user) usage(`no user found for "${identifier}"`)
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { credit: { increment: amount } },
        select: { credit: true },
      })
      owner = { userId: user.id }
      label = `User ${user.id} (${user.email})`
      creditBefore = user.credit
      creditAfter = updated.credit
    }

    const sign = amount >= 0 ? '+' : ''
    console.log(`${label}: credit ${creditBefore} → ${creditAfter} (${sign}${amount})`)

    // Create or extend the *fake* subscription (planId = "<fake>") so it's active
    // for one month. Real Stripe subscriptions for this owner are left untouched.
    const now = new Date()
    const expiry = oneMonthFromNow()
    const ownerWhere = owner.userId != null ? { userId: owner.userId } : { clubId: owner.clubId! }
    const existingFake = await prisma.subscription.findFirst({
      where: { ...ownerWhere, planId: FAKE_PLAN_ID },
      select: { id: true },
    })

    if (existingFake) {
      await prisma.subscription.update({
        where: { id: existingFake.id },
        data: {
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: expiry,
          accessUntil: expiry,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      })
      console.log(`  fake subscription ${existingFake.id} extended → active until ${expiry.toISOString()}`)
    } else {
      const created = await prisma.subscription.create({
        data: {
          ...ownerWhere,
          planId: FAKE_PLAN_ID,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: expiry,
          accessUntil: expiry,
          cancelAtPeriodEnd: false,
        },
        select: { id: true },
      })
      console.log(`  fake subscription ${created.id} created (plan "${FAKE_PLAN_ID}") → active until ${expiry.toISOString()}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
