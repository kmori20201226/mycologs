import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST, PATCH and DELETE /shapes', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // CREATE
    const timestamp = Date.now()
    const createRes = await app.inject({
        method: 'POST',
        url: '/shapes',
        payload: {
            name: `Agaricales Shapes Test ${timestamp}`
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdShape = createRes.json() as any
    assert.equal(createdShape.name, `Agaricales Shapes Test ${timestamp}`)
    assert.ok(createdShape.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/shapes/${createdShape.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().name, `Agaricales Shapes Test ${timestamp}`)

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/shapes'
    })

    assert.equal(listRes.statusCode, 200)
    const shapesList = listRes.json() as any[]
    assert.ok(shapesList.length > 0)
    assert.ok(shapesList.some(s => s.id === createdShape.id))

    // UPDATE
    const updateRes = await app.inject({
        method: 'PATCH',
        url: `/shapes/${createdShape.id}`,
        payload: {
            name: `Updated Agaricales Shapes Test ${timestamp}`
        }
    })

    assert.equal(updateRes.statusCode, 200)
    assert.equal(updateRes.json().name, `Updated Agaricales Shapes Test ${timestamp}`)

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/shapes/${createdShape.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Shape deleted')

    // VERIFY DELETED
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/shapes/${createdShape.id}`
    })

    assert.equal(verifyRes.statusCode, 404)
    await app.close()
})