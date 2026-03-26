import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST, PATCH and DELETE /events', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // CREATE
    const createRes = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            name: 'Mushroom Foraging Trip',
            description: 'A day trip to collect mushrooms in the forest',
            startAt: '2026-03-26T09:00:00.000Z',
            endAt: '2026-03-26T17:00:00.000Z'
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdEvent = createRes.json() as any
    assert.equal(createdEvent.name, 'Mushroom Foraging Trip')
    assert.equal(createdEvent.description, 'A day trip to collect mushrooms in the forest')
    assert.ok(createdEvent.id)

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
        payload: {
            name: 'Updated Mushroom Foraging Trip',
            description: 'Updated description'
        }
    })

    assert.equal(updateRes.statusCode, 200)
    assert.equal(updateRes.json().name, 'Updated Mushroom Foraging Trip')

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/events/${createdEvent.id}`
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