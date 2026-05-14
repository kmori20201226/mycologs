/**
 * Restore posts, followups, media, and identifications from a backup archive.
 * Votes are intentionally excluded from backup/restore.
 *
 * External references are resolved against the importing system:
 *   userEmail             → User.id  (falls back to a dummy user if not found)
 *   speciesScientificName → Species.id (identification gets specieId=null if not found, with a warning)
 *
 * A sentinel user (unknown@localhost) is created automatically if any emails
 * cannot be resolved, so no records are lost due to missing users.
 *
 * Internal IDs (Post.id, Identification.id) are remapped to new auto-increment values.
 * Existing records are never overwritten — the restore is purely additive.
 *
 * Usage:
 *   npm run restore-posts -- <path-to-backup.tar.gz>
 */

import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { createGunzip } from 'zlib'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const UPLOADS_DIR = path.resolve(__dirname, '../data/uploads')
const DUMMY_USER_EMAIL = 'unknown@localhost'

// ---------------------------------------------------------------------------
// Minimal tar reader (POSIX ustar)
// ---------------------------------------------------------------------------

interface TarEntry {
    path: string
    isDir: boolean
    data: Buffer
}

function parseTar(buf: Buffer): TarEntry[] {
    const entries: TarEntry[] = []
    let offset = 0
    while (offset + 512 <= buf.length) {
        const header = buf.slice(offset, offset + 512)
        const name = header.slice(0, 100).toString('utf8').replace(/\0.*/, '')
        if (!name) break
        const size = parseInt(header.slice(124, 136).toString('utf8').trim(), 8) || 0
        const typeFlag = header.slice(156, 157).toString('utf8')
        offset += 512
        const data = buf.slice(offset, offset + size)
        offset += Math.ceil(size / 512) * 512
        entries.push({ path: name, isDir: typeFlag === '5' || name.endsWith('/'), data })
    }
    return entries
}

