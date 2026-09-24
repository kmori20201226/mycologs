/**
 * Rainfall history for an event location.
 *
 * Runs against the real dev database (no mocks, matching the rest of the
 * suite), so it needs precip_snapshots populated — see
 * precipication-collector/. It skips rather than fails when the
 * table is empty, because an empty precip table means "this branch's data has
 * not been loaded here", not "the code is broken".
 */
import test from 'node:test'
import assert from 'node:assert'
import { buildApp } from '../src/app'
import { createPrecipReader } from '../src/lib/precip-series'

test('GET /events/:id/precipitation', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    const grid = await app.prisma.precipGrid.findFirst()
    if (!grid) return t.skip('no precip_grids row — data not loaded in this database')

    const event = await app.prisma.event.findFirst({
        where: { longitude: { not: null }, latitude: { not: null } },
    })
    assert.ok(event, 'expected an event with coordinates')

    const to = new Date('2026-08-30T00:00:00Z')
    const from = new Date(to.getTime() - 14 * 86_400_000)
    const q = `from=${from.toISOString()}&to=${to.toISOString()}`

    await t.test('returns a daily series bounded by the requested range', async () => {
        const res = await app.inject({ method: 'GET', url: `/events/${event!.id}/precipitation?${q}` })
        assert.equal(res.statusCode, 200)
        const body = res.json()

        assert.equal(body.event.id, event!.id)
        assert.ok(body.cell.i >= 0 && body.cell.j >= 0, 'resolved to a grid cell')
        assert.ok(Array.isArray(body.daily))
        assert.ok(body.daily.length > 0 && body.daily.length <= 16, 'about a fortnight of days')

        // Every figure is a range, and the range must be ordered.
        for (const d of body.daily) {
            assert.ok(d.upperMm >= d.lowerMm, `${d.date}: upper must not be below lower`)
            assert.ok(d.wetHours <= d.hours)
            assert.ok(d.maskedHours <= d.hours)
        }
        assert.ok(body.totalUpperMm >= body.totalLowerMm)
    })

    await t.test('accounts for every hour it did not have', async () => {
        const res = await app.inject({ method: 'GET', url: `/events/${event!.id}/precipitation?${q}` })
        const b = res.json()
        assert.equal(b.hoursPresent + b.hoursMissing, b.hoursExpected,
            'present + missing must reconcile with the requested span')
    })

    await t.test('rejects a reversed range', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/events/${event!.id}/precipitation?from=${to.toISOString()}&to=${from.toISOString()}`,
        })
        assert.equal(res.statusCode, 400)
    })

    await t.test('rejects a range too large to serve', async () => {
        const far = new Date(to.getTime() - 200 * 86_400_000)
        const res = await app.inject({
            method: 'GET',
            url: `/events/${event!.id}/precipitation?from=${far.toISOString()}&to=${to.toISOString()}`,
        })
        assert.equal(res.statusCode, 400)
    })

    await t.test('404s for an unknown event', async () => {
        const res = await app.inject({ method: 'GET', url: `/events/999999/precipitation?${q}` })
        assert.equal(res.statusCode, 404)
    })

    await t.test('refuses an event with no coordinates rather than guessing', async () => {
        const noLoc = await app.prisma.event.findFirst({ where: { longitude: null } })
        if (!noLoc) return
        const res = await app.inject({ method: 'GET', url: `/events/${noLoc.id}/precipitation?${q}` })
        assert.equal(res.statusCode, 409)
        assert.equal(res.json().code, 'event_has_no_location')
    })
})

/**
 * Rainfall where a post's photo was taken.
 *
 * The series itself is the same code path as the event endpoint (lib/precip-series),
 * so these tests concentrate on what is genuinely different: resolving the post,
 * and refusing to answer for one the viewer may not see. A post's coordinates
 * are exactly what PRIVATE is protecting.
 */
test('GET /posts/:id/precipitation', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    const grid = await app.prisma.precipGrid.findFirst()
    if (!grid) return t.skip('no precip_grids row — data not loaded in this database')

    const to = new Date('2026-08-30T00:00:00Z')
    const from = new Date(to.getTime() - 14 * 86_400_000)
    const q = `from=${from.toISOString()}&to=${to.toISOString()}`

    // Located posts are not all in range — the dev data has posts in Tokyo,
    // hundreds of kilometres outside a Fukuoka radar image — so find one the
    // endpoint can actually answer for rather than assuming the first will do.
    const located = await app.prisma.post.findMany({
        where: { deletedAt: null, visibility: 'PUBLIC', longitude: { not: null }, latitude: { not: null } },
        select: { id: true },
        orderBy: { id: 'asc' },
    })
    assert.ok(located.length > 0, 'expected a public post with coordinates')
    const anyLocatedId = located[0]!.id

    let covered: number | null = null
    for (const p of located) {
        const probe = await app.inject({ method: 'GET', url: `/posts/${p.id}/precipitation?${q}` })
        if (probe.statusCode === 200) { covered = p.id; break }
    }

    await t.test('returns a daily series for the photo location', async (st) => {
        if (covered === null) {
            return st.skip('no located public post falls inside the radar image')
        }
        const res = await app.inject({ method: 'GET', url: `/posts/${covered}/precipitation?${q}` })
        assert.equal(res.statusCode, 200)
        const body = res.json()

        assert.equal(body.post.id, covered)
        assert.ok(body.cell.i >= 0 && body.cell.j >= 0, 'resolved to a grid cell')
        assert.ok(body.daily.length > 0 && body.daily.length <= 16, 'about a fortnight of days')

        // Same invariants as the event series — they belong to the series, not
        // to the subject asking for it.
        for (const d of body.daily) {
            assert.ok(d.upperMm >= d.lowerMm, `${d.date}: upper must not be below lower`)
            assert.ok(d.wetHours <= d.hours)
            assert.ok(d.maskedHours <= d.hours)
        }
        assert.ok(body.totalUpperMm >= body.totalLowerMm)
        assert.equal(body.hoursPresent + body.hoursMissing, body.hoursExpected)
    })

    await t.test('does not leak the location of a post the viewer cannot see', async (st) => {
        const priv = await app.prisma.post.findFirst({
            where: { deletedAt: null, visibility: 'PRIVATE', longitude: { not: null }, latitude: { not: null } },
        })
        if (!priv) return st.skip('no private post with coordinates in this database')

        // Anonymous request: the post exists and has coordinates, but saying so
        // — even by answering 409 instead of 404 — would already be a leak.
        const res = await app.inject({ method: 'GET', url: `/posts/${priv.id}/precipitation?${q}` })
        assert.equal(res.statusCode, 404, 'a private post must be invisible, not merely refused')
    })

    await t.test('404s for an unknown post', async () => {
        const res = await app.inject({ method: 'GET', url: `/posts/999999/precipitation?${q}` })
        assert.equal(res.statusCode, 404)
    })

    await t.test('refuses a post with no coordinates rather than guessing', async () => {
        const noLoc = await app.prisma.post.findFirst({
            where: { deletedAt: null, visibility: 'PUBLIC', longitude: null },
        })
        if (!noLoc) return
        const res = await app.inject({ method: 'GET', url: `/posts/${noLoc.id}/precipitation?${q}` })
        assert.equal(res.statusCode, 409)
        assert.equal(res.json().code, 'post_has_no_location')
    })

    await t.test('rejects a range too large to serve', async () => {
        const far = new Date(to.getTime() - 200 * 86_400_000)
        const res = await app.inject({
            method: 'GET',
            url: `/posts/${anyLocatedId}/precipitation?from=${far.toISOString()}&to=${to.toISOString()}`,
        })
        assert.equal(res.statusCode, 400)
    })
})

/**
 * Grid selection when more than one prefecture is ingested.
 *
 * tenki.jp publishes a separate map per prefecture, each fitted to its own
 * bounding box with its own affine. The reader used to take the newest
 * precip_grids row unconditionally, which was correct only while Fukuoka was
 * alone: a second prefecture would become "newest", every existing post would
 * resolve against a map its coordinates fall outside, and the panels would go
 * empty with nothing logged. That is the failure this guards.
 *
 * Driven through createPrecipReader rather than the HTTP endpoints, because
 * what is under test is which grid answers for a coordinate — and a coordinate
 * is exactly what the endpoints do not let a caller choose.
 *
 * The second grid is created and removed inside the test, and carries no
 * snapshots, so it can never be the right answer for a Fukuoka point.
 */
test('precipitation grid selection with several prefectures', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    const fukuoka = await app.prisma.precipGrid.findFirst({ orderBy: { id: 'asc' } })
    if (!fukuoka) return t.skip('no precip_grids row — data not loaded in this database')

    // The calibrated 大分 geometry. Its map reaches east to lon 132.53, well
    // past Fukuoka's 131.61 edge, and overlaps it over the whole western half.
    const oita = await app.prisma.precipGrid.create({
        data: {
            source: 'test/pref-47-large', lonPx: 3.174963e-3, lonPy: 2.994483e-6,
            lonC: 130.335821, latPx: 4.176112e-6, latPy: -2.663095e-3, latC: 34.012942,
            blockSize: fukuoka.blockSize, width: fukuoka.width, height: fukuoka.height,
            bands: fukuoka.bands as object,
        },
    })
    t.after(() => app.prisma.precipGrid.delete({ where: { id: oita.id } }))

    // Built after the insert: the reader caches the grid set on first use.
    const reader = createPrecipReader(app)
    const to = new Date('2026-08-30T00:00:00Z')
    const from = new Date(to.getTime() - 14 * 86_400_000)

    await t.test('a Fukuoka point still answers from the Fukuoka grid', async () => {
        // The coordinate the extractor was originally verified against.
        const r = await reader.seriesAt(130.80546, 33.66280, from, to)
        assert.ok(r.ok, 'a newer grid must not hide an existing point\'s rainfall')
        assert.ok(r.series.hoursPresent > 0,
            'resolved to the grid that holds hours, not merely to one containing the point')
    })

    await t.test('a point only the new grid covers resolves to the new grid', async () => {
        // East of Fukuoka's image, inside Oita's: before this grid existed the
        // same coordinate was outside coverage altogether.
        const r = await reader.seriesAt(132.30, 33.20, from, to)
        assert.ok(r.ok, 'the containing grid should answer even with no hours stored')
        assert.equal(r.series.hoursPresent, 0, 'the test grid has no snapshots')
        assert.equal(r.series.hoursMissing, r.series.hoursExpected)
    })

    await t.test('a point outside every grid is still refused', async () => {
        const r = await reader.seriesAt(139.767, 35.681, from, to)   // Tokyo
        assert.equal(r.ok, false)
        if (!r.ok) assert.equal(r.refusal.code, 'outside_radar_coverage')
    })
})
