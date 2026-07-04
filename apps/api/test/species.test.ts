import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST, PATCH and DELETE /species', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // First create shape, family, and genus
    const timestamp = Date.now()
    const shapeRes = await app.inject({
        method: 'POST',
        url: '/shapes',
        payload: { name: `Agaricales Species Test ${timestamp}` }
    })
    const shape = shapeRes.json() as any

    const familyRes = await app.inject({
        method: 'POST',
        url: '/families',
        payload: {
            scientificName: `Amanitaceae Species Test ${timestamp}`,
            shapeId: shape.id
        }
    })
    const family = familyRes.json() as any

    const genusRes = await app.inject({
        method: 'POST',
        url: '/genera',
        payload: {
            scientificName: `Amanita Species Test ${timestamp}`,
            familyId: family.id
        }
    })
    const genus = genusRes.json() as any

    // CREATE
    const createRes = await app.inject({
        method: 'POST',
        url: '/species',
        payload: {
            scientificName: `Amanita muscaria Species Test ${timestamp}`,
            genusId: genus.id
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdSpecies = createRes.json() as any
    assert.equal(createdSpecies.scientificName, `Amanita muscaria Species Test ${timestamp}`)
    assert.equal(createdSpecies.genusId, genus.id)
    assert.ok(createdSpecies.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/species/${createdSpecies.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().scientificName, `Amanita muscaria Species Test ${timestamp}`)

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/species'
    })

    assert.equal(listRes.statusCode, 200)
    const speciesList = listRes.json() as any[]
    assert.ok(speciesList.length > 0)
    assert.ok(speciesList.some(s => s.id === createdSpecies.id))

    // UPDATE
    const updateRes = await app.inject({
        method: 'PATCH',
        url: `/species/${createdSpecies.id}`,
        payload: {
            scientificName: `Updated Amanita muscaria Species Test ${timestamp}`
        }
    })

    assert.equal(updateRes.statusCode, 200)
    assert.equal(updateRes.json().scientificName, `Updated Amanita muscaria Species Test ${timestamp}`)

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/species/${createdSpecies.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Species deleted')

    // VERIFY SOFT DELETED: species use a soft delete (deletedAt), so the row is
    // excluded from the list even though a direct GET-by-id can still resolve it.
    const afterListRes = await app.inject({ method: 'GET', url: '/species' })
    assert.equal(afterListRes.statusCode, 200)
    const afterList = afterListRes.json() as any[]
    assert.ok(!afterList.some((s) => s.id === createdSpecies.id), 'deleted species must not appear in the list')
    await app.close()
})