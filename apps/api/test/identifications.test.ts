import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST, PATCH and DELETE /identifications', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // First create user, post, and species
    const timestamp = Date.now()
    const userRes = await app.inject({
        method: 'POST',
        url: '/users',
        payload: {
            name: `John Doe Identification Test ${timestamp}`,
            email: `john-identification-test-${timestamp}@example.com`
        }
    })
    const user = userRes.json() as any

    const postRes = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: user.id,
            contents: `Found this mushroom in the forest. What species is it? Identification test ${timestamp}.`
        }
    })
    const post = postRes.json() as any

    // Create taxonomy hierarchy
    const shapeRes = await app.inject({
        method: 'POST',
        url: '/shapes',
        payload: { name: `Agaricales Identification Test ${timestamp}` }
    })
    const shape = shapeRes.json() as any

    const familyRes = await app.inject({
        method: 'POST',
        url: '/families',
        payload: {
            name: `Amanitaceae Identification Test ${timestamp}`,
            shapeId: shape.id
        }
    })
    const family = familyRes.json() as any

    const genusRes = await app.inject({
        method: 'POST',
        url: '/genera',
        payload: {
            name: `Amanita Identification Test ${timestamp}`,
            familyId: family.id
        }
    })
    const genus = genusRes.json() as any

    const speciesRes = await app.inject({
        method: 'POST',
        url: '/species',
        payload: {
            name: `Amanita muscaria Identification Test ${timestamp}`,
            genusId: genus.id
        }
    })
    const species = speciesRes.json() as any

    // CREATE
    const createRes = await app.inject({
        method: 'POST',
        url: '/identifications',
        payload: {
            postId: post.id,
            userId: user.id,
            specieId: species.id
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdIdentification = createRes.json() as any
    assert.equal(createdIdentification.postId, post.id)
    assert.equal(createdIdentification.userId, user.id)
    assert.equal(createdIdentification.specieId, species.id)
    assert.equal(createdIdentification.confidence, null) // No votes yet
    assert.ok(createdIdentification.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/identifications/${createdIdentification.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().confidence, null)

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/identifications'
    })

    assert.equal(listRes.statusCode, 200)
    const identificationsList = listRes.json() as any[]
    assert.ok(identificationsList.length > 0)
    assert.ok(identificationsList.some(i => i.id === createdIdentification.id))

    // LIST BY POST
    const listByPostRes = await app.inject({
        method: 'GET',
        url: `/posts/${post.id}/identifications`
    })

    assert.equal(listByPostRes.statusCode, 200)
    const identificationsByPost = listByPostRes.json() as any[]
    assert.ok(identificationsByPost.length > 0)
    assert.ok(identificationsByPost.some(i => i.id === createdIdentification.id))

    // UPDATE
    const updateRes = await app.inject({
        method: 'PATCH',
        url: `/identifications/${createdIdentification.id}`,
        payload: {
            specieId: species.id // Same species for this test
        }
    })

    assert.equal(updateRes.statusCode, 200)
    assert.equal(updateRes.json().specieId, species.id)

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/identifications/${createdIdentification.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Identification deleted')

    // VERIFY DELETED
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/identifications/${createdIdentification.id}`
    })

    assert.equal(verifyRes.statusCode, 404)
    await app.close()
})