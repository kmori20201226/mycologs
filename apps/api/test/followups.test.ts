import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST, PATCH and DELETE /followups', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // First create a user and post
    const timestamp = Date.now()
    const userRes = await app.inject({
        method: 'POST',
        url: '/users',
        payload: {
            name: `John Doe Followup Test ${timestamp}`,
            email: `john-followup-test-${timestamp}@example.com`
        }
    })
    const user = userRes.json() as any

    const postRes = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: user.id,
            contents: `Found this mushroom in the forest. What species is it? Followup test ${timestamp}.`
        }
    })
    const post = postRes.json() as any

    // CREATE
    const createRes = await app.inject({
        method: 'POST',
        url: '/followups',
        payload: {
            postId: post.id,
            contents: `Can you provide more details about the location? Followup test ${timestamp}.`
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdFollowup = createRes.json() as any
    assert.equal(createdFollowup.contents, `Can you provide more details about the location? Followup test ${timestamp}.`)
    assert.equal(createdFollowup.postId, post.id)
    assert.ok(createdFollowup.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/followups/${createdFollowup.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().contents, `Can you provide more details about the location? Followup test ${timestamp}.`)

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/followups'
    })

    assert.equal(listRes.statusCode, 200)
    const followupsList = listRes.json() as any[]
    assert.ok(followupsList.length > 0)
    assert.ok(followupsList.some(f => f.id === createdFollowup.id))

    // LIST BY POST
    const listByPostRes = await app.inject({
        method: 'GET',
        url: `/posts/${post.id}/followups`
    })

    assert.equal(listByPostRes.statusCode, 200)
    const followupsByPost = listByPostRes.json() as any[]
    assert.ok(followupsByPost.length > 0)
    assert.ok(followupsByPost.some(f => f.id === createdFollowup.id))

    // UPDATE
    const updateRes = await app.inject({
        method: 'PATCH',
        url: `/followups/${createdFollowup.id}`,
        payload: {
            contents: `Updated: Can you provide more details about the location and time? Followup test ${timestamp}.`
        }
    })

    assert.equal(updateRes.statusCode, 200)
    assert.equal(updateRes.json().contents, `Updated: Can you provide more details about the location and time? Followup test ${timestamp}.`)

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/followups/${createdFollowup.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Followup deleted')

    // VERIFY DELETED
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/followups/${createdFollowup.id}`
    })

    assert.equal(verifyRes.statusCode, 404)
    await app.close()
})