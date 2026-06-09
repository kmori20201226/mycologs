import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST, PATCH and DELETE /events', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // CREATE a user to own events and generate auth token
    const userRes = await app.inject({
        method: 'POST',
        url: '/users',
        payload: {
            name: 'Event Owner',
            email: `event-owner-${Date.now()}@example.com`,
            password: 'password123'
        }
    })
    const createdUser = userRes.json() as any
    const token = app.jwt.sign({ id: createdUser.id, email: createdUser.email })
    const authHeaders = { authorization: `Bearer ${token}` }

    // CREATE (club-less, user-less)
    const createRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: authHeaders,
        payload: {
            name: 'Mushroom Foraging Trip',
            description: 'A day trip to collect mushrooms in the forest',
            place: '新宿御苑の奥の秘密の場所',
            publicPlace: '新宿区周辺',
            startAt: '2026-03-26T09:00:00.000Z',
            endAt: '2026-03-26T17:00:00.000Z'
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdEvent = createRes.json() as any
    assert.equal(createdEvent.name, 'Mushroom Foraging Trip')
    assert.equal(createdEvent.description, 'A day trip to collect mushrooms in the forest')
    assert.equal(createdEvent.publicPlace, '新宿区周辺')
    assert.ok(createdEvent.id)

    // CREATE user-owned event
    const userEventRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: authHeaders,
        payload: {
            name: 'Personal Foraging Trip',
            userId: createdUser.id
        }
    })

    assert.equal(userEventRes.statusCode, 201)
    const userEvent = userEventRes.json() as any
    assert.equal(userEvent.userId, createdUser.id)

    // LIST filtered by userId
    const listByUserRes = await app.inject({
        method: 'GET',
        url: `/events?userId=${createdUser.id}`
    })

    assert.equal(listByUserRes.statusCode, 200)
    const userEvents = listByUserRes.json() as any[]
    assert.ok(userEvents.every(e => e.userId === createdUser.id))

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/events/${createdEvent.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().name, 'Mushroom Foraging Trip')

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/events'
    })

    assert.equal(listRes.statusCode, 200)
    const eventsList = listRes.json() as any[]
    assert.ok(eventsList.length > 0)
    assert.ok(eventsList.some(e => e.id === createdEvent.id))

    // UPDATE
    const updateRes = await app.inject({
        method: 'PATCH',
        url: `/events/${createdEvent.id}`,
        headers: authHeaders,
        payload: {
            name: 'Updated Mushroom Foraging Trip',
            description: 'Updated description',
            publicPlace: '渋谷区周辺'
        }
    })

    assert.equal(updateRes.statusCode, 200)
    assert.equal(updateRes.json().name, 'Updated Mushroom Foraging Trip')
    assert.equal(updateRes.json().publicPlace, '渋谷区周辺')

    // DELETE user-owned event
    await app.inject({ method: 'DELETE', url: `/events/${userEvent.id}`, headers: authHeaders })

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/events/${createdEvent.id}`,
        headers: authHeaders
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Event deleted')

    // VERIFY DELETED
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/events/${createdEvent.id}`
    })

    assert.equal(verifyRes.statusCode, 404)
    await app.close()
})
