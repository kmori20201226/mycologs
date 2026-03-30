/**
 * Set or clear the system-level role of a user.
 *
 * Usage:
 *   npm run set-user-role -- <email> <ADMIN|DEVELOPER|MODERATOR|null>
 *
 * Examples:
 *   npm run set-user-role -- alice@example.com ADMIN
 *   npm run set-user-role -- alice@example.com null
 */

import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient, UserRole } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const VALID_ROLES: string[] = ['ADMIN', 'DEVELOPER', 'MODERATOR']

async function main() {
  const [, , emailArg, roleArg] = process.argv

  if (!emailArg || !roleArg) {
    console.error('Usage: npm run set-user-role -- <email> <ADMIN|DEVELOPER|MODERATOR|null>')
    process.exit(1)
  }

  const roleUpper = roleArg.toUpperCase()
  const isNull = roleArg.toLowerCase() === 'null' || roleArg === ''

  if (!isNull && !VALID_ROLES.includes(roleUpper)) {
    console.error(`Invalid role "${roleArg}". Must be one of: ${VALID_ROLES.join(', ')}, null`)
    process.exit(1)
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    const user = await prisma.user.findUnique({
      where: { email: emailArg },
      select: { id: true, name: true, email: true, role: true },
    })

    if (!user) {
      console.error(`No user found with email "${emailArg}"`)
      process.exit(1)
    }

    const newRole = isNull ? null : (roleUpper as UserRole)

    await prisma.user.update({
      where: { id: user.id },
      data: { role: newRole },
    })

    const prev = user.role ?? 'null'
    const next = newRole ?? 'null'
    console.log(`Updated ${user.name} <${user.email}>: ${prev} → ${next}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
