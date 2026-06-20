import { Resend } from 'resend'
import { PrismaClient } from '../../../../generated/prisma/client'

function getResend() {
    return new Resend(process.env.RESEND_COM_API_KEY)
}

const FROM = process.env.MAIL_FROM ?? 'Mycologs <noreply@mycologs.club>'

// LINE accounts without a verified email are given a placeholder address in this
// domain (see auth-line.ts: `line-<id>@line.user`). It is not a real mailbox, so
// it must never be used as a delivery target.
export const PLACEHOLDER_EMAIL_DOMAIN = '@line.user'

// True only for an address we can actually deliver to. Use this before composing
// a notification so LINE-only users fall back to the in-app indicator instead.
export function isRealEmail(email: string | null | undefined): email is string {
    return !!email && email.includes('@') && !email.endsWith(PLACEHOLDER_EMAIL_DOMAIN)
}

// Escape user-controlled values before interpolating them into HTML email bodies.
export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

export async function sendMail(to: string[], subject: string, html: string) {
    // Drop blanks and undeliverable placeholder addresses (e.g. LINE-only users)
    // here so every caller is protected without repeating the check.
    const valid = to.map(s => s.trim()).filter(isRealEmail)
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

// Minimal structural logger so this lib stays decoupled from Fastify; pass
// `fastify.log` / `request.log` at the call site. Optional so tests can omit it.
type Logger = {
    info:  (...args: any[]) => void
    warn:  (...args: any[]) => void
    error: (...args: any[]) => void
}

export async function notifyAiCreditExhausted(prisma: PrismaClient, log?: Logger): Promise<void> {
    const now = Date.now()
    const last = await prisma.siteSetting.findUnique({ where: { key: AI_CREDIT_ALERT_KEY } })
    if (last) {
        const sentAt = new Date(last.value).getTime()
        if (Number.isFinite(sentAt) && now - sentAt < AI_CREDIT_ALERT_THROTTLE_MS) return
    }

    const admins = await getAdminEmails(prisma)
    if (admins.length === 0) {
        // Without this log a misconfigured deploy looks identical to a working
        // one: the user sees the outage message but no alert is ever sent.
        log?.error('AI credit exhausted but no admin emails are configured (Site Settings → adminEmail1/2/3); no alert sent')
        return
    }

    // Claim the throttle window first so a burst of concurrent failures can't all
    // fire. If the send then fails we release it (below) so the alert isn't lost
    // for a whole hour over a transient/misconfigured mail problem.
    await prisma.siteSetting.upsert({
        where:  { key: AI_CREDIT_ALERT_KEY },
        create: { key: AI_CREDIT_ALERT_KEY, value: new Date(now).toISOString() },
        update: { value: new Date(now).toISOString() },
    })

    try {
        await sendMail(
            admins,
            '【Mycologs】AIクレジット残高不足のお知らせ',
            `<p>Anthropic APIのクレジット残高が不足しており、AI同定機能が停止しています。</p>
<p>ユーザーには「一時的に利用できない」旨を表示し、消費されたクレジットは自動返却しています。</p>
<p>復旧するには <a href="https://console.anthropic.com/settings/billing">Anthropic Console（Plans &amp; Billing）</a> でクレジットを購入してください。</p>
<p style="color:#888;font-size:12px;">※ この通知は最大1時間に1回送信されます。</p>`
        )
        log?.info({ admins }, 'AI credit-exhaustion alert sent to admins')
    } catch (err) {
        // Roll the throttle back so the next exhaustion event retries instead of
        // being suppressed for an hour, and surface the cause (bad RESEND key,
        // unverified MAIL_FROM domain, etc.) which was previously swallowed.
        await prisma.siteSetting.update({
            where: { key: AI_CREDIT_ALERT_KEY },
            data:  { value: new Date(0).toISOString() },
        }).catch(() => {})
        log?.error({ err }, 'Failed to send AI credit-exhaustion alert to admins')
    }
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
