import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST and GET /users with real db', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    const createRes = await app.inject({
        method: 'POST',
        url: '/users',
        payload: {
            name: 'Taro',
            email: 'taro@example.com',
            password: 'Secrets'
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdUser = createRes.json()

    const getRes = await app.inject({
        method: 'GET',
        url: `/users/${createdUser.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().name, 'Taro')
    assert.equal(getRes.json().email, 'taro@example.com')

    // Step 2: Delete the user
    const deleteResp = await app.inject({
        method: 'DELETE',
        url: `/users/${createdUser.id}`
    })

    assert.equal(deleteResp.statusCode, 200, 'Delete should return 200')
    const deleteResult = deleteResp.json() as any
    assert.equal(deleteResult.message, 'User deleted')
    assert.equal(deleteResult.user.id, createdUser.id)

    // Step 3: Verify user no longer exists
    const verifyResp = await app.inject({
        method: 'GET',
        url: `/users/${createdUser.id}`
    })
    assert.equal(verifyResp.statusCode, 404, 'Deleted user should not be found')

    // Step 4: Close the app
    await app.close()

})
