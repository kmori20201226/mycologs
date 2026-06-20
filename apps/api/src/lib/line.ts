import { PrismaClient } from '../../../../generated/prisma/client'

// LINE Messaging API (the "mycologs" Official Account, @492tkuxn). This channel
// shares a provider with the LINE Login channel, so the userId we already store
// from login (OAuthAccount.providerAccountId) is a valid push target.
//
// Env is read at call time (not module load) so it works regardless of when
// dotenv populates the environment relative to this module being imported.
const apiBase = () => process.env.LINE_API_BASE ?? 'https://api.line.me'

// Minimal structural logger so this lib stays decoupled from Fastify; pass
// `request.log` at the call site. Optional so tests/non-request paths can omit it.
type Logger = {
    info:  (...args: any[]) => void
    warn:  (...args: any[]) => void
    error: (...args: any[]) => void
}

export function isLineConfigured(): boolean {
    return !!(process.env.LINE_MESSAGE_CHANNEL_ID && process.env.LINE_MESSAGE_CHANNEL_SECRET)
}

// Short-lived (30-day) client_credentials channel token, cached in-process.
// Issuing a new one does not revoke older ones, so racing instances are fine.
let cached: { token: string; expiresAt: number } | null = null

async function getChannelToken(log?: Logger): Promise<string | null> {
    if (!isLineConfigured()) return null
    const now = Date.now()
    if (cached && cached.expiresAt - now > 60_000) return cached.token
    try {
        const res = await fetch(`${apiBase()}/v2/oauth/accessToken`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type:    'client_credentials',
                client_id:     process.env.LINE_MESSAGE_CHANNEL_ID!,
                client_secret: process.env.LINE_MESSAGE_CHANNEL_SECRET!,
            }),
        })
        if (!res.ok) {
            log?.error({ status: res.status }, 'Failed to mint LINE channel token')
            return null
        }
        const data = await res.json() as { access_token?: string; expires_in?: number }
        if (!data.access_token) return null
        const ttlMs = (data.expires_in ?? 2_592_000) * 1000
        cached = { token: data.access_token, expiresAt: now + ttlMs }
        return cached.token
    } catch (err) {
        log?.error({ err }, 'Error minting LINE channel token')
        return null
    }
}

// Push a plain-text message to a LINE user. Returns true only on delivery.
// A 403 means the user has not added the OA as a friend (or blocked it) — an
// expected, non-error outcome that the caller handles by falling back.
export async function pushLineMessage(lineUserId: string, text: string, log?: Logger): Promise<boolean> {
    const token = await getChannelToken(log)
    if (!token) return false
    try {
        const res = await fetch(`${apiBase()}/v2/bot/message/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
        })
        if (res.ok) return true
        if (res.status !== 403) {
            log?.error({ status: res.status }, 'LINE push failed')
        }
        return false
    } catch (err) {
        log?.error({ err }, 'LINE push threw')
        return false
    }
}

// The LINE userId linked to a Mycologs user, or null if they did not register
// via LINE. Pushable directly because both LINE channels share one provider.
export async function getLineUserId(prisma: PrismaClient, userId: number): Promise<string | null> {
    const oa = await prisma.oAuthAccount.findFirst({
        where:  { userId, provider: 'line' },
        select: { providerAccountId: true },
    })
    return oa?.providerAccountId ?? null
}