async function readTarGz(archivePath: string): Promise<TarEntry[]> {
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
        const src = fs.createReadStream(archivePath)
        const gunzip = createGunzip()
        src.pipe(gunzip)
        gunzip.on('data', (chunk: Buffer) => chunks.push(chunk))
        gunzip.on('end', resolve)
        gunzip.on('error', reject)
        src.on('error', reject)
    })
    return parseTar(Buffer.concat(chunks))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const archivePath = process.argv[2]
    if (!archivePath) {
        console.error('Usage: npm run restore-posts -- <path-to-backup.tar.gz>')
        process.exit(1)
    }

    console.log(`Reading archive: ${archivePath}`)
    const entries = await readTarGz(archivePath)

    const dataEntry = entries.find(e => e.path === 'data.json')
    if (!dataEntry) {
        console.error('Archive does not contain data.json')
        process.exit(1)
    }

    const data = JSON.parse(dataEntry.data.toString('utf8')) as {
        version: number
        exportedAt: string
        posts: Array<{
            id: number
            userEmail: string | null
            parentPostId: number | null
            contents: string
            deletedAt: string | null
            createdAt: string
            updatedAt: string
        }>
        media: Array<{
            id: string
            postId: number
            filename: string
            originalName: string
            type: string
            mimeType: string
            size: number
            duration: number | null
            width: number | null
            height: number | null
            thumbnailUrl: string | null
            isPublic: boolean
            description: string | null
            tags: string[]
            createdAt: string
            updatedAt: string
        }>
        identifications: Array<{
            id: number
            postId: number
            userEmail: string | null
            speciesScientificName: string | null
            identificationHint: string | null
            description: unknown
            accepted: boolean
            score: number | null
            deletedAt: string | null
            createdAt: string
            updatedAt: string
        }>
    }

    console.log(
        `Backup from ${data.exportedAt}: ` +
        `${data.posts.length} posts, ${data.media.length} media, ` +
        `${data.identifications.length} identifications`
    )

    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
    const prisma = new PrismaClient({ adapter })

    try {
        // Resolve external: email → userId
        const emails = new Set([
            ...data.posts.map(p => p.userEmail),
            ...data.identifications.map(i => i.userEmail),
        ].filter((e): e is string => e !== null))

        const users = await prisma.user.findMany({
            where: { email: { in: [...emails] } },
            select: { id: true, email: true },
        })
        const userIdByEmail = new Map(users.map(u => [u.email, u.id]))

        const missingEmails = [...emails].filter(e => !userIdByEmail.has(e))
        let dummyUserId: number | null = null
        if (missingEmails.length > 0) {
            console.warn(`${missingEmails.length} user email(s) not found — will assign to dummy user (${DUMMY_USER_EMAIL}):`)
            missingEmails.forEach(e => console.warn(`  ${e}`))

            const dummy = await prisma.user.upsert({
                where: { email: DUMMY_USER_EMAIL },
                update: {},
                create: {
                    email: DUMMY_USER_EMAIL,
                    name: 'Unknown User',
                    emailVerified: new Date(),
                },
            })
            dummyUserId = dummy.id
            missingEmails.forEach(e => userIdByEmail.set(e, dummyUserId!))
        }

        const resolveUser = (email: string | null): number | null => {
            if (!email) return dummyUserId
            return userIdByEmail.get(email) ?? dummyUserId
        }

        // Resolve external: scientificName → speciesId
        const scientificNames = data.identifications
            .map(i => i.speciesScientificName)
            .filter((n): n is string => n !== null)
        const speciesList = await prisma.species.findMany({
            where: { scientificName: { in: scientificNames }, deletedAt: null },
            select: { id: true, scientificName: true },
        })
        const speciesIdByName = new Map(speciesList.map(s => [s.scientificName, s.id]))
        const missingSpecies = [...new Set(scientificNames)].filter(n => !speciesIdByName.has(n))
        if (missingSpecies.length > 0) {
            console.warn(`${missingSpecies.length} species not found — identifications will have specieId=null:`)
            missingSpecies.forEach(n => console.warn(`  ${n}`))
        }

        // Insert posts — parents must come before children
        console.log('\nInserting posts…')
        const postById = new Map(data.posts.map(p => [p.id, p]))
        const postIdMap = new Map<number, number>()

        const inserted = new Set<number>()
        const ordered: typeof data.posts = []
        const visit = (id: number) => {
            if (inserted.has(id)) return
            const p = postById.get(id)!
            if (p.parentPostId && !inserted.has(p.parentPostId)) visit(p.parentPostId)
            ordered.push(p)
            inserted.add(id)
        }
        data.posts.forEach(p => visit(p.id))

        let skippedPosts = 0
        for (const p of ordered) {
            const userId = resolveUser(p.userEmail)
            if (!userId) {
                console.warn(`  Skipping post id=${p.id}: no user and no dummy user available`)
                skippedPosts++
                continue
            }
            const newParentId = p.parentPostId ? postIdMap.get(p.parentPostId) : undefined
            if (p.parentPostId && !newParentId) {
                console.warn(`  Skipping post id=${p.id}: parent post was skipped`)
                skippedPosts++
                continue
            }
            const created = await prisma.post.create({
                data: {
                    userId,
                    parentPostId: newParentId ?? null,
                    contents: p.contents,
                    deletedAt: p.deletedAt ? new Date(p.deletedAt) : null,
                    createdAt: new Date(p.createdAt),
                    updatedAt: new Date(p.updatedAt),
                },
            })
            postIdMap.set(p.id, created.id)
        }
        console.log(`  Inserted ${postIdMap.size} posts (${skippedPosts} skipped)`)

        // Unpack and insert media
        console.log('Inserting media…')
        if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

        const uploadEntries = new Map(
            entries
                .filter(e => e.path.startsWith('uploads/') && !e.isDir)
                .map(e => [path.basename(e.path), e.data])
        )

        // Build a map from new postId → userId for filename generation
        const userIdByNewPostId = new Map<number, number>()
        for (const p of ordered) {
            const newPostId = postIdMap.get(p.id)
            const userId = resolveUser(p.userEmail)
            if (newPostId && userId) userIdByNewPostId.set(newPostId, userId)
        }

        const apiBase = process.env.API_URL ?? 'http://localhost:3000'
        let insertedMedia = 0
        let skippedMedia = 0
        for (const m of data.media) {
            const newPostId = postIdMap.get(m.postId)
            if (!newPostId) { skippedMedia++; continue }
            const fileData = uploadEntries.get(m.filename)
            if (!fileData) {
                console.warn(`  WARNING: file ${m.filename} not in archive, media record skipped`)
                skippedMedia++
                continue
            }
            const userId = userIdByNewPostId.get(newPostId)!
            const ext = path.extname(m.filename).toLowerCase()
            const newFilename = `P-${userId}-${newPostId}-${crypto.randomBytes(4).toString('hex')}${ext}`
            const destPath = path.join(UPLOADS_DIR, newFilename)
            if (!fs.existsSync(destPath)) fs.writeFileSync(destPath, fileData)
            await prisma.media.create({
                data: {
                    filename: newFilename,
                    originalName: m.originalName,
                    url: `${apiBase}/uploads/${newFilename}`,
                    type: m.type as any,
                    mimeType: m.mimeType,
                    size: m.size,
                    duration: m.duration,
                    width: m.width,
                    height: m.height,
                    thumbnailUrl: m.thumbnailUrl,
                    isPublic: m.isPublic,
                    description: m.description,
                    tags: m.tags,
                    postId: newPostId,
                    createdAt: new Date(m.createdAt),
                    updatedAt: new Date(m.updatedAt),
                },
            })
            insertedMedia++
        }
        console.log(`  Inserted ${insertedMedia} media (${skippedMedia} skipped)`)

        // Insert identifications
        console.log('Inserting identifications…')
        let insertedIdents = 0
        let skippedIdents = 0
        for (const i of data.identifications) {
            const newPostId = postIdMap.get(i.postId)
            if (!newPostId) { skippedIdents++; continue }
            const userId = resolveUser(i.userEmail)
            if (!userId) {
                console.warn(`  Skipping identification id=${i.id}: no user and no dummy user available`)
                skippedIdents++
                continue
            }
            const specieId = i.speciesScientificName ? (speciesIdByName.get(i.speciesScientificName) ?? null) : null
            await prisma.identification.create({
                data: {
                    postId: newPostId,
                    userId,
                    specieId,
                    identificationHint: i.identificationHint,
                    description: i.description ?? undefined,
                    accepted: i.accepted,
                    score: i.score,
                    deletedAt: i.deletedAt ? new Date(i.deletedAt) : null,
                    createdAt: new Date(i.createdAt),
                    updatedAt: new Date(i.updatedAt),
                },
            })
            insertedIdents++
        }
        console.log(`  Inserted ${insertedIdents} identifications (${skippedIdents} skipped)`)

        console.log('\nRestore complete.')
        if (dummyUserId !== null) {
            console.log(`Note: records attributed to unknown users were assigned to user id=${dummyUserId} (${DUMMY_USER_EMAIL})`)
        }
    } finally {
        await prisma.$disconnect()
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
