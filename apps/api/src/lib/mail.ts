import { Resend } from 'resend'
import { PrismaClient } from '../../../../generated/prisma/client'

function getResend() {
    return new Resend(process.env.RESEND_COM_API_KEY)
}

const FROM = process.env.MAIL_FROM ?? 'Mycologs <noreply@mycologs.club>'

export async function sendMail(to: string[], subject: string, html: string) {
    const valid = to.map(s => s.trim()).filter(Boolean)
    if (valid.length === 0) return
    await getResend().emails.send({ from: FROM, to: valid, subject, html })
}

export async function getAdminEmails(prisma: PrismaClient): Promise<string[]> {
    const rows = await prisma.siteSetting.findMany({
        where: { key: { in: ['adminEmail1', 'adminEmail2', 'adminEmail3'] } },
        select: { value: true }
    })
    return rows.map(r => r.value).filter(Boolean)
}

// Notify admins that the Anthropic account credit is exhausted, throttled so a
// burst of failing AI requests can't spam inboxes. The throttle timestamp lives
// in site_settings so it survives restarts and is shared across API instances.
const AI_CREDIT_ALERT_KEY = 'aiCreditAlertSentAt'
const AI_CREDIT_ALERT_THROTTLE_MS = 60 * 60 * 1000 // 1 hour

export async function notifyAiCreditExhausted(prisma: PrismaClient): Promise<void> {
    const now = Date.now()
    const last = await prisma.siteSetting.findUnique({ where: { key: AI_CREDIT_ALERT_KEY } })
    if (last) {
        const sentAt = new Date(last.value).getTime()
        if (Number.isFinite(sentAt) && now - sentAt < AI_CREDIT_ALERT_THROTTLE_MS) return
    }

    const admins = await getAdminEmails(prisma)
    if (admins.length === 0) return

    // Mark as sent before awaiting the send so concurrent failures don't all fire.
    await prisma.siteSetting.upsert({
        where:  { key: AI_CREDIT_ALERT_KEY },
        create: { key: AI_CREDIT_ALERT_KEY, value: new Date(now).toISOString() },
        update: { value: new Date(now).toISOString() },
    })

    await sendMail(
        admins,
        '【Mycologs】AIクレジット残高不足のお知らせ',
        `<p>Anthropic APIのクレジット残高が不足しており、AI同定機能が停止しています。</p>
<p>ユーザーには「一時的に利用できない」旨を表示し、消費されたクレジットは自動返却しています。</p>
<p>復旧するには <a href="https://console.anthropic.com/settings/billing">Anthropic Console（Plans &amp; Billing）</a> でクレジットを購入してください。</p>
<p style="color:#888;font-size:12px;">※ この通知は最大1時間に1回送信されます。</p>`
    ).catch(() => { /* never let a mail failure break the request path */ })
}

export async function getClubManagerEmails(prisma: PrismaClient, clubId: number): Promise<string[]> {
    const managerRole = await prisma.role.findUnique({ where: { name: 'CLUBMANAGER' } })
    if (!managerRole) return []
    const members = await prisma.clubUser.findMany({
        where: { clubId, roleId: managerRole.id },
        include: { user: { select: { email: true } } }
    })
    return members.map(m => m.user.email).filter(Boolean)
}
