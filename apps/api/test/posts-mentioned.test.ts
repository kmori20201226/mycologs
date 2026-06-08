import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app'

// Tests for mentionedSpecies extraction on GET /posts/:id — the deterministic
// "mushrooms named in the post text" feature (no AI). Like the other suites it
// hits the real dev DB, so it creates its own taxonomy + species and asserts
// about THOSE species by id (the extractor scans all species, so exact array
// length isn't reliable). Everything created is cleaned up in t.after.

test('mentionedSpecies extraction', async (t) => {
    const app = await buildApp()
    const ts = Date.now()

    // Taxonomy chain so we can create species (Shape → Family → Genus → Species).
    const shape = await app.prisma.shape.create({ data: { name: `mention-shape-${ts}` } })
    const family = await app.prisma.family.create({ data: { scientificName: `mention-fam-${ts}`, shapeId: shape.id } })
    const genus = await app.prisma.genus.create({ data: { scientificName: `mention-gen-${ts}`, familyId: family.id } })

    // Distinctive made-up names; B's name is a substring of A's (containment case).
    const A = await app.prisma.species.create({ data: { genusId: genus.id, scientificName: `Mentionus longus ${ts}`, japaneseName: 'アカテストタケ' } })
    const B = await app.prisma.species.create({ data: { genusId: genus.id, scientificName: `Mentionus brevis ${ts}`, japaneseName: 'テストタケ' } })
    const C = await app.prisma.species.create({ data: { genusId: genus.id, scientificName: `Mentionus rubrus ${ts}`, japaneseName: 'ベニテストキノコ' } })
    const D = await app.prisma.species.create({ data: { genusId: genus.id, scientificName: `Mentionus unus ${ts}`, japaneseName: '茸' } }) // 1 char

    const user = await app.prisma.user.create({ data: { name: `mention-user ${ts}`, email: `mention-${ts}@example.com` } })

    t.after(async () => {
        await app.prisma.user.delete({ where: { id: user.id } })   // cascades posts
        await app.prisma.shape.delete({ where: { id: shape.id } })  // cascades family → genus → species
        await app.close()
    })

    // Create a post with the given text and return its mentionedSpecies ids.
    async function mentionedIds(contents: string): Promise<number[]> {
        const post = await app.prisma.post.create({ data: { userId: user.id, contents } })
        const res = await app.inject({ method: 'GET', url: `/posts/${post.id}` })
        assert.equal(res.statusCode, 200)
        const list = (res.json() as any).mentionedSpecies
        assert.ok(Array.isArray(list))
        return list.map((s: any) => s.id)
    }

    await t.test('extracts a species named in the text', async () => {
        const ids = await mentionedIds('きょうはベニテストキノコを見つけた。')
        assert.ok(ids.includes(C.id))
    })

    await t.test('dedups a name contained inside a longer match', async () => {
        const ids = await mentionedIds('林でアカテストタケを観察した。')
        assert.ok(ids.includes(A.id))
        assert.ok(!ids.includes(B.id)) // テストタケ is only a substring of アカテストタケ here
    })

    await t.test('keeps a shorter name that also appears standalone', async () => {
        const ids = await mentionedIds('アカテストタケとテストタケは別物です。')
        assert.ok(ids.includes(A.id))
        assert.ok(ids.includes(B.id)) // standalone テストタケ occurrence is kept
    })

    await t.test('does not match text without those names', async () => {
        const ids = await mentionedIds('きれいな景色を見て散歩しました。')
        for (const id of [A.id, B.id, C.id, D.id]) assert.ok(!ids.includes(id))
    })

    await t.test('ignores single-character names (min length 2)', async () => {
        const ids = await mentionedIds('大きな茸がありました。')
        assert.ok(!ids.includes(D.id)) // 茸 is 1 char → excluded
    })
})
