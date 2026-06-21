/**
 * List clubs with id, status, and member / manager counts.
 *
 * Usage:
 *   npm run list-clubs              # summary: active (non-deleted) clubs
 *   npm run list-clubs -- --all     # include soft-deleted clubs (marked *)
 *   npm run list-clubs -- --members # also list every member per club (managers first, marked ★)
 */

import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

async function main() {
  const flags = process.argv.slice(2)
  const includeDeleted = flags.includes('--all')
  const showMembers = flags.includes('--members')

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    const clubs = await prisma.club.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      select: {
        id: true, name: true, status: true, deletedAt: true,
        clubUsers: {
          select: {
            user: { select: { id: true, name: true, email: true } },
            role: { select: { name: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
    })

    if (clubs.length === 0) {
      console.log('No clubs found.')
      return
    }

    // ── Summary table ─────────────────────────────────────────────────────────
    const rows = clubs.map((c) => ({
      id:       String(c.id),
      name:     c.name + (c.deletedAt ? ' *' : ''),
      status:   c.status,
      members:  String(c.clubUsers.length),
      managers: String(c.clubUsers.filter((cu) => cu.role.name === 'CLUBMANAGER').length),
    }))

    const idW   = Math.max(2, ...rows.map((r) => r.id.length))
    const nameW = Math.max(4, ...rows.map((r) => r.name.length))
    const stW   = Math.max(6, ...rows.map((r) => r.status.length))
    const memW  = Math.max(7, ...rows.map((r) => r.members.length))
    const mgrW  = Math.max(8, ...rows.map((r) => r.managers.length))

    const line = (id: string, name: string, st: string, mem: string, mgr: string) =>
      `  ${id.padEnd(idW)}  ${name.padEnd(nameW)}  ${st.padEnd(stW)}  ${mem.padStart(memW)}  ${mgr.padStart(mgrW)}`

    console.log(line('id', 'name', 'status', 'members', 'managers'))
    console.log('  ' + '-'.repeat(idW) + '  ' + '-'.repeat(nameW) + '  ' + '-'.repeat(stW) + '  ' + '-'.repeat(memW) + '  ' + '-'.repeat(mgrW))
    for (const r of rows) console.log(line(r.id, r.name, r.status, r.members, r.managers))

    if (includeDeleted) console.log('\n  * = soft-deleted')

    if (!showMembers) return

    // ── Per-club member breakdown (managers first, then by id) ────────────────
    console.log('\n=== members (★ = manager) ===')
    for (const c of clubs) {
      console.log(`\n[${c.id}] ${c.name}${c.deletedAt ? ' *' : ''}`)
      if (c.clubUsers.length === 0) {
        console.log('  (no members)')
        continue
      }
      const members = [...c.clubUsers].sort((a, b) => {
        const am = a.role.name === 'CLUBMANAGER' ? 0 : 1
        const bm = b.role.name === 'CLUBMANAGER' ? 0 : 1
        return am - bm || a.user.id - b.user.id
      })

      const uidW  = Math.max(2, ...members.map((m) => String(m.user.id).length))
      const nmW   = Math.max(4, ...members.map((m) => m.user.name.length))
      const emW   = Math.max(5, ...members.map((m) => m.user.email.length))

      for (const m of members) {
        const mark = m.role.name === 'CLUBMANAGER' ? '★' : ' '
        console.log(`  ${mark} ${String(m.user.id).padEnd(uidW)}  ${m.user.name.padEnd(nmW)}  ${m.user.email.padEnd(emW)}  ${m.role.name}`)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
