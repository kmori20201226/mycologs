import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST, PATCH and DELETE /posts', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // First create a user
    const timestamp = Date.now()
    const userRes = await app.inject({
        method: 'POST',
        url: '/users',
        payload: {
            name: `John Doe Posts Test ${timestamp}`,
            email: `john-posts-test-${timestamp}@example.com`
        }
    })
    const user = userRes.json() as any

    // CREATE
    const createRes = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: user.id,
            contents: `Found this mushroom in the forest. What species is it? Posts test ${timestamp}.`
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdPost = createRes.json() as any
    assert.equal(createdPost.contents, `Found this mushroom in the forest. What species is it? Posts test ${timestamp}.`)
    assert.equal(createdPost.userId, user.id)
    assert.ok(createdPost.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/posts/${createdPost.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().contents, `Found this mushroom in the forest. What species is it? Posts test ${timestamp}.`)

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/posts'
    })

    assert.equal(listRes.statusCode, 200)
    const postsList = listRes.json() as any[]
    assert.ok(postsList.length > 0)
    assert.ok(postsList.some(p => p.id === createdPost.id))

    // UPDATE
    const updateRes = await app.inject({
        method: 'PATCH',
        url: `/posts/${createdPost.id}`,
        payload: {
            contents: `Updated: Found this mushroom in the forest. What species is it? Posts test ${timestamp}.`
        }
    })

    assert.equal(updateRes.statusCode, 200)
    assert.equal(updateRes.json().contents, `Updated: Found this mushroom in the forest. What species is it? Posts test ${timestamp}.`)

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/posts/${createdPost.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Post deleted')

    // VERIFY DELETED
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/posts/${createdPost.id}`
    })

    assert.equal(verifyRes.statusCode, 404)
    await app.close()
})

test('GET /posts filters by JST taken date, visibility, and lists filter events', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    const timestamp = Date.now()
    const userRes = await app.inject({
        method: 'POST',
        url: '/users',
        payload: {
            name: `Filter Tester ${timestamp}`,
            email: `filter-posts-test-${timestamp}@example.com`,
        },
    })
    const user = userRes.json() as any

    // Two photos straddling the JST midnight of 2026-07-04:
    //   A = 23:30 JST Jul 4 (14:30Z) — belongs to Jul 4 in JST
    //   B = 00:10 JST Jul 5 (15:10Z) — belongs to Jul 5 in JST
    const mk = async (takenAt: string) => {
        const res = await app.inject({
            method: 'POST',
            url: '/posts',
            payload: { userId: user.id, contents: `JST filter ${takenAt} ${timestamp}`, takenAt },
        })
        assert.equal(res.statusCode, 201)
        return res.json() as any
    }
    const postA = await mk('2026-07-04T14:30:00.000Z')
    const postB = await mk('2026-07-04T15:10:00.000Z')

    // takenTo=2026-07-04 (JST) includes A, excludes B (which is Jul 5 in JST).
    const jul4 = (await app.inject({ method: 'GET', url: '/posts?takenFrom=2026-07-04&takenTo=2026-07-04' })).json() as any[]
    const jul4Ids = new Set(jul4.map((p) => p.id))
    assert.ok(jul4Ids.has(postA.id), 'A should be in Jul 4 JST range')
    assert.ok(!jul4Ids.has(postB.id), 'B should NOT be in Jul 4 JST range')

    // takenFrom=2026-07-05 (JST) includes B, excludes A.
    const jul5 = (await app.inject({ method: 'GET', url: '/posts?takenFrom=2026-07-05' })).json() as any[]
    const jul5Ids = new Set(jul5.map((p) => p.id))
    assert.ok(jul5Ids.has(postB.id), 'B should be in Jul 5+ JST range')
    assert.ok(!jul5Ids.has(postA.id), 'A should NOT be in Jul 5+ JST range')

    // Anonymous viewer asking for PRIVATE must not see these PUBLIC posts, and
    // must never be able to widen the gate to reach others' private posts.
    const asPrivate = (await app.inject({ method: 'GET', url: '/posts?visibility=PRIVATE' })).json() as any[]
    assert.ok(!asPrivate.some((p) => p.id === postA.id), 'PUBLIC post must not appear under visibility=PRIVATE')
    const asPublic = (await app.inject({ method: 'GET', url: '/posts?visibility=PUBLIC' })).json() as any[]
    assert.ok(asPublic.some((p) => p.id === postA.id), 'PUBLIC post should appear under visibility=PUBLIC')

    // The event-facets endpoint returns an array (id/name pairs).
    const facetsRes = await app.inject({ method: 'GET', url: '/posts/filter-events' })
    assert.equal(facetsRes.statusCode, 200)
    assert.ok(Array.isArray(facetsRes.json()))
})

test('POST /posts persists photo location (longitude, latitude, takenAt)', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    const timestamp = Date.now()
    const userRes = await app.inject({
        method: 'POST',
        url: '/users',
        payload: {
            name: `Geo Tester ${timestamp}`,
            email: `geo-posts-test-${timestamp}@example.com`,
        },
    })
    const user = userRes.json() as any

    const takenAt = '2026-06-09T01:23:45.000Z'
    const createRes = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: user.id,
            contents: `Geotagged mushroom find ${timestamp}.`,
            longitude: 139.7671,
            latitude: 35.6812,
            takenAt,
        },
    })

    assert.equal(createRes.statusCode, 201)
    const created = createRes.json() as any
    assert.equal(created.longitude, 139.7671)
    assert.equal(created.latitude, 35.6812)
    assert.equal(new Date(created.takenAt).toISOString(), takenAt)

    // Round-trips on read.
    const getRes = await app.inject({ method: 'GET', url: `/posts/${created.id}` })
    assert.equal(getRes.statusCode, 200)
    const fetched = getRes.json() as any
    assert.equal(fetched.longitude, 139.7671)
    assert.equal(fetched.latitude, 35.6812)
    assert.equal(new Date(fetched.takenAt).toISOString(), takenAt)

    // Clearing the event link via PATCH (eventId: null) is accepted.
    const clearRes = await app.inject({
        method: 'PATCH',
        url: `/posts/${created.id}`,
        payload: { userId: user.id, eventId: null },
    })
    assert.equal(clearRes.statusCode, 200)
    assert.equal(clearRes.json().eventId, null)
})