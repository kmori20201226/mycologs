import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST and DELETE /votes with confidence calculation', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // First create users, post, identification
    const timestamp = Math.random().toString(36).substring(2)
    const user1Res = await app.inject({
        method: 'POST',
        url: '/users',
        payload: {
            name: 'John Doe Vote Test',
            email: `vote-test-user1-${timestamp}@example.com`
        }
    })
    const user1 = user1Res.json() as any

    const user2Res = await app.inject({
        method: 'POST',
        url: '/users',
        payload: {
            name: `Jane Smith Vote Test ${timestamp}`,
            email: `vote-test-user2-${timestamp}@example.com`
        }
    })
    const user2 = user2Res.json() as any

    const postRes = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: user1.id,
            contents: 'Found this mushroom in the forest. What species is it? Vote test.'
        }
    })
    const post = postRes.json() as any
    // Create taxonomy hierarchy
    const shapeRes = await app.inject({
        method: 'POST',
        url: '/shapes',
        payload: { name: `Agaricales Vote Test ${timestamp}` }
    })
    const shape = shapeRes.json() as any

    const familyRes = await app.inject({
        method: 'POST',
        url: '/families',
        payload: {
            name: `Amanitaceae Vote Test ${timestamp}`,
            shapeId: shape.id
        }
    })
    const family = familyRes.json() as any

    const genusRes = await app.inject({
        method: 'POST',
        url: '/genera',
        payload: {
            name: `Amanita Vote Test ${timestamp}`,
            familyId: family.id
        }
    })
    const genus = genusRes.json() as any

    const speciesRes = await app.inject({
        method: 'POST',
        url: '/species',
        payload: {
            name: `Amanita muscaria Vote Test ${timestamp}`,
            genusId: genus.id
        }
    })
    const species = speciesRes.json() as any

    const identificationRes = await app.inject({
        method: 'POST',
        url: '/identifications',
        payload: {
            postId: post.id,
            userId: user1.id,
            specieId: species.id
        }
    })
    const identification = identificationRes.json() as any

    // CREATE VOTE
    const createRes = await app.inject({
        method: 'POST',
        url: '/votes',
        payload: {
            postId: post.id,
            userId: user2.id,
            identificationId: identification.id,
            probability: 0.9
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdVote = createRes.json() as any
    assert.equal(createdVote.postId, post.id)
    assert.equal(createdVote.userId, user2.id)
    assert.equal(createdVote.identificationId, identification.id)
    assert.equal(createdVote.probability, 0.9)
    assert.ok(createdVote.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/votes/${createdVote.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().probability, 0.9)

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/votes'
    })

    assert.equal(listRes.statusCode, 200)
    const votesList = listRes.json() as any[]
    assert.ok(votesList.length > 0)
    assert.ok(votesList.some(v => v.id === createdVote.id))

    // LIST BY POST
    const listByPostRes = await app.inject({
        method: 'GET',
        url: `/posts/${post.id}/votes`
    })

    assert.equal(listByPostRes.statusCode, 200)
    const votesByPost = listByPostRes.json() as any[]
    assert.ok(votesByPost.length > 0)
    assert.ok(votesByPost.some(v => v.id === createdVote.id))

    // LIST BY USER
    const listByUserRes = await app.inject({
        method: 'GET',
        url: `/users/${user2.id}/votes`
    })

    assert.equal(listByUserRes.statusCode, 200)
    const votesByUser = listByUserRes.json() as any[]
    assert.ok(votesByUser.length > 0)
    assert.ok(votesByUser.some(v => v.id === createdVote.id))

    // CHECK CONFIDENCE WAS UPDATED
    const identificationAfterVote = await app.inject({
        method: 'GET',
        url: `/identifications/${identification.id}`
    })
    const updatedIdentification = identificationAfterVote.json() as any
    assert.equal(updatedIdentification.confidence, 0.9) // Single vote with weight 1

    // REPLACE VOTE (same user, different identification would be tested separately)
    // For now, just test deletion

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/votes/${createdVote.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Vote deleted')

    // VERIFY DELETED
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/votes/${createdVote.id}`
    })

    assert.equal(verifyRes.statusCode, 404)

    // CHECK CONFIDENCE WAS RESET
    const identificationAfterDelete = await app.inject({
        method: 'GET',
        url: `/identifications/${identification.id}`
    })
    const finalIdentification = identificationAfterDelete.json() as any
    assert.equal(finalIdentification.confidence, null) // No votes left

    await app.close()
})