/**
 * Set a user's club-scoped role (club-manager / club-member), or remove them
 * from a club. This is the club-level counterpart to set-user-role (which sets
 * the system-level User.role). Club roles live in ClubUser.roleId.
 *
 * It is an admin/ops tool: it upserts the membership directly and does NOT
 * enforce the plan member-limit that the normal join flow applies.
 *
 * Usage:
 *   npm run set-club-role -- <user> <club> <CLUBMANAGER|CLUBMEMBER|remove>
 *     <user>  email or numeric user id
 *     <club>  numeric club id, or exact club name
 *
 * Examples:
 *   npm run set-club-role -- alice@example.com 12 CLUBMANAGER
 *   npm run set-club-role -- 315 "東京きのこクラブ" CLUBMANAGER
 *   npm run set-club-role -- alice@example.com 12 CLUBMEMBER
 *   npm run set-club-role -- alice@example.com 12 remove
 */

import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const CLUB_ROLES = ['CLUBMANAGER', 'CLUBMEMBER'] as const
const USAGE = 'Usage: npm run set-club-role -- <user:email|id> <club:id|name> <CLUBMANAGER|CLUBMEMBER|remove>'

async function main() {
  const [, , userArg, clubArg, roleArg] = process.argv

  if (!userArg || !clubArg || !roleArg) {
    console.error(USAGE)
    process.exit(1)
  }

  const action = roleArg.toLowerCase() === 'remove' ? 'remove' : roleArg.toUpperCase()
  if (action !== 'remove' && !CLUB_ROLES.includes(action as any)) {
    console.error(`Invalid role "${roleArg}". Must be one of: ${CLUB_ROLES.join(', ')}, remove`)
    process.exit(1)
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    // ── Resolve user (numeric id or email) ──────────────────────────────────
    const user = /^\d+$/.test(userArg)
      ? await prisma.user.findUnique({ where: { id: Number(userArg) }, select: { id: true, name: true, email: true } })
      : await prisma.user.findUnique({ where: { email: userArg }, select: { id: true, name: true, email: true } })
    if (!user) {
      console.error(`No user found for "${userArg}"`)
      process.exit(1)
    }

    // ── Resolve club (numeric id, or exact name with an ambiguity guard) ─────
    let club: { id: number; name: string; deletedAt: Date | null } | null
    if (/^\d+$/.test(clubArg)) {
      club = await prisma.club.findUnique({ where: { id: Number(clubArg) }, select: { id: true, name: true, deletedAt: true } })
    } else {
      const matches = await prisma.club.findMany({
        where: { name: clubArg, deletedAt: null },
        select: { id: true, name: true, deletedAt: true },
      })
      if (matches.length > 1) {
        console.error(`Club name "${clubArg}" is ambiguous — matches ids: ${matches.map((c) => c.id).join(', ')}. Use the id instead.`)
        process.exit(1)
      }
      club = matches[0] ?? null
    }
    if (!club) {
      console.error(`No club found for "${clubArg}"`)
      process.exit(1)
    }
    if (club.deletedAt) {
      console.warn(`⚠️  Club "${club.name}" (id ${club.id}) is soft-deleted.`)
    }

    const where = { clubId_userId: { clubId: club.id, userId: user.id } }
    const existing = await prisma.clubUser.findUnique({ where, include: { role: true } })
    const who = `${user.name} <${user.email}> @ ${club.name} (club ${club.id})`

    // ── remove ──────────────────────────────────────────────────────────────
    if (action === 'remove') {
      if (!existing) {
        console.log(`${who}: not a member — nothing to remove.`)
        return
      }
      await prisma.clubUser.delete({ where })
      console.log(`${who}: removed (was ${existing.role.name}).`)
      return
    }

    // ── promote / demote ─────────────────────────────────────────────────────
    const role = await prisma.role.findUnique({ where: { name: action as any }, select: { id: true } })
    if (!role) {
      console.error(`Role "${action}" is missing from the roles table — seed it first.`)
      process.exit(1)
    }

    if (existing && existing.role.name === action) {
      console.log(`${who}: already ${action} — no change.`)
      return
    }

    await prisma.clubUser.upsert({
      where,
      update: { roleId: role.id },
      create: { clubId: club.id, userId: user.id, roleId: role.id },
    })

    if (existing) {
      console.log(`${who}: ${existing.role.name} → ${action}.`)
    } else {
      console.log(`${who}: added as ${action}. (membership created; plan member-limit not enforced)`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
