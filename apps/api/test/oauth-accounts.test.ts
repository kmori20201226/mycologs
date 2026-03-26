import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST and DELETE /oauth-accounts', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // First create a user for the OAuth account
    const uniqueEmail = `oauth-${Date.now()}@example.com`
    const userRes = await app.inject({
        method: 'POST',
        url: '/users',
        payload: {
            name: 'OAuth User',
            email: uniqueEmail,
            password: 'securePassword123'
        }
    })

    assert.equal(userRes.statusCode, 201)
    const userId = userRes.json().id

    // CREATE OAuth Account
    const createRes = await app.inject({
        method: 'POST',
        url: '/oauth-accounts',
        payload: {
            userId: userId,
            provider: 'google',
            providerAccountId: 'google-123456',
            accessToken: 'access_token_xyz',
            refreshToken: 'refresh_token_abc',
            expiresAt: 1999999999,
            tokenType: 'Bearer',
            scope: 'openid profile email',
            idToken: 'id_token_123'
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdAccount = createRes.json() as any
    assert.equal(createdAccount.provider, 'google')
    assert.equal(createdAccount.providerAccountId, 'google-123456')
    assert.equal(createdAccount.userId, userId)
    assert.ok(createdAccount.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/oauth-accounts/${createdAccount.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().provider, 'google')

    // LIST ALL FOR USER
    const listRes = await app.inject({
        method: 'GET',
        url: `/users/${userId}/oauth-accounts`
    })

    assert.equal(listRes.statusCode, 200)
    const accountsList = listRes.json() as any[]
    assert.ok(accountsList.length > 0)
    assert.ok(accountsList.some(a => a.id === createdAccount.id))
    assert.ok(accountsList.every(a => a.userId === userId))

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/oauth-accounts/${createdAccount.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'OAuth Account deleted')

    // VERIFY DELETED
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/oauth-accounts/${createdAccount.id}`
    })

    assert.equal(verifyRes.statusCode, 404)
    await app.close()
})
