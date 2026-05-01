/**
 * Create a local user for development/testing.
 *
 *   email:    <name>@localhost
 *   password: <name>
 *   role:     optional (ADMIN|DEVELOPER|MODERATOR), null if omitted
 *
 * Usage:
 *   npm run add-user -- <name> [ADMIN|DEVELOPER|MODERATOR]
 *
 * Safe to re-run: skips creation if the user already exists.
 */

import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import bcrypt from 'bcrypt'
import { PrismaClient, UserRole } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const VALID_ROLES = ['ADMIN', 'DEVELOPER', 'MODERATOR']

async function main() {
  const [, , nameArg, roleArg] = process.argv

  if (!nameArg) {
    console.error('Usage: npm run add-user -- <name> [ADMIN|DEVELOPER|MODERATOR]')
    process.exit(1)
  }

  let role: UserRole | null = null
  if (roleArg) {
    const upper = roleArg.toUpperCase()
    if (!VALID_ROLES.includes(upper)) {
      console.error(`Invalid role "${roleArg}". Must be one of: ${VALID_ROLES.join(', ')}`)
      process.exit(1)
    }
    role = upper as UserRole
  }

  const email = `${nameArg}@localhost`
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      console.log(`User already exists (id=${existing.id}, email=${existing.email}), skipping.`)
      return
    }

    const password_hash = await bcrypt.hash(nameArg, 12)
    const user = await prisma.user.create({
      data: {
        name: nameArg,
        email,
        password_hash,
        role,
        emailVerified: new Date(),
      },
    })

    console.log(`User created: id=${user.id}  name=${user.name}  email=${user.email}  role=${user.role ?? 'null'}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
