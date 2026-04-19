import { FastifyInstance } from 'fastify'
import crypto from 'crypto'

const LINE_CHANNEL_ID     = process.env.LINE_CHANNEL_ID!
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!
const CALLBACK_URL        = process.env.LINE_CALLBACK_URL ?? 'http://localhost:3000/auth/line/callback'
const FRONTEND_URL        = process.env.FRONTEND_URL      ?? 'http://localhost:3001'

// In-memory state store (dev only — replace with Redis for production)
const stateStore = new Map<string, number>() // state → timestamp (ms)
const STATE_TTL  = 10 * 60 * 1000            // 10 minutes

function pruneStates() {
    const now = Date.now()
    for (const [k, ts] of stateStore) {
        if (now - ts > STATE_TTL) stateStore.delete(k)
    }
}

// Decode LINE's ID token payload without verifying (we trust LINE's token endpoint)
function decodeIdTokenPayload(idToken: string): Record<string, any> | null {
    try {
        const parts = idToken.split('.')
        if (parts.length !== 3) return null
        const raw     = parts[1]!
        const padded  = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=')
        const payload = Buffer.from(padded, 'base64').toString('utf8')
        return JSON.parse(payload)
    } catch {
        return null
    }
}

export default async function (fastify: FastifyInstance) {

    // GET /auth/line/authorize
    // Redirects the browser to LINE's authorization endpoint
    fastify.get('/auth/line/authorize', async (request, reply) => {
        pruneStates()
        const state = crypto.randomBytes(16).toString('hex')
        stateStore.set(state, Date.now())

        const params = new URLSearchParams({
            response_type: 'code',
            client_id:     LINE_CHANNEL_ID,
            redirect_uri:  CALLBACK_URL,
            state,
            scope:         'profile openid email',
        })

        return reply.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params}`)
    })

    // GET /auth/line/callback
    // LINE redirects here after the user approves. We exchange the code for tokens,
    // retrieve the user's profile, then create/link/find the local user.
    fastify.get('/auth/line/callback', async (request, reply) => {
        const { code, state, error } = request.query as Record<string, string>

        // ── Error from LINE ──────────────────────────────────────────────────
        if (error) {
            return reply.redirect(`${FRONTEND_URL}/login?error=line_denied`)
        }

        // ── Validate state ───────────────────────────────────────────────────
        if (!state || !stateStore.has(state)) {
            return reply.redirect(`${FRONTEND_URL}/login?error=invalid_state`)
        }
        stateStore.delete(state)

        // ── Exchange code for tokens ─────────────────────────────────────────
        let lineTokens: any
        try {
            const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type:    'authorization_code',
                    code:          code as string,
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

        // ── Get LINE profile ─────────────────────────────────────────────────
        let lineProfile: any
        try {
            const profileRes = await fetch('https://api.line.me/v2/profile', {
                headers: { Authorization: `Bearer ${lineTokens.access_token}` },
            })
            lineProfile = await profileRes.json()
        } catch {
            return reply.redirect(`${FRONTEND_URL}/login?error=line_profile_failed`)
        }

        const lineUserId    = lineProfile.userId as string
        const displayName   = lineProfile.displayName as string
        const pictureUrl    = lineProfile.pictureUrl as string | undefined

        // Extract email from ID token if present (requires email permission)
        let email: string | null = null
        if (lineTokens.id_token) {
            const payload = decodeIdTokenPayload(lineTokens.id_token)
            if (payload?.email) email = payload.email as string
        }

        // ── Find or create local user ────────────────────────────────────────

        // 1. Check if we already have an OAuth account for this LINE user
        const existingOAuth = await fastify.prisma.oAuthAccount.findUnique({
            where: { provider_providerAccountId: { provider: 'line', providerAccountId: lineUserId } },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
        })

        let localUser: { id: number; name: string; email: string; role: string | null }

        if (existingOAuth) {
            // Already linked — just sign in
            localUser = existingOAuth.user
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
                user = await fastify.prisma.user.create({
                    data: {
                        name:  displayName,
                        email: email ?? `line-${lineUserId}@line.user`,
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

        // ── Issue our own JWT and redirect to frontend ───────────────────────
        const token = fastify.jwt.sign({ id: localUser.id, email: localUser.email })

        // Pass token to frontend via query param; frontend stores it as a cookie
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
