import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { buildApp } from '../src/app'

// Characterization tests for how the API reacts when the Anthropic *account*
// credit is exhausted (the AI service replies 503 insufficient_ai_credit).
// Like ai-geocode.test.ts we stub globalThis.fetch and assert BEHAVIOUR, and run
// every scenario as sequential awaited subtests so the global stub never races.
//
// Covered:
//  - post moderation (runModeration): credit-exhaustion blocks the post with a
//    distinct 503 and writes NO penalty; other failures fail open (post created)
//  - ai-identify: credit is refunded when the AI call can't be fulfilled

// Resolve the same uploads dir the route reads from (apps/api/test → repo root).
const UPLOADS_DIR = path.resolve(__dirname, '../../../data/uploads')

function jsonResponse(body: any, status = 200): Response {
    return new Response(JSON.stringify(body ?? null), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

const creditExhausted = () => jsonResponse({ detail: 'insufficient_ai_credit' }, 503)

type AiHandler = (url: string, init?: any) => Response | Promise<Response>

async function withAi<T>(handler: AiHandler, fn: () => Promise<T>): Promise<T> {
    const real = globalThis.fetch
    globalThis.fetch = (async (url: any, init?: any) => {
        const u = String(url)
        if (u.includes('/api/moderation/evaluate') || u.includes('/api/identification/evaluate')) {
            return handler(u, init)
        }
        // Anything else (e.g. an outbound Resend email) is not part of these
        // tests — throwing keeps a stray network call from escaping.
        throw new Error(`unexpected fetch to ${u}`)
    }) as typeof fetch
    try {
        return await fn()
    } finally {
        globalThis.fetch = real
    }
}

test('AI credit exhaustion handling', async (t) => {
    const app = await buildApp()
    // Self-clean: tests hit the real dev DB, so remove the rows this run created
    // (scoped by the per-run timestamp) before closing. Deleting the users
    // cascades their posts/media/identifications/votes; user_log and
    // ai_usage_log have no cascade, so clear them first.
    t.after(async () => {
        const users = await app.prisma.user.findMany({
            where: { email: { startsWith: 'ai-credit-', endsWith: `-${ts}@example.com` } },
            select: { id: true },
        })
        const ids = users.map((u) => u.id)
        await app.prisma.aiUsageLog.deleteMany({ where: { userId: { in: ids } } })
        await app.prisma.userLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdBy: { in: ids } }] } })
        await app.prisma.user.deleteMany({ where: { id: { in: ids } } })
        await app.close()
    })

    // Pin the admin-alert throttle to "just now" so notifyAiCreditExhausted()
    // always short-circuits and never tries to send a real email during tests.
    await app.prisma.siteSetting.upsert({
        where:  { key: 'aiCreditAlertSentAt' },
        create: { key: 'aiCreditAlertSentAt', value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
    })

    const ts = Date.now()
    const makeUser = (suffix: string, credit = 0) =>
        app.prisma.user.create({
            data: { name: `ai-credit ${suffix} ${ts}`, email: `ai-credit-${suffix}-${ts}@example.com`, credit },
        })

    // ── Post moderation (runModeration) ──────────────────────────────────────

    await t.test('credit exhaustion blocks a new post with a distinct 503 and no penalty', async () => {
        const user = await makeUser('mod-create')
        const before = await app.prisma.userLog.count({ where: { userId: user.id } })

        const res = await withAi(creditExhausted, () =>
            app.inject({ method: 'POST', url: '/posts', payload: { userId: user.id, contents: `投稿テスト ${ts}` } }),
        )

        assert.equal(res.statusCode, 503)
        const body = res.json() as any
        assert.equal(body.status, 'unavailable')
        assert.match(body.message, /一時的/)

        // The key bug: the user must NOT be penalised for our billing problem.
        const after = await app.prisma.userLog.count({ where: { userId: user.id } })
        assert.equal(after, before)
    })

    await t.test('a moderation network failure fails open (post is created)', async () => {
        const user = await makeUser('mod-open')
        const res = await withAi(
            () => { throw new Error('ai service down') },
            () => app.inject({ method: 'POST', url: '/posts', payload: { userId: user.id, contents: `失敗オープン ${ts}` } }),
        )
        assert.equal(res.statusCode, 201)
    })

    await t.test('a rejected post still returns 422 and logs a penalty (unchanged)', async () => {
        const user = await makeUser('mod-reject')
        const before = await app.prisma.userLog.count({ where: { userId: user.id } })

        const res = await withAi(
            () => jsonResponse({ allowed: false, category: 'OFFENSIVE_SEXUAL', point: -5, comment: 'NG' }),
            () => app.inject({ method: 'POST', url: '/posts', payload: { userId: user.id, contents: `不適切 ${ts}` } }),
        )

        assert.equal(res.statusCode, 422)
        assert.equal((res.json() as any).status, 'rejected')
        const after = await app.prisma.userLog.count({ where: { userId: user.id } })
        assert.equal(after, before + 1)
    })

    await t.test('credit exhaustion blocks a caption edit with a distinct 503', async () => {
        const user = await makeUser('mod-update')
        const post = await app.prisma.post.create({ data: { userId: user.id, contents: `元の本文 ${ts}` } })

        const res = await withAi(creditExhausted, () =>
            app.inject({ method: 'PATCH', url: `/posts/${post.id}`, payload: { userId: user.id, contents: `編集後 ${ts}` } }),
        )

        assert.equal(res.statusCode, 503)
        assert.equal((res.json() as any).status, 'unavailable')
    })

    // ── ai-identify credit refund ────────────────────────────────────────────

    await t.test('a post with no images deducts then refunds the credit (422)', async () => {
        const user = await makeUser('id-noimg', 100)
        const post = await app.prisma.post.create({ data: { userId: user.id, contents: `画像なし ${ts}` } })

        // No AI call is reached on this path, so no stub is needed.
        const res = await app.inject({
            method: 'POST',
            url: `/posts/${post.id}/ai-identify`,
            payload: { userId: user.id },
        })

        assert.equal(res.statusCode, 422)
        const fresh = await app.prisma.user.findUnique({ where: { id: user.id } })
        assert.equal(fresh!.credit, 100) // deducted 10, then refunded 10
    })

    await t.test('credit exhaustion during identification refunds and returns 503', async () => {
        const user = await makeUser('id-503', 100)
        const post = await app.prisma.post.create({ data: { userId: user.id, contents: `画像あり ${ts}` } })

        // Write a small real JPEG so the route's sharp/encode step succeeds and
        // we actually reach the Anthropic call (which the stub fails on credit).
        fs.mkdirSync(UPLOADS_DIR, { recursive: true })
        const filename = `ai-credit-test-${ts}.jpg`
        const filePath = path.join(UPLOADS_DIR, filename)
        await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 50, b: 50 } } })
            .jpeg()
            .toFile(filePath)
        await app.prisma.media.create({
            data: {
                filename, originalName: filename, url: `/uploads/${filename}`, type: 'IMAGE',
                mimeType: 'image/jpeg', size: fs.statSync(filePath).size, postId: post.id,
            },
        })

        try {
            const res = await withAi(creditExhausted, () =>
                app.inject({ method: 'POST', url: `/posts/${post.id}/ai-identify`, payload: { userId: user.id } }),
            )

            assert.equal(res.statusCode, 503)
            assert.equal((res.json() as any).code, 'ai_service_unavailable')

            const fresh = await app.prisma.user.findUnique({ where: { id: user.id } })
            assert.equal(fresh!.credit, 100) // deducted 10, then refunded 10
        } finally {
            fs.rmSync(filePath, { force: true })
        }
    })

    await t.test('identification refuses and refunds while images are still uploading', async () => {
        const user = await makeUser('id-incomplete', 100)
        // Two images expected (background upload) but only one has arrived.
        const post = await app.prisma.post.create({
            data: { userId: user.id, contents: `アップロード中 ${ts}`, expectedMediaCount: 2 },
        })
        await app.prisma.media.create({
            data: {
                filename: `incomplete-${ts}.jpg`, originalName: 'x.jpg', url: `/uploads/incomplete-${ts}.jpg`,
                type: 'IMAGE', mimeType: 'image/jpeg', size: 1, postId: post.id,
            },
        })

        // No AI stub needed: the route returns before the Anthropic call.
        const res = await app.inject({
            method: 'POST', url: `/posts/${post.id}/ai-identify`, payload: { userId: user.id },
        })

        assert.equal(res.statusCode, 409)
        assert.equal((res.json() as any).code, 'media_incomplete')

        const fresh = await app.prisma.user.findUnique({ where: { id: user.id } })
        assert.equal(fresh!.credit, 100) // deducted 10, then refunded 10 — not charged
    })
})
