/**
 * List all users with name, email, and (for @localhost accounts) password.
 *
 * For users whose email ends with "@localhost" the password is shown, since
 * by convention their password equals their name (as set by add-user /
 * seed-admin-user).  All other accounts show "—" for the password column.
 *
 * Usage:
 *   npm run list-user
 */

import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { id: 'asc' },
    })

    if (users.length === 0) {
      console.log('No users found.')
      return
    }

    const idW    = Math.max(2,  ...users.map((u) => String(u.id).length))
    const nameW  = Math.max(4,  ...users.map((u) => u.name.length))
    const emailW = Math.max(5,  ...users.map((u) => u.email.length))
    const roleW  = Math.max(4,  ...users.map((u) => (u.role ?? 'null').length))
    const passW  = Math.max(8,  ...users.map((u) => (u.email.endsWith('@localhost') ? u.name.length : 1)))

    const line = (id: string, name: string, email: string, role: string, pass: string) =>
      `  ${id.padEnd(idW)}  ${name.padEnd(nameW)}  ${email.padEnd(emailW)}  ${role.padEnd(roleW)}  ${pass}`

    const header = line('id', 'name', 'email', 'role', 'password')
    const sep    = '  ' + '-'.repeat(idW) + '  ' + '-'.repeat(nameW) + '  ' + '-'.repeat(emailW) + '  ' + '-'.repeat(roleW) + '  ' + '-'.repeat(passW)

    console.log(header)
    console.log(sep)
    for (const u of users) {
      const password = u.email.endsWith('@localhost') ? u.name : '—'
      console.log(line(String(u.id), u.name, u.email, u.role ?? 'null', password))
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
