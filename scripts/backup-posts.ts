/**
 * Export posts, followups, media, and identifications to a portable archive.
 * Votes are intentionally excluded — they are only meaningful for trusted users
 * in the target system and cannot be portably transferred.
 *
 * Internal references (Post.id, Identification.id) are kept as numeric IDs.
 * External references are resolved to stable names:
 *   Post.userId           → User.email
 *   Identification.userId → User.email
 *   Identification.specieId → Species.scientificName
 * Post.eventId is intentionally omitted.
 *
 * Output: ./backups/posts-backup-<timestamp>.tar.gz
 *   data.json   — serialised records
 *   uploads/    — media files (missing files are warned, not fatal)
 *
 * Usage:
 *   npm run backup-posts                      # all posts
 *   npm run backup-posts -- 1-9,12,18         # posts by user IDs 1–9, 12, 18
 */

import path from 'path'
import fs from 'fs'
import { PassThrough } from 'stream'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { once } from 'events'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const UPLOADS_DIR = path.resolve(__dirname, '../data/uploads')
const BACKUPS_DIR = path.resolve(__dirname, '../backups')

// ---------------------------------------------------------------------------
// Minimal tar writer (POSIX ustar, no external deps)
// ---------------------------------------------------------------------------

function tarHeader(filePath: string, size: number, isDir = false): Buffer {
    const buf = Buffer.alloc(512)
    const name = filePath.slice(0, 100)
    buf.write(name, 0, 'utf8')
    buf.write((isDir ? '0000755' : '0000644').padStart(7, '0') + '\0', 100, 'utf8')
    buf.write('0000000\0', 108, 'utf8') // uid
    buf.write('0000000\0', 116, 'utf8') // gid
    buf.write(size.toString(8).padStart(11, '0') + '\0', 124, 'utf8')
    const mtime = Math.floor(Date.now() / 1000)
    buf.write(mtime.toString(8).padStart(11, '0') + '\0', 136, 'utf8')
    buf.write(isDir ? '5' : '0', 156, 'utf8') // type flag
    buf.write('ustar\0', 257, 'utf8')
    buf.write('00', 263, 'utf8')
    // checksum
    buf.write('        ', 148, 'utf8')
    let sum = 0
    for (let i = 0; i < 512; i++) sum += buf[i]
    buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf8')
    return buf
}

class TarStream {
    readonly stream = new PassThrough()

    writeFile(archivePath: string, content: Buffer): void {
        this.stream.write(tarHeader(archivePath, content.length))
        this.stream.write(content)
        const pad = (512 - (content.length % 512)) % 512
        if (pad > 0) this.stream.write(Buffer.alloc(pad))
    }

    writeDir(archivePath: string): void {
        this.stream.write(tarHeader(archivePath.replace(/\/?$/, '/'), 0, true))
    }

    async writeFileFromDisk(archivePath: string, srcPath: string): Promise<void> {
        const size = fs.statSync(srcPath).size
        this.stream.write(tarHeader(archivePath, size))
        // Copied by hand rather than with pipeline(): pipeline(src, dest, { end: false })
        // leaves a 'close' listener on dest per call, which piles up over thousands of
        // media files and trips MaxListenersExceededWarning.
        for await (const chunk of fs.createReadStream(srcPath)) {
            if (!this.stream.write(chunk)) await once(this.stream, 'drain')
        }
        const pad = (512 - (size % 512)) % 512
        if (pad > 0) this.stream.write(Buffer.alloc(pad))
    }

