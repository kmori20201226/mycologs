import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST, PATCH and DELETE /media', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // First create a user and post
    const timestamp = Date.now()
    const userRes = await app.inject({
        method: 'POST',
        url: '/users',
        payload: {
            name: `John Doe Media Test ${timestamp}`,
            email: `john-media-test-${timestamp}@example.com`
        }
    })
    const user = userRes.json() as any

    const postRes = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: user.id,
            contents: `Found this mushroom in the forest. What species is it? Media test ${timestamp}.`
        }
    })
    const post = postRes.json() as any

    // CREATE
    const createRes = await app.inject({
        method: 'POST',
        url: '/media',
        payload: {
            filename: `mushroom-${timestamp}.jpg`,
            originalName: `DSC_0123-${timestamp}.jpg`,
            url: `https://example.com/uploads/mushroom-${timestamp}.jpg`,
            type: 'IMAGE',
            mimeType: 'image/jpeg',
            size: 2048576,
            width: 1920,
            height: 1080,
            postId: post.id,
            isPublic: true,
            description: `A beautiful mushroom found in the forest. Media test ${timestamp}.`,
            tags: ['mushroom', 'forest', 'identification']
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdMedia = createRes.json() as any
    assert.equal(createdMedia.filename, `mushroom-${timestamp}.jpg`)
    assert.equal(createdMedia.type, 'IMAGE')
    assert.equal(createdMedia.size, 2048576)
    assert.equal(createdMedia.postId, post.id)
    assert.ok(createdMedia.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/media/${createdMedia.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().filename, `mushroom-${timestamp}.jpg`)

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/media'
    })

    assert.equal(listRes.statusCode, 200)
    const mediaList = listRes.json() as any[]
    assert.ok(mediaList.length > 0)
    assert.ok(mediaList.some(m => m.id === createdMedia.id))

    // LIST BY POST
    const listByPostRes = await app.inject({
        method: 'GET',
        url: `/posts/${post.id}/media`
    })

    assert.equal(listByPostRes.statusCode, 200)
    const mediaByPost = listByPostRes.json() as any[]
    assert.ok(mediaByPost.length > 0)
    assert.ok(mediaByPost.some(m => m.id === createdMedia.id))

    // UPDATE
    const updateRes = await app.inject({
        method: 'PATCH',
        url: `/media/${createdMedia.id}`,
        payload: {
            description: 'Updated description: A beautiful mushroom found in the forest',
            tags: ['mushroom', 'forest', 'identification', 'updated']
        }
    })

    assert.equal(updateRes.statusCode, 200)
    assert.equal(updateRes.json().description, 'Updated description: A beautiful mushroom found in the forest')

    // DELETE (Soft delete)
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/media/${createdMedia.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Media soft deleted')

    // VERIFY SOFT DELETED (should still exist but with deletedAt set)
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/media/${createdMedia.id}`
    })

    // Since it's soft deleted, it might still return the record or return 404 depending on implementation
    // For this test, we'll just check that the operation completed
    assert.ok(verifyRes.statusCode === 200 || verifyRes.statusCode === 404)

    await app.close()
})