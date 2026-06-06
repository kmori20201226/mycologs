import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { buildApp } from '../src/app'
import { recordAiUsage } from '../src/lib/ai-usage'

// Tests for AI usage/cost logging into ai_usage_log. Two layers:
//  - recordAiUsage() directly: cost math per model, unknown-model fallback,
//    and the missing-usage no-op.
//  - the route integration: an /ai-identify call and a moderated /posts call
//    each write exactly one row with the right kind/model/cost.
// Like ai-credit.test.ts we stub globalThis.fetch and run scenarios as
// sequential awaited subtests so the global stub never races.

const UPLOADS_DIR = path.resolve(__dirname, '../../../data/uploads')

function jsonResponse(body: any, status = 200): Response {
    return new Response(JSON.stringify(body ?? null), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

type AiHandler = (url: string, init?: any) => Response | Promise<Response>

async function withAi<T>(handler: AiHandler, fn: () => Promise<T>): Promise<T> {
    const real = globalThis.fetch
    globalThis.fetch = (async (url: any, init?: any) => {
        const u = String(url)
        if (u.includes('/api/moderation/evaluate') || u.includes('/api/identification/evaluate')) {
            return handler(u, init)
        }
        throw new Error(`unexpected fetch to ${u}`)
    }) as typeof fetch
    try {
        return await fn()
    } finally {
        globalThis.fetch = real
    }
}

const noopLog = { warn: () => {}, error: () => {} }

test('AI usage cost logging', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    const ts = Date.now()
    const makeUser = (suffix: string, credit = 0) =>
        app.prisma.user.create({
            data: { name: `ai-usage ${suffix} ${ts}`, email: `ai-usage-${suffix}-${ts}@example.com`, credit },
        })

    // ── recordAiUsage() cost math ────────────────────────────────────────────

    await t.test('opus pricing: cost = input*5 + output*25 (micro-USD)', async () => {
        const user = await makeUser('opus')
        await recordAiUsage(app.prisma, {
            kind: 'identify',
            usage: { model: 'claude-opus-4-7', input_tokens: 1000, output_tokens: 200 },
            userId: user.id,
            log: noopLog,
        })
        const rows = await app.prisma.aiUsageLog.findMany({ where: { userId: user.id } })
        assert.equal(rows.length, 1)
        assert.equal(rows[0]!.kind, 'identify')
        assert.equal(rows[0]!.model, 'claude-opus-4-7')
        assert.equal(rows[0]!.inputTokens, 1000)
        assert.equal(rows[0]!.outputTokens, 200)
        assert.equal(rows[0]!.costMicroUsd, 1000 * 5 + 200 * 25) // 10_000
    })

    await t.test('haiku pricing resolves a dated model id by prefix', async () => {
        const user = await makeUser('haiku')
        await recordAiUsage(app.prisma, {
            kind: 'geocode',
            usage: { model: 'claude-haiku-4-5-20251001', input_tokens: 1000, output_tokens: 200 },
            userId: user.id,
            log: noopLog,
        })
        const row = await app.prisma.aiUsageLog.findFirst({ where: { userId: user.id } })
        assert.equal(row!.costMicroUsd, 1000 * 1 + 200 * 5) // 2_000
    })

    await t.test('cache tokens are priced (read 0.1x, creation 1.25x input)', async () => {
        const user = await makeUser('cache')
        await recordAiUsage(app.prisma, {
            kind: 'identify',
            usage: {
                model: 'claude-opus-4-7',
                input_tokens: 1000,
                output_tokens: 200,
                cache_read_input_tokens: 500,
                cache_creation_input_tokens: 100,
            },
            userId: user.id,
            log: noopLog,
        })
        const row = await app.prisma.aiUsageLog.findFirst({ where: { userId: user.id } })
        const expected = 1000 * 5 + 200 * 25 + Math.round(500 * 5 * 0.1 + 100 * 5 * 1.25)
        assert.equal(row!.costMicroUsd, expected) // 10_000 + 250 + 625
        assert.equal(row!.cacheReadTokens, 500)
        assert.equal(row!.cacheCreationTokens, 100)
    })

    await t.test('unknown model still records a row, with cost 0', async () => {
        const user = await makeUser('unknown')
        await recordAiUsage(app.prisma, {
            kind: 'identify',
            usage: { model: 'claude-mystery-9-9', input_tokens: 1000, output_tokens: 200 },
            userId: user.id,
            log: noopLog,
        })
        const row = await app.prisma.aiUsageLog.findFirst({ where: { userId: user.id } })
        assert.ok(row)
        assert.equal(row!.costMicroUsd, 0)
        assert.equal(row!.inputTokens, 1000) // tokens are never lost
    })

    await t.test('missing usage writes no row', async () => {
        const user = await makeUser('nousage')
        await recordAiUsage(app.prisma, { kind: 'identify', usage: null, userId: user.id, log: noopLog })
        await recordAiUsage(app.prisma, { kind: 'identify', usage: undefined, userId: user.id, log: noopLog })
        const count = await app.prisma.aiUsageLog.count({ where: { userId: user.id } })
        assert.equal(count, 0)
    })

    // ── route integration ────────────────────────────────────────────────────

    await t.test('ai-identify writes an identify row and hides usage from the client', async () => {
        const user = await makeUser('id-route', 100)
        const post = await app.prisma.post.create({ data: { userId: user.id, contents: `画像あり ${ts}` } })

        fs.mkdirSync(UPLOADS_DIR, { recursive: true })
        const filename = `ai-usage-test-${ts}.jpg`
        const filePath = path.join(UPLOADS_DIR, filename)
        await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 200, b: 50 } } })
            .jpeg()
            .toFile(filePath)
        await app.prisma.media.create({
            data: {
                filename, originalName: filename, url: `/uploads/${filename}`, type: 'IMAGE',
                mimeType: 'image/jpeg', size: fs.statSync(filePath).size, postId: post.id,
            },
        })

        const identifyResult = {
            scientific_name: 'Amanita muscaria',
            japanese_name: 'ベニテングタケ',
            usage: { model: 'claude-opus-4-7', input_tokens: 1500, output_tokens: 300 },
        }

        try {
            const res = await withAi(
                () => jsonResponse(identifyResult),
                () => app.inject({ method: 'POST', url: `/posts/${post.id}/ai-identify`, payload: { userId: user.id } }),
            )

            assert.equal(res.statusCode, 200)
            const body = res.json() as any
            assert.equal(body.scientific_name, 'Amanita muscaria')
            assert.equal(body.usage, undefined) // stripped from the client payload

            const rows = await app.prisma.aiUsageLog.findMany({ where: { userId: user.id, kind: 'identify' } })
            assert.equal(rows.length, 1)
            assert.equal(rows[0]!.postId, post.id)
            assert.equal(rows[0]!.model, 'claude-opus-4-7')
            assert.equal(rows[0]!.costMicroUsd, 1500 * 5 + 300 * 25) // 15_000
        } finally {
            fs.rmSync(filePath, { force: true })
        }
    })

    await t.test('a moderated post create writes a moderate row (postId null)', async () => {
        const user = await makeUser('mod-route')
        const modResult = {
            category: 'PASS', point: 0, allowed: true, confidence: 0.9, comment: 'OK',
            usage: { model: 'claude-opus-4-5', input_tokens: 400, output_tokens: 80 },
        }

        const res = await withAi(
            () => jsonResponse(modResult),
            () => app.inject({ method: 'POST', url: '/posts', payload: { userId: user.id, contents: `モデレーション ${ts}` } }),
        )

        assert.equal(res.statusCode, 201)
        const rows = await app.prisma.aiUsageLog.findMany({ where: { userId: user.id, kind: 'moderate' } })
        assert.equal(rows.length, 1)
        assert.equal(rows[0]!.postId, null) // post id unknown at moderation time
        assert.equal(rows[0]!.model, 'claude-opus-4-5')
        assert.equal(rows[0]!.costMicroUsd, 400 * 5 + 80 * 25) // 4_000
    })
})
