import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST, PATCH and DELETE /posts', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // First create a user
    const timestamp = Date.now()
    const userRes = await app.inject({
        method: 'POST',
        url: '/users',
        payload: {
            name: `John Doe Posts Test ${timestamp}`,
            email: `john-posts-test-${timestamp}@example.com`
        }
    })
    const user = userRes.json() as any

    // CREATE
    const createRes = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: user.id,
            contents: `Found this mushroom in the forest. What species is it? Posts test ${timestamp}.`
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdPost = createRes.json() as any
    assert.equal(createdPost.contents, `Found this mushroom in the forest. What species is it? Posts test ${timestamp}.`)
    assert.equal(createdPost.userId, user.id)
    assert.ok(createdPost.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/posts/${createdPost.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().contents, `Found this mushroom in the forest. What species is it? Posts test ${timestamp}.`)

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/posts'
    })

    assert.equal(listRes.statusCode, 200)
    const postsList = listRes.json() as any[]
    assert.ok(postsList.length > 0)
    assert.ok(postsList.some(p => p.id === createdPost.id))

    // UPDATE
    const updateRes = await app.inject({
        method: 'PATCH',
        url: `/posts/${createdPost.id}`,
        payload: {
            contents: `Updated: Found this mushroom in the forest. What species is it? Posts test ${timestamp}.`
        }
    })

    assert.equal(updateRes.statusCode, 200)
    assert.equal(updateRes.json().contents, `Updated: Found this mushroom in the forest. What species is it? Posts test ${timestamp}.`)

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/posts/${createdPost.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Post deleted')

    // VERIFY DELETED
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/posts/${createdPost.id}`
    })

    assert.equal(verifyRes.statusCode, 404)
    await app.close()
})