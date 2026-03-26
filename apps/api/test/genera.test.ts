import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST, PATCH and DELETE /genera', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // First create shape and family
    const timestamp = Date.now()
    const shapeRes = await app.inject({
        method: 'POST',
        url: '/shapes',
        payload: { name: `Agaricales Genus Test ${timestamp}` }
    })
    const shape = shapeRes.json() as any

    const familyRes = await app.inject({
        method: 'POST',
        url: '/families',
        payload: {
            name: `Amanitaceae Genus Test ${timestamp}`,
            shapeId: shape.id
        }
    })
    const family = familyRes.json() as any

    // CREATE
    const createRes = await app.inject({
        method: 'POST',
        url: '/genera',
        payload: {
            name: `Amanita Genus Test ${timestamp}`,
            familyId: family.id
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdGenus = createRes.json() as any
    assert.equal(createdGenus.name, `Amanita Genus Test ${timestamp}`)
    assert.equal(createdGenus.familyId, family.id)
    assert.ok(createdGenus.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/genera/${createdGenus.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().name, `Amanita Genus Test ${timestamp}`)

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/genera'
    })

    assert.equal(listRes.statusCode, 200)
    const generaList = listRes.json() as any[]
    assert.ok(generaList.length > 0)
    assert.ok(generaList.some(g => g.id === createdGenus.id))

    // UPDATE
    const updateRes = await app.inject({
        method: 'PATCH',
        url: `/genera/${createdGenus.id}`,
        payload: {
            name: 'Updated Amanita'
        }
    })

    assert.equal(updateRes.statusCode, 200)
    assert.equal(updateRes.json().name, 'Updated Amanita')

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/genera/${createdGenus.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Genus deleted')

    // VERIFY DELETED
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/genera/${createdGenus.id}`
    })

    assert.equal(verifyRes.statusCode, 404)
    await app.close()
})