    end(): void {
        this.stream.write(Buffer.alloc(1024)) // end-of-archive
        this.stream.end()
    }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseUserIdFilter(arg: string): number[] {
    const ids = new Set<number>()
    for (const part of arg.split(',')) {
        const range = part.trim().match(/^(\d+)-(\d+)$/)
        if (range) {
            const lo = parseInt(range[1]), hi = parseInt(range[2])
            if (lo > hi) throw new Error(`Invalid range: ${part}`)
            for (let i = lo; i <= hi; i++) ids.add(i)
        } else {
            const n = parseInt(part.trim())
            if (isNaN(n)) throw new Error(`Invalid user ID: ${part}`)
            ids.add(n)
        }
    }
    return [...ids].sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const filterArg = process.argv[2]
    let userIdFilter: number[] | null = null
    if (filterArg) {
        try {
            userIdFilter = parseUserIdFilter(filterArg)
        } catch (err: any) {
            console.error(`Invalid user ID filter: ${err.message}`)
            console.error('Usage: npm run backup-posts -- [1-9,12,18]')
            process.exit(1)
        }
        console.log(`Filtering by user IDs: ${userIdFilter.join(', ')}`)
    }

    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
    const prisma = new PrismaClient({ adapter })

    try {
        console.log('Reading database…')

        const postWhere = userIdFilter ? { userId: { in: userIdFilter } } : {}
        const posts = await prisma.post.findMany({ where: postWhere, orderBy: { id: 'asc' } })

        const postIds = posts.map(p => p.id)
        const [media, identifications] = await Promise.all([
            prisma.media.findMany({ where: { deletedAt: null, postId: { in: postIds } }, orderBy: { createdAt: 'asc' } }),
            prisma.identification.findMany({ where: { postId: { in: postIds } }, orderBy: { id: 'asc' } }),
        ])

        // Resolve user IDs → email
        const userIds = new Set<number>([
            ...posts.map(p => p.userId),
            ...identifications.map(i => i.userId),
        ])
        const users = await prisma.user.findMany({
            where: { id: { in: [...userIds] } },
            select: { id: true, email: true },
        })
        const userEmailById = new Map(users.map(u => [u.id, u.email]))

        // Resolve species IDs → scientificName
        const speciesIds = identifications
            .map(i => i.specieId)
            .filter((id): id is number => id !== null)
        const speciesList = await prisma.species.findMany({
            where: { id: { in: speciesIds } },
            select: { id: true, scientificName: true },
        })
        const speciesNameById = new Map(speciesList.map(s => [s.id, s.scientificName]))

        const postIdSet = new Set(posts.map(p => p.id))

        // Build JSON payload
        const data = {
            version: 1,
            exportedAt: new Date().toISOString(),
            posts: posts.map(p => ({
                id: p.id,
                userEmail: userEmailById.get(p.userId) ?? null,
                // Null out parentPostId if the parent is not included in this backup
                parentPostId: p.parentPostId && postIdSet.has(p.parentPostId) ? p.parentPostId : null,
                contents: p.contents,
                deletedAt: p.deletedAt,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
            })),
            media: media.map(m => ({
                id: m.id,
                postId: m.postId,
                filename: m.filename,
                originalName: m.originalName,
                type: m.type,
                mimeType: m.mimeType,
                size: m.size,
                duration: m.duration,
                width: m.width,
                height: m.height,
                thumbnailUrl: m.thumbnailUrl,
                isPublic: m.isPublic,
                description: m.description,
                tags: m.tags,
                createdAt: m.createdAt,
                updatedAt: m.updatedAt,
            })),
            identifications: identifications.map(i => ({
                id: i.id,
                postId: i.postId,
                userEmail: userEmailById.get(i.userId) ?? null,
                speciesScientificName: i.specieId ? (speciesNameById.get(i.specieId) ?? null) : null,
                identificationHint: i.identificationHint,
                description: i.description,
                accepted: i.accepted,
                score: i.score,
                deletedAt: i.deletedAt,
                createdAt: i.createdAt,
                updatedAt: i.updatedAt,
            })),
        }

        console.log(
            `Exporting: ${data.posts.length} posts, ${data.media.length} media, ` +
            `${data.identifications.length} identifications`
        )

        if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true })

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const outPath = path.join(BACKUPS_DIR, `posts-backup-${timestamp}.tar.gz`)

        const tar = new TarStream()
        const dest = fs.createWriteStream(outPath)
        const pipelinePromise = pipeline(tar.stream, createGzip(), dest)

        tar.writeFile('data.json', Buffer.from(JSON.stringify(data, null, 2), 'utf8'))
        tar.writeDir('uploads')

        let missingFiles = 0
        for (const m of data.media) {
            const srcPath = path.join(UPLOADS_DIR, m.filename)
            if (!fs.existsSync(srcPath)) {
                console.warn(`  WARNING: missing file ${m.filename}`)
                missingFiles++
                continue
            }
            await tar.writeFileFromDisk(`uploads/${m.filename}`, srcPath)
        }

        tar.end()
        await pipelinePromise

        const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2)
        console.log(`\nBackup written to: ${outPath} (${sizeMb} MB)`)
        if (missingFiles > 0) console.warn(`${missingFiles} media file(s) were missing and skipped.`)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
