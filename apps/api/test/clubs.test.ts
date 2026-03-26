import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST, PATCH and DELETE /clubs', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // CREATE
    const createRes = await app.inject({
        method: 'POST',
        url: '/clubs',
        payload: {
            name: 'Tech Club'
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdClub = createRes.json() as any
    assert.equal(createdClub.name, 'Tech Club')
    assert.ok(createdClub.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/clubs/${createdClub.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().name, 'Tech Club')

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/clubs'
    })

    assert.equal(listRes.statusCode, 200)
    const clubsList = listRes.json() as any[]
    assert.ok(clubsList.length > 0)
    assert.ok(clubsList.some(c => c.id === createdClub.id))

    // UPDATE
    const updateRes = await app.inject({
        method: 'PATCH',
        url: `/clubs/${createdClub.id}`,
        payload: {
            name: 'Updated Tech Club'
        }
    })

    assert.equal(updateRes.statusCode, 200)
    assert.equal(updateRes.json().name, 'Updated Tech Club')

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/clubs/${createdClub.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Club deleted')

    // VERIFY DELETED
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/clubs/${createdClub.id}`
    })

    assert.equal(verifyRes.statusCode, 404)
    await app.close()
})
