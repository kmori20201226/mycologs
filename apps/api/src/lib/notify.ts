import { PrismaClient } from '../../../../generated/prisma/client'
import { sendMail, isRealEmail } from './mail'
import { pushLineMessage, getLineUserId } from './line'

type Logger = {
    info:  (...args: any[]) => void
    warn:  (...args: any[]) => void
    error: (...args: any[]) => void
}

export interface NotifyMessage {
    subject: string  // email subject
    html:    string  // email body (HTML; interpolated values must be escaped)
    text:    string  // plain-text body for LINE push
}

// Notify a user through the best channel available to them:
//   1. a real email address  → email
//   2. otherwise a LINE link  → LINE push (e.g. LINE-only users with no email)
//   3. otherwise              → nothing here (the in-app unread badge covers them)
// LINE push can still silently no-op if the user never added the OA as a friend,
// which is fine — the in-app badge remains the guaranteed channel.
export async function notifyUser(
    prisma: PrismaClient,
    userId: number,
    msg: NotifyMessage,
    log?: Logger,
): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!user) return

    if (isRealEmail(user.email)) {
        await sendMail([user.email], msg.subject, msg.html)
        return
    }

    const lineUserId = await getLineUserId(prisma, userId)
    if (lineUserId) {
        await pushLineMessage(lineUserId, msg.text, log)
    }
}
