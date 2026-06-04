import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

// ── fetch stub ────────────────────────────────────────────────────────────
// auth-line.ts calls LINE's endpoints with hardcoded URLs. We intercept
// globalThis.fetch and route by URL substring, so these tests assert BEHAVIOR
// (redirects, DB writes), never the URL string. That keeps them green when the
// URLs later move to env config.
//
// All scenarios run as sequential awaited subtests under one parent test, so
// only one fetch stub (a global) is ever live at a time, and the shared
// maintenanceMode row is mutated deterministically.
type StubOpts = {
    token?: any
    tokenStatus?: number
    tokenThrows?: boolean
    claims?: Record<string, any> | null
    verifyStatus?: number
    verifyThrows?: boolean
    profile?: any
    profileStatus?: number
    profileThrows?: boolean
}

function jsonResponse(body: any, status = 200): Response {
    return new Response(JSON.stringify(body ?? null), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

// Install a fetch stub, run fn, then always restore the real fetch.
async function withFetch<T>(opts: StubOpts, fn: () => Promise<T>): Promise<T> {
    const real = globalThis.fetch
    globalThis.fetch = (async (url: any) => {
        const u = String(url)
        if (u.includes('/oauth2/v2.1/token')) {
            if (opts.tokenThrows) throw new Error('network down')
            return jsonResponse(
                opts.token ?? { access_token: 'access-tok', token_type: 'Bearer', expires_in: 3600, scope: 'profile openid email' },
                opts.tokenStatus ?? 200,
            )
        }
        if (u.includes('/oauth2/v2.1/verify')) {
            if (opts.verifyThrows) throw new Error('network down')
            return jsonResponse(opts.claims ?? null, opts.verifyStatus ?? 200)
        }
        if (u.includes('/v2/profile')) {
            if (opts.profileThrows) throw new Error('network down')
            return jsonResponse(opts.profile ?? {}, opts.profileStatus ?? 200)
        }
        throw new Error(`unexpected fetch to ${u}`)
    }) as typeof fetch
    try {
        return await fn()
    } finally {
        globalThis.fetch = real
    }
}

const rand = () => Math.random().toString(36).slice(2, 10)

test('LINE auth flow', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())
    const prisma = (app as any).prisma

    // Run authorize first so a valid state+nonce is stored, then return the state.
    async function getValidState(): Promise<string> {
        const res = await app.inject({ method: 'GET', url: '/auth/line/authorize' })
        assert.equal(res.statusCode, 302)
        const state = new URL(res.headers.location as string).searchParams.get('state')
        assert.ok(state, 'authorize should set a state param')
        return state!
    }
    const callback = (state: string, extra = '&code=abc') =>
        app.inject({ method: 'GET', url: `/auth/line/callback?state=${state}${extra}` })

    async function setMaintenance(value: 'true' | 'false') {
        await prisma.siteSetting.upsert({
            where: { key: 'maintenanceMode' },
            update: { value },
            create: { key: 'maintenanceMode', value },
        })
    }

    // Defensive: a crashed prior run could leave maintenance on.
    await setMaintenance('false')

    // ── authorize ────────────────────────────────────────────────────────────
    await t.test('authorize redirects to LINE with required OAuth params', async () => {
        const res = await app.inject({ method: 'GET', url: '/auth/line/authorize' })
        assert.equal(res.statusCode, 302)
        const url = new URL(res.headers.location as string)
        assert.equal(url.searchParams.get('response_type'), 'code')
        assert.ok(url.searchParams.get('client_id'))
        assert.ok(url.searchParams.get('redirect_uri'))
        assert.ok(url.searchParams.get('state'))
        assert.ok(url.searchParams.get('nonce'))
        assert.equal(url.searchParams.get('scope'), 'profile openid email')
    })

    // ── callback: early-exit branches ─────────────────────────────────────────
    await t.test('error param redirects to line_denied', async () => {
        const res = await app.inject({ method: 'GET', url: '/auth/line/callback?error=access_denied' })
        assert.equal(res.statusCode, 302)
        assert.match(res.headers.location as string, /\/login\?error=line_denied$/)
    })

    await t.test('no state redirects to invalid_state', async () => {
        const res = await app.inject({ method: 'GET', url: '/auth/line/callback?code=abc' })
        assert.match(res.headers.location as string, /error=invalid_state$/)
    })

    await t.test('unknown state redirects to invalid_state', async () => {
        const res = await callback(rand())
        assert.match(res.headers.location as string, /error=invalid_state$/)
    })

    await t.test('valid state but no code redirects to invalid_state', async () => {
        const state = await getValidState()
        const res = await callback(state, '')
        assert.match(res.headers.location as string, /error=invalid_state$/)
    })

    // ── callback: token / profile failure branches ────────────────────────────
    await t.test('token response without access_token redirects to line_token_failed', async () => {
        const state = await getValidState()
        const res = await withFetch({ token: {} }, () => callback(state))
        assert.match(res.headers.location as string, /error=line_token_failed$/)
    })

    await t.test('token fetch throwing redirects to line_token_failed', async () => {
        const state = await getValidState()
        const res = await withFetch({ tokenThrows: true }, () => callback(state))
        assert.match(res.headers.location as string, /error=line_token_failed$/)
    })

    await t.test('profile fetch throwing redirects to line_profile_failed', async () => {
        const state = await getValidState()
        const res = await withFetch({ profileThrows: true }, () => callback(state))
        assert.match(res.headers.location as string, /error=line_profile_failed$/)
    })

    // ── callback: happy paths (user creation / linking) ───────────────────────
    await t.test('new LINE user without email gets @line.user placeholder and is linked', async () => {
        const lineUserId = `U-${rand()}`
        const state = await getValidState()
        const res = await withFetch(
            { profile: { userId: lineUserId, displayName: 'New Mushroom Fan' } }, // no id_token → email null
            () => callback(state),
        )
        const loc = new URL(res.headers.location as string)
        assert.match(loc.pathname, /\/auth\/line\/complete$/)
        assert.ok(loc.searchParams.get('token'))
        assert.equal(loc.searchParams.get('name'), 'New Mushroom Fan')
        assert.equal(loc.searchParams.get('email'), `line-${lineUserId}@line.user`)

        const oauth = await prisma.oAuthAccount.findUnique({
            where: { provider_providerAccountId: { provider: 'line', providerAccountId: lineUserId } },
            include: { user: true },
        })
        assert.ok(oauth, 'oauth account should be created')
        assert.equal(oauth.user.email, `line-${lineUserId}@line.user`)
    })

    await t.test('new LINE user with verified email is created with the real email', async () => {
        const lineUserId = `U-${rand()}`
        const email = `real-${rand()}@example.com`
        const state = await getValidState()
        const res = await withFetch(
            {
                token: { access_token: 'at', id_token: 'idtok', token_type: 'Bearer', expires_in: 3600 },
                claims: { email },
                profile: { userId: lineUserId, displayName: 'Verified User' },
            },
            () => callback(state),
        )
        assert.equal(new URL(res.headers.location as string).searchParams.get('email'), email)
        assert.ok(await prisma.user.findUnique({ where: { email } }), 'user with real email should exist')
    })

    await t.test('existing LINE account signs in without creating a new user', async () => {
        const lineUserId = `U-${rand()}`
        const email = `existing-${rand()}@example.com`
        const created = await prisma.user.create({ data: { name: 'Returning User', email } })
        await prisma.oAuthAccount.create({ data: { userId: created.id, provider: 'line', providerAccountId: lineUserId } })

        const state = await getValidState()
        const res = await withFetch(
            { profile: { userId: lineUserId, displayName: 'Returning User' } },
            () => callback(state),
        )
        const loc = new URL(res.headers.location as string)
        assert.equal(loc.searchParams.get('id'), String(created.id))
        assert.equal(loc.searchParams.get('email'), email)
    })

    await t.test('placeholder @line.user email is upgraded to the real email on next login', async () => {
        const lineUserId = `U-${rand()}`
        const placeholder = `line-${lineUserId}@line.user`
        const realEmail = `upgraded-${rand()}@example.com`
        const created = await prisma.user.create({ data: { name: 'Upgrade Me', email: placeholder } })
        await prisma.oAuthAccount.create({ data: { userId: created.id, provider: 'line', providerAccountId: lineUserId } })

        const state = await getValidState()
        await withFetch(
            {
                token: { access_token: 'at', id_token: 'idtok', token_type: 'Bearer' },
                claims: { email: realEmail },
                profile: { userId: lineUserId, displayName: 'Upgrade Me' },
            },
            () => callback(state),
        )
        const updated = await prisma.user.findUnique({ where: { id: created.id } })
        assert.equal(updated.email, realEmail)
    })

    await t.test('existing user matched by email gets a LINE account linked', async () => {
        const lineUserId = `U-${rand()}`
        const email = `match-${rand()}@example.com`
        const created = await prisma.user.create({ data: { name: 'Email Match', email } })

        const state = await getValidState()
        const res = await withFetch(
            {
                token: { access_token: 'at', id_token: 'idtok', token_type: 'Bearer' },
                claims: { email },
                profile: { userId: lineUserId, displayName: 'Email Match' },
            },
            () => callback(state),
        )
        assert.equal(new URL(res.headers.location as string).searchParams.get('id'), String(created.id))

        const oauth = await prisma.oAuthAccount.findUnique({
            where: { provider_providerAccountId: { provider: 'line', providerAccountId: lineUserId } },
        })
        assert.ok(oauth, 'oauth account should be linked to the existing user')
        assert.equal(oauth.userId, created.id)
    })

    // ── callback: maintenance mode ─────────────────────────────────────────────
    await t.test('maintenance mode blocks a non-admin LINE login', async () => {
        await setMaintenance('true')
        try {
            const lineUserId = `U-${rand()}`
            const state = await getValidState()
            const res = await withFetch(
                { profile: { userId: lineUserId, displayName: 'Blocked User' } },
                () => callback(state),
            )
            assert.match(res.headers.location as string, /error=maintenance$/)
        } finally {
            await setMaintenance('false')
        }
    })

    await t.test('maintenance mode still allows an admin LINE login through', async () => {
        await setMaintenance('true')
        try {
            const lineUserId = `U-${rand()}`
            const email = `admin-${rand()}@example.com`
            const admin = await prisma.user.create({ data: { name: 'Admin User', email, role: 'ADMIN' } })
            await prisma.oAuthAccount.create({ data: { userId: admin.id, provider: 'line', providerAccountId: lineUserId } })

            const state = await getValidState()
            const res = await withFetch(
                { profile: { userId: lineUserId, displayName: 'Admin User' } },
                () => callback(state),
            )
            assert.match(new URL(res.headers.location as string).pathname, /\/auth\/line\/complete$/)
        } finally {
            await setMaintenance('false')
        }
    })
})
