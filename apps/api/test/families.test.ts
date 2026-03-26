import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST, PATCH and DELETE /families', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // First create a shape
    const timestamp = Date.now()
    const shapeRes = await app.inject({
        method: 'POST',
        url: '/shapes',
        payload: { name: `Agaricales Family Test ${timestamp}` }
    })
    const shape = shapeRes.json() as any

    // CREATE
    const createRes = await app.inject({
        method: 'POST',
        url: '/families',
        payload: {
            name: `Amanitaceae Family Test ${timestamp}`,
            shapeId: shape.id
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdFamily = createRes.json() as any
    assert.equal(createdFamily.name, `Amanitaceae Family Test ${timestamp}`)
    assert.equal(createdFamily.shapeId, shape.id)
    assert.ok(createdFamily.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/families/${createdFamily.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().name, `Amanitaceae Family Test ${timestamp}`)

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/families'
    })

    assert.equal(listRes.statusCode, 200)
    const familiesList = listRes.json() as any[]
    assert.ok(familiesList.length > 0)
    assert.ok(familiesList.some(f => f.id === createdFamily.id))

    // UPDATE
    const updateRes = await app.inject({
        method: 'PATCH',
        url: `/families/${createdFamily.id}`,
        payload: {
            name: 'Updated Amanitaceae'
        }
    })

    assert.equal(updateRes.statusCode, 200)
    assert.equal(updateRes.json().name, 'Updated Amanitaceae')

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/families/${createdFamily.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Family deleted')

    // VERIFY DELETED
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/families/${createdFamily.id}`
    })

    assert.equal(verifyRes.statusCode, 404)
    await app.close()
})