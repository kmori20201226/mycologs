import { FastifyInstance } from 'fastify'
import crypto from 'crypto'

const LINE_CHANNEL_ID     = process.env.LINE_LOGIN_CHANNEL_ID!
const LINE_CHANNEL_SECRET = process.env.LINE_LOGIN_CHANNEL_SECRET!
const CALLBACK_URL        = process.env.LINE_CALLBACK_URL || 'http://localhost:3000/auth/line/callback'
const FRONTEND_URL        = (process.env.FRONTEND_URL || 'http://localhost:3001').split(',')[0].trim()

// In-memory session store: state → { timestamp, nonce }
// Dev only — replace with Redis for production
const sessionStore = new Map<string, { ts: number; nonce: string }>()
const SESSION_TTL  = 10 * 60 * 1000  // 10 minutes

function pruneSessions() {
    const now = Date.now()
    for (const [k, v] of sessionStore) {
        if (now - v.ts > SESSION_TTL) sessionStore.delete(k)
    }
}

// Verify ID token via LINE's official verify endpoint.
// Returns the claims payload, or null on failure.
async function verifyIdToken(
    idToken: string,
    nonce: string,
): Promise<Record<string, any> | null> {
    try {
        const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                id_token:  idToken,
                client_id: LINE_CHANNEL_ID,
                nonce,
            }),
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

export default async function (fastify: FastifyInstance) {

    // GET /auth/line/authorize
    // Generates state + nonce, stores them, then redirects to LINE.
    fastify.get('/auth/line/authorize', async (request, reply) => {
        pruneSessions()
        const state = crypto.randomBytes(16).toString('hex')
        const nonce = crypto.randomBytes(16).toString('hex')
        sessionStore.set(state, { ts: Date.now(), nonce })

        const params = new URLSearchParams({
            response_type: 'code',
            client_id:     LINE_CHANNEL_ID,
            redirect_uri:  CALLBACK_URL,
            state,
            nonce,
            scope:         'profile openid email',
        })

        return reply.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params}`)
    })

    // GET /auth/line/callback
    // LINE redirects here after the user approves.
    fastify.get('/auth/line/callback', async (request, reply) => {
        const { code, state, error } = request.query as { code?: string; state?: string; error?: string }

        // ── Error from LINE ──────────────────────────────────────────────────
        if (error) {
            return reply.redirect(`${FRONTEND_URL}/login?error=line_denied`)
        }

        // ── Validate state and retrieve nonce ────────────────────────────────
        const session = state ? sessionStore.get(state) : undefined
        if (!session || !state || !code) {
            return reply.redirect(`${FRONTEND_URL}/login?error=invalid_state`)
        }
        sessionStore.delete(state)
        const { nonce } = session

        // ── Exchange code for tokens ─────────────────────────────────────────
        let lineTokens: any
        try {
            const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type:    'authorization_code',
                    code,
                    redirect_uri:  CALLBACK_URL,
                    client_id:     LINE_CHANNEL_ID,
                    client_secret: LINE_CHANNEL_SECRET,
                }),
            })
            lineTokens = await tokenRes.json()
        } catch {
            return reply.redirect(`${FRONTEND_URL}/login?error=line_token_failed`)
        }

        if (!lineTokens.access_token) {
            return reply.redirect(`${FRONTEND_URL}/login?error=line_token_failed`)
        }

        // ── Verify ID token via LINE's verify endpoint ───────────────────────
        // This validates signature, expiry, audience, and nonce in one call.
        let idClaims: Record<string, any> | null = null
        if (lineTokens.id_token) {
            idClaims = await verifyIdToken(lineTokens.id_token, nonce)
        }

        // ── Get LINE profile (always available with profile scope) ───────────
        let lineProfile: any
        try {
            const profileRes = await fetch('https://api.line.me/v2/profile', {
                headers: { Authorization: `Bearer ${lineTokens.access_token}` },
            })
            lineProfile = await profileRes.json()
        } catch {
            return reply.redirect(`${FRONTEND_URL}/login?error=line_profile_failed`)
        }

        const lineUserId  = lineProfile.userId    as string
        const displayName = lineProfile.displayName as string

        // Email comes from the verified ID token claims (requires email permission)
        const email: string | null = idClaims?.email ?? null

        // ── Find or create local user ────────────────────────────────────────

        // 1. Check if we already have an OAuth account for this LINE user
        const existingOAuth = await fastify.prisma.oAuthAccount.findUnique({
            where: { provider_providerAccountId: { provider: 'line', providerAccountId: lineUserId } },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
        })

        let localUser: { id: number; name: string; email: string; role: string | null }

        if (existingOAuth) {
            // Already linked — sign in, and upgrade placeholder email if real one is now available
            localUser = existingOAuth.user
            if (email && existingOAuth.user.email.endsWith('@line.user')) {
                // Check no other account already uses this email before updating
                const conflict = await fastify.prisma.user.findUnique({ where: { email } })
                if (!conflict) {
                    const updated = await fastify.prisma.user.update({
                        where: { id: existingOAuth.user.id },
                        data: { email },
                        select: { id: true, name: true, email: true, role: true },
                    })
                    localUser = updated
                }
            }
        } else {
            // 2. Try to find an existing user by email and link them
            let user = email
                ? await fastify.prisma.user.findUnique({
                    where: { email },
                    select: { id: true, name: true, email: true, role: true },
                })
                : null

            // 3. No existing user — create one from LINE profile
            if (!user) {
                const freePlan = await fastify.prisma.plan.findUnique({ where: { id: 'free' } })
                const freeTierCredits = freePlan?.creditsPerPeriod ?? 50
                user = await fastify.prisma.user.create({
                    data: {
                        name:   displayName,
                        email:  email ?? `line-${lineUserId}@line.user`,
                        credit: freeTierCredits,
                    },
                    select: { id: true, name: true, email: true, role: true },
                })
            }

            // 4. Create the OAuthAccount link
            await fastify.prisma.oAuthAccount.create({
                data: {
                    userId:            user.id,
                    provider:          'line',
                    providerAccountId: lineUserId,
                    accessToken:       lineTokens.access_token,
                    refreshToken:      lineTokens.refresh_token ?? null,
                    expiresAt:         lineTokens.expires_in
                        ? Math.floor(Date.now() / 1000) + Number(lineTokens.expires_in)
                        : null,
                    tokenType:         lineTokens.token_type ?? null,
                    scope:             lineTokens.scope ?? null,
                    idToken:           lineTokens.id_token ?? null,
                },
            })

            localUser = user
        }

        // ── Block non-admin login during maintenance ─────────────────────────
        const ADMIN_ROLES = ['ADMIN', 'DEVELOPER', 'MODERATOR']
        if (!ADMIN_ROLES.includes(localUser.role ?? '')) {
            const maintenance = await fastify.prisma.siteSetting.findUnique({ where: { key: 'maintenanceMode' } })
            if (maintenance?.value === 'true') {
                return reply.redirect(`${FRONTEND_URL}/login?error=maintenance`)
            }
        }

        // ── Issue our own JWT and redirect to frontend ───────────────────────
        const token = fastify.jwt.sign({ id: localUser.id, email: localUser.email })

        const params = new URLSearchParams({
            token,
            id:    String(localUser.id),
            name:  localUser.name,
            email: localUser.email,
            ...(localUser.role ? { role: localUser.role } : {}),
        })

        return reply.redirect(`${FRONTEND_URL}/auth/line/complete?${params}`)
    })
}
