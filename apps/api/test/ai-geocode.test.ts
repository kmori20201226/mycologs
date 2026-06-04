import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

// Characterization tests for POST /ai/geocode (GSI address search).
// Like auth-line.test.ts, we stub globalThis.fetch and assert BEHAVIOR, not the
// GSI URL string, so these stay green when the hardcoded URL moves to env.
// All scenarios run as sequential awaited subtests so the global fetch stub
// never races.

function jsonResponse(body: any, status = 200): Response {
    return new Response(JSON.stringify(body ?? null), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

type StubOpts = { features?: any; status?: number; throws?: boolean }

async function withGsi<T>(opts: StubOpts, fn: () => Promise<T>): Promise<T> {
    const real = globalThis.fetch
    globalThis.fetch = (async (url: any) => {
        if (String(url).includes('AddressSearch')) {
            if (opts.throws) throw new Error('network down')
            return jsonResponse(opts.features ?? [], opts.status ?? 200)
        }
        throw new Error(`unexpected fetch to ${url}`)
    }) as typeof fetch
    try {
        return await fn()
    } finally {
        globalThis.fetch = real
    }
}

const FEATURE = (title: string, lon: number, lat: number) => ({
    geometry: { coordinates: [lon, lat] },
    properties: { title },
})

test('ai-geocode flow', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    const auth = { authorization: `Bearer ${app.jwt.sign({ id: 1, email: 'tester@example.com' })}` }
    const geocode = (body: any, headers: Record<string, string> = auth) =>
        app.inject({ method: 'POST', url: '/ai/geocode', headers, payload: body })

    await t.test('requires authentication', async () => {
        const res = await geocode({ place: '東京' }, {})
        assert.equal(res.statusCode, 401)
    })

    await t.test('rejects a missing place', async () => {
        const res = await geocode({})
        assert.equal(res.statusCode, 400)
    })

    await t.test('maps GSI features to candidates', async () => {
        const res = await withGsi(
            { features: [FEATURE('東京都千代田区', 139.7531, 35.6939), FEATURE('東京駅', 139.7671, 35.6812)] },
            () => geocode({ place: '東京' }),
        )
        assert.equal(res.statusCode, 200)
        const { candidates } = res.json() as any
        assert.equal(candidates.length, 2)
        assert.deepEqual(candidates[0], { name: '東京都千代田区', longitude: 139.7531, latitude: 35.6939 })
    })

    await t.test('returns empty candidates when GSI has no matches', async () => {
        const res = await withGsi({ features: [] }, () => geocode({ place: 'のらりくらり' }))
        assert.equal(res.statusCode, 200)
        assert.deepEqual((res.json() as any).candidates, [])
    })

    await t.test('returns 502 when GSI responds non-ok', async () => {
        const res = await withGsi({ status: 500 }, () => geocode({ place: '東京' }))
        assert.equal(res.statusCode, 502)
        assert.match((res.json() as any).message, /住所検索/)
    })

    // Current behavior: the route does not try/catch the fetch, so a network
    // failure surfaces as an unhandled 500. Locked here so the URL refactor is
    // provably safe; hardening this to 502 would be a separate change.
    await t.test('a GSI network failure currently surfaces as 500', async () => {
        const res = await withGsi({ throws: true }, () => geocode({ place: '東京' }))
        assert.equal(res.statusCode, 500)
    })
})
