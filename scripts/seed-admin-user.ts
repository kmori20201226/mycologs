/**
 * Create an admin user for development/testing.
 *
 *   email:    admin@localhost
 *   password: admin
 *   role:     ADMIN
 *
 * Usage:
 *   npm run seed-admin-user
 *
 * Safe to re-run: skips creation if the user already exists.
 */

import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import bcrypt from 'bcrypt'
import { PrismaClient, UserRole } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const ADMIN_EMAIL = 'admin@localhost'
const ADMIN_PASSWORD = 'admin'
const ADMIN_NAME = 'admin'

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })
  if (existing) {
    console.log(`Admin user already exists (id=${existing.id}), skipping.`)
    return
  }

  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 12)

  const user = await prisma.user.create({
    data: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password_hash,
      role: UserRole.ADMIN,
    },
  })

  console.log(`Admin user created (id=${user.id}, email=${user.email}, role=${user.role})`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
