import test from 'node:test'
import assert from 'node:assert/strict'

// Resend (email) needs a key at send time, and the notification builds a link
// from APP_URL. Set harmless defaults before the app boots; the outbound email
// itself is intercepted via a globalThis.fetch stub below, so nothing is sent.
process.env.RESEND_COM_API_KEY = process.env.RESEND_COM_API_KEY || 'test_key'
process.env.APP_URL = process.env.APP_URL || 'https://example.com'

import { buildApp } from '../src/app'

async function waitFor<T>(fn: () => T | undefined, timeoutMs = 2000): Promise<T | undefined> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        const v = fn()
        if (v) return v
        await new Promise(r => setTimeout(r, 25))
    }
    return fn()
}

test('admin threads: user unread count, read marking, and admin-reply email', async (t) => {
    const app = await buildApp()
    const ts = Date.now()

    const mkUser = async (suffix: string) => {
        const res = await app.inject({
            method: 'POST',
            url: '/users',
            payload: { name: `thread-${suffix} ${ts}`, email: `thread-${suffix}-${ts}@example.com`, password: 'password123' },
        })
        return res.json() as any
    }

    const user  = await mkUser('user')
    const admin = await mkUser('admin')
    const other = await mkUser('other')
    await app.prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })

    const auth = (id: number, email: string) => ({ authorization: `Bearer ${app.jwt.sign({ id, email })}` })
    const userAuth  = auth(user.id, user.email)
    const adminAuth = auth(admin.id, admin.email)
    const otherAuth = auth(other.id, other.email)

    t.after(async () => {
        // Deleting the threads cascades their messages, which must go before the
        // admin user is removed (AdminMessage.sender has no cascade).
        await app.prisma.adminThread.deleteMany({ where: { userId: { in: [user.id, other.id] } } })
        await app.prisma.user.deleteMany({ where: { id: { in: [user.id, admin.id, other.id] } } })
        await app.close()
    })

    const myCount = async (headers: Record<string, string>) => {
        const res = await app.inject({ method: 'GET', url: '/admin-threads/my-unread-count', headers })
        assert.equal(res.statusCode, 200)
        return (res.json() as any).count as number
    }

    // The endpoint requires auth.
    const noAuth = await app.inject({ method: 'GET', url: '/admin-threads/my-unread-count' })
    assert.equal(noAuth.statusCode, 401)

    // User opens an inquiry.
    const createRes = await app.inject({
        method: 'POST', url: '/admin-threads', headers: userAuth,
        payload: { subject: `件名 ${ts}`, body: 'はじめまして' },
    })
    assert.equal(createRes.statusCode, 201)
    const thread = createRes.json() as any

    // The user's own opening message is not an "unread admin reply".
    assert.equal(await myCount(userAuth), 0)

    // Admin replies — intercept the outbound Resend email instead of sending it.
    const sentEmails: any[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: any, init?: any) => {
        const u = String(url)
        if (u.includes('api.resend.com')) {
            try { sentEmails.push(JSON.parse(String(init?.body ?? '{}'))) } catch { /* ignore */ }
            return new Response(JSON.stringify({ id: 'test-email' }), {
                status: 200, headers: { 'content-type': 'application/json' },
            })
        }
        return realFetch(url, init)
    }) as typeof fetch

    try {
        const replyRes = await app.inject({
            method: 'POST', url: `/admin-threads/${thread.id}/messages`, headers: adminAuth,
            payload: { body: 'お問い合わせありがとうございます' },
        })
        assert.equal(replyRes.statusCode, 201)

        // The thread owner now has one unread admin reply…
        assert.equal(await myCount(userAuth), 1)
        // …but an unrelated user does not (it isn't their thread).
        assert.equal(await myCount(otherAuth), 0)
        // …and the admin's own dashboard query isn't affected by this endpoint.
        assert.equal(await myCount(adminAuth), 0)

        // The notification email is fire-and-forget; wait for it to settle.
        const email = await waitFor(() => sentEmails.find(e => {
            const to = Array.isArray(e.to) ? e.to : [e.to]
            return to.includes(user.email)
        }))
        assert.ok(email, 'admin reply should trigger a notification email to the thread owner')
        assert.match(String(email.subject), /返信/)
        assert.match(String(email.html), new RegExp(`件名 ${ts}`))
    } finally {
        globalThis.fetch = realFetch
    }

    // Opening the thread marks the admin's replies read, clearing the count.
    const getRes = await app.inject({ method: 'GET', url: `/admin-threads/${thread.id}`, headers: userAuth })
    assert.equal(getRes.statusCode, 200)
    assert.equal(await myCount(userAuth), 0)
})

