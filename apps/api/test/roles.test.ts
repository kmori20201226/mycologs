import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

test('POST, GET, LIST and DELETE /roles', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // CREATE
    const createRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: {
            name: 'ADMIN'
        }
    })

    assert.equal(createRes.statusCode, 201)
    const createdRole = createRes.json() as any
    assert.equal(createdRole.name, 'ADMIN')
    assert.ok(createdRole.id)

    // READ BY ID
    const getRes = await app.inject({
        method: 'GET',
        url: `/roles/${createdRole.id}`
    })

    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().name, 'ADMIN')

    // LIST ALL
    const listRes = await app.inject({
        method: 'GET',
        url: '/roles'
    })

    assert.equal(listRes.statusCode, 200)
    const rolesList = listRes.json() as any[]
    assert.ok(rolesList.length > 0)
    assert.ok(rolesList.some(r => r.id === createdRole.id))

    // DELETE
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/roles/${createdRole.id}`
    })

    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().message, 'Role deleted')

    // VERIFY DELETED
    const verifyRes = await app.inject({
        method: 'GET',
        url: `/roles/${createdRole.id}`
    })

    assert.equal(verifyRes.statusCode, 404)
    await app.close()
})
