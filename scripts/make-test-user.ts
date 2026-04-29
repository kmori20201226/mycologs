/**
 * Create test clubs and users from test-sandbox/testdata.csv.
 *
 * CSV format:
 *   - Header line begins with "#" defining column names
 *   - First column "type" is either "club" or "user"
 *   - Blank lines and lines starting with "//" are ignored
 *   - belonging-clubs: club names separated by "/"
 *       +ClubName  → join as CLUBMANAGER
 *        ClubName  → join as CLUBMEMBER
 *
 * Example:
 *   #type,name,email,password,role,belonging-clubs
 *   club,きのこ愛好会
 *   club,きのこ研究会
 *   user,山田太郎,yamada@example.com,pass,,+きのこ愛好会/きのこ研究会
 *
 * Usage:
 *   npm run make-test-user
 *
 * Safe to re-run: uses upsert for clubs and users; skips existing memberships.
 */

import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import fs from 'fs'
import readline from 'readline'
import bcrypt from 'bcrypt'
import { PrismaClient, UserRole, RoleType } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const CSV_PATH = path.resolve(__dirname, '../test-sandbox/testdata.csv')

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else { inQuotes = !inQuotes }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim()); current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

async function readCsv(): Promise<Record<string, string>[]> {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`File not found: ${CSV_PATH}`)
    process.exit(1)
  }

  const rl = readline.createInterface({ input: fs.createReadStream(CSV_PATH), crlfDelay: Infinity })
  let headers: string[] = []
  const rows: Record<string, string>[] = []

  for await (const raw of rl) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue

    if (line.startsWith('#')) {
      headers = parseCsvLine(line.slice(1))
      continue
    }

    if (headers.length === 0) continue

    const cols = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cols[i] ?? '' })
    rows.push(row)
  }

  return rows
}

async function main() {
  console.log(`Reading: ${CSV_PATH}`)
  const rows = await readCsv()
  if (rows.length === 0) { console.log('No data rows found.'); return }

  const [memberRole, managerRole] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { name: RoleType.CLUBMEMBER } }),
    prisma.role.findUniqueOrThrow({ where: { name: RoleType.CLUBMANAGER } }),
  ])

  // --- Pass 1: create clubs ---
  console.log('\nCreating clubs...')
  const clubMap = new Map<string, number>()

  for (const row of rows) {
    if (row['type'] !== 'club') continue
    const name = row['name']?.trim()
    if (!name) continue

    const credit = Number(row['credits']?.trim() || 0)
    const existing = await prisma.club.findFirst({ where: { name } })
    const club = existing
      ? await prisma.club.update({ where: { id: existing.id }, data: { credit } })
      : await prisma.club.create({ data: { name, credit } })

    clubMap.set(name, club.id)
    console.log(`  ${existing ? '(updated)' : '(created)'} "${name}" id=${club.id} credits=${credit}`)
  }

  // --- Pass 2: create users and memberships ---
  console.log('\nCreating users...')

  for (const row of rows) {
    if (row['type'] !== 'user') continue

    const name      = row['name']?.trim()
    const email     = row['email']?.trim()
    const password  = row['password']?.trim()
    const roleStr   = row['role']?.trim().toUpperCase()
    const credit    = Number(row['credits']?.trim() || 0)

    if (!name || !email) {
      console.warn(`  Skipping row with missing name/email: ${JSON.stringify(row)}`)
      continue
    }

    const systemRole = roleStr && roleStr in UserRole ? (roleStr as UserRole) : null

    const password_hash = password ? await hashPassword(password) : null
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, credit, password_hash, ...(systemRole ? { role: systemRole } : {}) },
      create: {
        name,
        email,
        credit,
        password_hash,
        ...(systemRole ? { role: systemRole } : {}),
      },
    })
    console.log(`  "${user.name}" <${user.email}> id=${user.id} credits=${user.credit}`)

    const clubsStr = row['belonging-clubs']?.trim()
    if (!clubsStr) continue

    for (const entry of clubsStr.split('/')) {
      const trimmed = entry.trim()
      if (!trimmed) continue
      const isManager = trimmed.startsWith('+')
      const clubName  = trimmed.replace(/^\+/, '').trim()
      const clubId    = clubMap.get(clubName)

      if (!clubId) {
        console.warn(`    Club "${clubName}" not found — define it as a club row before this user`)
        continue
      }

      const existing = await prisma.clubUser.findUnique({
        where: { clubId_userId: { clubId, userId: user.id } },
      })
      if (existing) {
        console.log(`    → "${clubName}" already joined, skipping`)
        continue
      }

      const role = isManager ? managerRole : memberRole
      await prisma.clubUser.create({ data: { clubId, userId: user.id, roleId: role.id } })
      console.log(`    → "${clubName}" as ${isManager ? 'CLUBMANAGER' : 'CLUBMEMBER'}`)
    }
  }

  console.log('\nDone.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