test('admin-reply email escapes HTML in a user-controlled subject', async (t) => {
    const app = await buildApp()
    const ts = Date.now()

    const mkUser = async (suffix: string) => {
        const res = await app.inject({
            method: 'POST', url: '/users',
            payload: { name: `esc-${suffix} ${ts}`, email: `esc-${suffix}-${ts}@example.com`, password: 'password123' },
        })
        return res.json() as any
    }

    const user  = await mkUser('user')
    const admin = await mkUser('admin')
    await app.prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })

    const auth = (id: number, email: string) => ({ authorization: `Bearer ${app.jwt.sign({ id, email })}` })

    t.after(async () => {
        await app.prisma.adminThread.deleteMany({ where: { userId: user.id } })
        await app.prisma.user.deleteMany({ where: { id: { in: [user.id, admin.id] } } })
        await app.close()
    })

    const createRes = await app.inject({
        method: 'POST', url: '/admin-threads', headers: auth(user.id, user.email),
        payload: { subject: `<script>x</script> ${ts}`, body: 'hi' },
    })
    const thread = createRes.json() as any

    const sentEmails: any[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: any, init?: any) => {
        if (String(url).includes('api.resend.com')) {
            try { sentEmails.push(JSON.parse(String(init?.body ?? '{}'))) } catch { /* ignore */ }
            return new Response(JSON.stringify({ id: 'test-email' }), {
                status: 200, headers: { 'content-type': 'application/json' },
            })
        }
        return realFetch(url, init)
    }) as typeof fetch

    try {
        await app.inject({
            method: 'POST', url: `/admin-threads/${thread.id}/messages`, headers: auth(admin.id, admin.email),
            payload: { body: 'reply' },
        })
        const email = await waitFor(() => sentEmails.find(e => {
            const to = Array.isArray(e.to) ? e.to : [e.to]
            return to.includes(user.email)
        }))
        assert.ok(email, 'expected a notification email')
        assert.ok(!String(email.html).includes('<script>x</script>'), 'raw subject markup must not appear unescaped')
        assert.match(String(email.html), /&lt;script&gt;/)
    } finally {
        globalThis.fetch = realFetch
    }
})

test('admin reply does not email a LINE-only user (placeholder address), but still flags it in-app', async (t) => {
    const app = await buildApp()
    const ts = Date.now()

    const mkUser = async (suffix: string) => {
        const res = await app.inject({
            method: 'POST', url: '/users',
            payload: { name: `line-${suffix} ${ts}`, email: `line-${suffix}-${ts}@example.com`, password: 'password123' },
        })
        return res.json() as any
    }

    const user  = await mkUser('user')
    const admin = await mkUser('admin')
    await app.prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
    // Simulate a LINE registration with no verified email: the placeholder address
    // that auth-line.ts assigns (`line-<id>@line.user`).
    const placeholder = `line-${user.id}@line.user`
    await app.prisma.user.update({ where: { id: user.id }, data: { email: placeholder } })

    const auth = (id: number, email: string) => ({ authorization: `Bearer ${app.jwt.sign({ id, email })}` })

    t.after(async () => {
        await app.prisma.adminThread.deleteMany({ where: { userId: user.id } })
        await app.prisma.user.deleteMany({ where: { id: { in: [user.id, admin.id] } } })
        await app.close()
    })

    const createRes = await app.inject({
        method: 'POST', url: '/admin-threads', headers: auth(user.id, placeholder),
        payload: { subject: `件名 ${ts}`, body: 'hi' },
    })
    const thread = createRes.json() as any

    const sentEmails: any[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: any, init?: any) => {
        if (String(url).includes('api.resend.com')) {
            try { sentEmails.push(JSON.parse(String(init?.body ?? '{}'))) } catch { /* ignore */ }
            return new Response(JSON.stringify({ id: 'test-email' }), {
                status: 200, headers: { 'content-type': 'application/json' },
            })
        }
        return realFetch(url, init)
    }) as typeof fetch

    try {
        const replyRes = await app.inject({
            method: 'POST', url: `/admin-threads/${thread.id}/messages`, headers: auth(admin.id, admin.email),
            payload: { body: 'reply' },
        })
        assert.equal(replyRes.statusCode, 201)

        // In-app notification still works for LINE-only users.
        const countRes = await app.inject({ method: 'GET', url: '/admin-threads/my-unread-count', headers: auth(user.id, placeholder) })
        assert.equal((countRes.json() as any).count, 1)

        // Give the fire-and-forget path time, then assert no email targeted the
        // placeholder mailbox.
        await new Promise(r => setTimeout(r, 300))
        const leaked = sentEmails.find(e => {
            const to = Array.isArray(e.to) ? e.to : [e.to]
            return to.some((addr: string) => String(addr).endsWith('@line.user'))
        })
        assert.equal(leaked, undefined, 'must not send email to a @line.user placeholder address')
    } finally {
        globalThis.fetch = realFetch
    }
})
