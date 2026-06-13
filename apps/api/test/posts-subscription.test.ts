import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

// Personal events (no club) are a paid, subscriber-only feature. The events
// route already refuses to *create* a personal event once a user's access has
// lapsed. This test characterises the *posting* side: a lapsed user must not be
// able to slip a post into a personal event (e.g. by selecting an existing one
// directly), which is currently possible because POST /posts performs no
// subscription check on the referenced event.

test('POST /posts is gated on subscription access for personal events', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    const ts = Date.now()
    const day = 86_400_000

    async function makeUser(tag: string) {
        const res = await app.inject({
            method: 'POST',
            url: '/users',
            payload: {
                name: `Posts Sub ${tag} ${ts}`,
                email: `posts-sub-${tag}-${ts}@example.com`,
                password: 'password123',
            },
        })
        const user = res.json() as any
        assert.ok(user.id, `user ${tag} created`)
        return user
    }

    async function makeSubscription(userId: number, accessUntil: Date) {
        const res = await app.inject({
            method: 'POST',
            url: '/subscriptions',
            payload: {
                userId,
                status: 'active',
                planId: 'personal',
                accessUntil: accessUntil.toISOString(),
            },
        })
        assert.equal(res.statusCode, 201)
        return res.json() as any
    }

    async function makePersonalEvent(user: any) {
        const token = app.jwt.sign({ id: user.id, email: user.email })
        const res = await app.inject({
            method: 'POST',
            url: '/events',
            headers: { authorization: `Bearer ${token}` },
            payload: { name: `個人イベント ${ts}`, userId: user.id },
        })
        assert.equal(res.statusCode, 201)
        return res.json() as any
    }

    // --- Lapsed subscriber -------------------------------------------------
    const lapsed = await makeUser('lapsed')
    // Give active access first so the personal event can be created at all.
    const sub = await makeSubscription(lapsed.id, new Date(Date.now() + day))
    const personalEvent = await makePersonalEvent(lapsed)

    // While still subscribed, create a post attached to the personal event so we
    // can later check that editing it is frozen once access lapses.
    const personalPostRes = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: lapsed.id,
            eventId: personalEvent.id,
            contents: `Personal-event post made while subscribed ${ts}`,
            confirmedModeration: { category: 'NONE' },
        },
    })
    assert.equal(personalPostRes.statusCode, 201)
    const personalPost = personalPostRes.json() as any

    // Also create a PRIVATE post (no event) while subscribed — PRIVATE is itself a
    // paid feature, so it too should freeze once access lapses.
    const privatePostRes = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: lapsed.id,
            visibility: 'PRIVATE',
            contents: `PRIVATE post made while subscribed ${ts}`,
            confirmedModeration: { category: 'NONE' },
        },
    })
    assert.equal(privatePostRes.statusCode, 201)
    const privatePost = privatePostRes.json() as any

    // Now lapse it: access_until moves into the past (status stays "active",
    // mirroring a real lapse where the optimization field is what expires).
    const patchRes = await app.inject({
        method: 'PATCH',
        url: `/subscriptions/${sub.id}`,
        payload: { accessUntil: new Date(Date.now() - day).toISOString() },
    })
    assert.equal(patchRes.statusCode, 200)

    // Posting into the personal event must be refused.
    const blocked = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: lapsed.id,
            eventId: personalEvent.id,
            contents: `Lapsed user posting into personal event ${ts}`,
            confirmedModeration: { category: 'NONE' },
        },
    })
    assert.equal(blocked.statusCode, 403, 'lapsed user cannot post into a personal event')

    // ...but posting with no event attached stays free for everyone.
    const freePostRes = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: lapsed.id,
            contents: `Lapsed user posting with no event ${ts}`,
            confirmedModeration: { category: 'NONE' },
        },
    })
    assert.equal(freePostRes.statusCode, 201, 'event-less posts are never gated')
    const freePost = freePostRes.json() as any

    // Editing the personal-event post is now refused — it is read-only while lapsed.
    const blockedEdit = await app.inject({
        method: 'PATCH',
        url: `/posts/${personalPost.id}`,
        payload: {
            userId: lapsed.id,
            contents: `Trying to edit caption while lapsed ${ts}`,
            confirmedModeration: { category: 'NONE' },
        },
    })
    assert.equal(blockedEdit.statusCode, 403, 'lapsed user cannot edit a personal-event post')

    // A PRIVATE post is likewise frozen — even a caption-only edit is refused.
    const blockedPrivatePostEdit = await app.inject({
        method: 'PATCH',
        url: `/posts/${privatePost.id}`,
        payload: {
            userId: lapsed.id,
            contents: `Trying to edit PRIVATE post while lapsed ${ts}`,
            confirmedModeration: { category: 'NONE' },
        },
    })
    assert.equal(blockedPrivatePostEdit.statusCode, 403, 'lapsed user cannot edit a PRIVATE post')

    // Detaching the event from that post is likewise refused.
    const blockedDetach = await app.inject({
        method: 'PATCH',
        url: `/posts/${personalPost.id}`,
        payload: { userId: lapsed.id, eventId: null },
    })
    assert.equal(blockedDetach.statusCode, 403, 'lapsed user cannot detach the personal event')

    // ...but editing an event-less post stays allowed.
    const freeEdit = await app.inject({
        method: 'PATCH',
        url: `/posts/${freePost.id}`,
        payload: {
            userId: lapsed.id,
            contents: `Editing event-less post while lapsed ${ts}`,
            confirmedModeration: { category: 'NONE' },
        },
    })
    assert.equal(freeEdit.statusCode, 200, 'event-less posts remain editable')

    // A lapsed user cannot create a PRIVATE post (visibility is subscriber-only).
    const blockedPrivateCreate = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: lapsed.id,
            visibility: 'PRIVATE',
            contents: `Lapsed user creating a PRIVATE post ${ts}`,
            confirmedModeration: { category: 'NONE' },
        },
    })
    assert.equal(blockedPrivateCreate.statusCode, 403, 'lapsed user cannot create a PRIVATE post')

    // ...nor flip an existing post to PRIVATE via edit.
    const blockedPrivateEdit = await app.inject({
        method: 'PATCH',
        url: `/posts/${freePost.id}`,
        payload: { userId: lapsed.id, visibility: 'PRIVATE' },
    })
    assert.equal(blockedPrivateEdit.statusCode, 403, 'lapsed user cannot switch a post to PRIVATE')

    // ...nor attach an (older) personal event to a previously event-less post.
    const blockedAttach = await app.inject({
        method: 'PATCH',
        url: `/posts/${freePost.id}`,
        payload: { userId: lapsed.id, eventId: personalEvent.id },
    })
    assert.equal(blockedAttach.statusCode, 403, 'lapsed user cannot attach a personal event via edit')

    // --- Active subscriber control ----------------------------------------
    const active = await makeUser('active')
    await makeSubscription(active.id, new Date(Date.now() + day))
    const activeEvent = await makePersonalEvent(active)

    const allowed = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: active.id,
            eventId: activeEvent.id,
            contents: `Active subscriber posting into personal event ${ts}`,
            confirmedModeration: { category: 'NONE' },
        },
    })
    assert.equal(allowed.statusCode, 201, 'active subscriber can post into a personal event')

    // ...and can create a PRIVATE post.
    const allowedPrivate = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
            userId: active.id,
            visibility: 'PRIVATE',
            contents: `Active subscriber creating a PRIVATE post ${ts}`,
            confirmedModeration: { category: 'NONE' },
        },
    })
    assert.equal(allowedPrivate.statusCode, 201, 'active subscriber can create a PRIVATE post')
})
