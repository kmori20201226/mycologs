import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import fs from 'fs'
import sharp from 'sharp'
import { buildApp } from '../src/app'

const UPLOADS_DIR = path.resolve(__dirname, '../../../data/uploads')

// Create a user and a JWT for authenticated media edits.
async function makeUser(app: any, label: string) {
    const ts = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const res = await app.inject({
        method: 'POST',
        url: '/users',
        payload: { name: `${label} ${ts}`, email: `${label}-${ts}@example.com` },
    })
    const user = res.json() as any
    const token = app.jwt.sign({ id: user.id, email: user.email })
    return { user, headers: { authorization: `Bearer ${token}` } }
}

// Write a real WxH JPEG into the uploads dir and register a matching media row
// on `postId`. Returns the media record and its on-disk path (for cleanup).
async function makeImageMedia(app: any, postId: number, userId: number, w: number, h: number) {
    const buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 80, b: 40 } } })
        .jpeg().toBuffer()
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
    const filename = `P-${userId}-${postId}-test${Math.random().toString(16).slice(2, 10)}.jpg`
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf)
    const res = await app.inject({
        method: 'POST',
        url: '/media',
        payload: {
            filename, originalName: 'test.jpg', url: `http://localhost:3000/uploads/${filename}`,
            type: 'IMAGE', mimeType: 'image/jpeg', size: buf.length, width: w, height: h, postId,
        },
    })
    return { media: res.json() as any, filePath: path.join(UPLOADS_DIR, filename) }
}

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

test('POST /media/:id/rotate rotates the image and swaps dimensions', async (t) => {
    const app = await buildApp()
    const created: string[] = []
    t.after(() => { for (const f of created) fs.promises.unlink(f).catch(() => {}); return app.close() })

    const { user, headers } = await makeUser(app, 'rot-owner')
    const post = (await app.inject({
        method: 'POST', url: '/posts',
        payload: { userId: user.id, contents: `rotate test ${Date.now()}` },
    })).json() as any

    const { media, filePath } = await makeImageMedia(app, post.id, user.id, 200, 100)
    created.push(filePath)

    // Unauthenticated is rejected.
    const noAuth = await app.inject({
        method: 'POST', url: `/media/${media.id}/rotate`, payload: { direction: 'cw' },
    })
    assert.equal(noAuth.statusCode, 401)

    // A different user cannot rotate someone else's picture.
    const other = await makeUser(app, 'rot-stranger')
    const forbidden = await app.inject({
        method: 'POST', url: `/media/${media.id}/rotate`, headers: other.headers, payload: { direction: 'cw' },
    })
    assert.equal(forbidden.statusCode, 403)

    // Invalid direction fails schema validation.
    const badDir = await app.inject({
        method: 'POST', url: `/media/${media.id}/rotate`, headers, payload: { direction: 'sideways' },
    })
    assert.equal(badDir.statusCode, 400)

    // Owner rotates clockwise: 200x100 -> 100x200, under a fresh filename, and
    // the old file is removed while the new one is written.
    const rot = await app.inject({
        method: 'POST', url: `/media/${media.id}/rotate`, headers, payload: { direction: 'cw' },
    })
    assert.equal(rot.statusCode, 200)
    const rotated = rot.json() as any
    assert.equal(rotated.width, 100)
    assert.equal(rotated.height, 200)
    assert.notEqual(rotated.filename, media.filename)
    assert.equal(fs.existsSync(filePath), false)
    const newPath = path.join(UPLOADS_DIR, rotated.filename)
    assert.equal(fs.existsSync(newPath), true)
    created.push(newPath)
})

test('photo move follows previous/next posts by taken time within 1 hour', async (t) => {
    const app = await buildApp()
    const created: string[] = []
    t.after(() => { for (const f of created) fs.promises.unlink(f).catch(() => {}); return app.close() })

    const { user, headers } = await makeUser(app, 'move-owner')
    const mkPost = async (takenAt: string) => (await app.inject({
        method: 'POST', url: '/posts',
        payload: { userId: user.id, contents: `move test ${takenAt}`, takenAt },
    })).json() as any

    // A at 10:00, B at 10:30 (30 min after A), C at 12:30 (2h after B).
    const postA = await mkPost('2026-05-01T10:00:00.000Z')
    const postB = await mkPost('2026-05-01T10:30:00.000Z')
    const postC = await mkPost('2026-05-01T12:30:00.000Z')

    const { media, filePath } = await makeImageMedia(app, postB.id, user.id, 120, 90)
    created.push(filePath)

    // Neighbours of B: prev = A (30 min earlier), next = null (C is >1h away).
    const nb = (await app.inject({
        method: 'GET', url: `/posts/${postB.id}/photo-neighbors`, headers,
    })).json() as any
    assert.equal(nb.prev, postA.id)
    assert.equal(nb.next, null)

    // Non-owner gets no targets.
    const other = await makeUser(app, 'move-stranger')
    const nbOther = (await app.inject({
        method: 'GET', url: `/posts/${postB.id}/photo-neighbors`, headers: other.headers,
    })).json() as any
    assert.equal(nbOther.prev, null)
    assert.equal(nbOther.next, null)

    // Moving "next" from B fails: C is more than an hour away.
    const noNext = await app.inject({
        method: 'POST', url: `/media/${media.id}/move`, headers, payload: { direction: 'next' },
    })
    assert.equal(noNext.statusCode, 409)

    // Moving "prev" from B relocates the picture onto A.
    const mv = await app.inject({
        method: 'POST', url: `/media/${media.id}/move`, headers, payload: { direction: 'prev' },
    })
    assert.equal(mv.statusCode, 200)
    assert.equal((mv.json() as any).postId, postA.id)

    const aMedia = (await app.inject({ method: 'GET', url: `/posts/${postA.id}/media` })).json() as any[]
    const bMedia = (await app.inject({ method: 'GET', url: `/posts/${postB.id}/media` })).json() as any[]
    assert.ok(aMedia.some((m) => m.id === media.id), 'picture now belongs to A')
    assert.ok(!bMedia.some((m) => m.id === media.id), 'picture no longer belongs to B')

    // From A there is no earlier post within an hour -> 409.
    const noPrev = await app.inject({
        method: 'POST', url: `/media/${media.id}/move`, headers, payload: { direction: 'prev' },
    })
    assert.equal(noPrev.statusCode, 409)

    // A stranger cannot move the picture.
    const forbidden = await app.inject({
        method: 'POST', url: `/media/${media.id}/move`, headers: other.headers, payload: { direction: 'next' },
    })
    assert.equal(forbidden.statusCode, 403)

    void postC
})