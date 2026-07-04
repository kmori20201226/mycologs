import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

// Roles are a fixed, closed set (the RoleType enum) with a UNIQUE name. On a
// freshly migrated DB the table is empty; on a seeded/dev DB every value already
// exists. So this test can't assume it may create a brand-new role — it creates
// ADMIN if absent and otherwise reuses the existing row, which keeps it green in
// both environments without mutating seeded reference data.
test('POST, GET, LIST and DELETE /roles', async (t) => {
    const app = await buildApp()
    t.after(() => app.close())

    // CREATE (or reuse if already seeded).
    const createRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: 'ADMIN' },
    })

    let role: any
    let weCreatedIt = false
    if (createRes.statusCode === 201) {
        role = createRes.json()
        weCreatedIt = true
        assert.equal(role.name, 'ADMIN')
    } else {
        // Already present: the unique constraint rejects the duplicate.
        assert.ok(createRes.statusCode >= 400, `expected duplicate to be rejected, got ${createRes.statusCode}`)
        const list = (await app.inject({ method: 'GET', url: '/roles' })).json() as any[]
        role = list.find((r) => r.name === 'ADMIN')
    }
    assert.ok(role && role.id, 'an ADMIN role should exist')

    // READ BY ID
    const getRes = await app.inject({ method: 'GET', url: `/roles/${role.id}` })
    assert.equal(getRes.statusCode, 200)
    assert.equal(getRes.json().name, 'ADMIN')

    // LIST ALL
    const listRes = await app.inject({ method: 'GET', url: '/roles' })
    assert.equal(listRes.statusCode, 200)
    const rolesList = listRes.json() as any[]
    assert.ok(rolesList.some((r) => r.id === role.id))

    // Creating a duplicate name is always rejected by the unique constraint.
    const dupRes = await app.inject({ method: 'POST', url: '/roles', payload: { name: 'ADMIN' } })
    assert.ok(dupRes.statusCode >= 400, `duplicate role name should be rejected, got ${dupRes.statusCode}`)

    // Only clean up the role if this test created it (don't delete seeded
    // reference data that other rows may reference).
    if (weCreatedIt) {
        const deleteRes = await app.inject({ method: 'DELETE', url: `/roles/${role.id}` })
        assert.equal(deleteRes.statusCode, 200)
        assert.equal(deleteRes.json().message, 'Role deleted')

        const verifyRes = await app.inject({ method: 'GET', url: `/roles/${role.id}` })
        assert.equal(verifyRes.statusCode, 404)
    }
})
