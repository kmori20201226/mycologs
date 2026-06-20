/**
 * Send a test LINE push to verify the Messaging API integration end-to-end.
 * Works from the dev environment — a push is an outbound call to LINE, so no
 * public URL / webhook is needed.
 *
 * Usage:
 *   npm run test-line-push -- --line <LINE_USER_ID> ["message"]
 *   npm run test-line-push -- --user <email|userId> ["message"]
 *
 * Requirements:
 *   - LINE_MESSAGE_CHANNEL_ID / LINE_MESSAGE_CHANNEL_SECRET set in .env
 *   - The target LINE user must have added the OA (mycologs, @492tkuxn) as a
 *     friend — otherwise LINE returns 403 and nothing is delivered.
 *
 * Examples:
 *   npm run test-line-push -- --line Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx "テスト 🍄"
 *   npm run test-line-push -- --user me@example.com
 */

import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { pushLineMessage, getLineUserId, isLineConfigured } from '../apps/api/src/lib/line'

async function main() {
  if (!isLineConfigured()) {
    console.error('LINE_MESSAGE_CHANNEL_ID / LINE_MESSAGE_CHANNEL_SECRET are not set in .env')
    process.exit(1)
  }

  const [flag, value, msgArg] = process.argv.slice(2)
  const message = msgArg ?? 'Mycologs LINE通知のテストです 🍄'

  if (!flag || !value || (flag !== '--line' && flag !== '--user')) {
    console.error('Usage:')
    console.error('  npm run test-line-push -- --line <LINE_USER_ID> ["message"]')
    console.error('  npm run test-line-push -- --user <email|userId> ["message"]')
    process.exit(1)
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    let lineUserId: string | null = value

    if (flag === '--user') {
      const user = /^\d+$/.test(value)
        ? await prisma.user.findUnique({ where: { id: Number(value) }, select: { id: true } })
        : await prisma.user.findUnique({ where: { email: value }, select: { id: true } })
      if (!user) {
        console.error(`No user found for "${value}"`)
        process.exit(1)
      }
      lineUserId = await getLineUserId(prisma, user.id)
      if (!lineUserId) {
        console.error(`User "${value}" has no linked LINE account in this database.`)
        process.exit(1)
      }
    }

    console.log(`Pushing to LINE userId: ${lineUserId}`)
    const ok = await pushLineMessage(lineUserId, message, console)
    if (ok) {
      console.log('✅ Push accepted by LINE — check your LINE app.')
    } else {
      console.log('❌ Push failed. Most likely the user has not added the OA (@492tkuxn) as a friend (403), or the userId is invalid / from a different provider.')
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
