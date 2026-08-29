/**
 * Ingest tenki.jp Fukuoka radar snapshots into precip_snapshots.
 *
 * Extraction and geometry live in apps/api/src/lib/precip.ts; this script is
 * the plumbing around it — fetching, decoding, and idempotent writes.
 *
 * Usage:
 *   npx ts-node scripts/precip-ingest.ts backfill <dir>        # ingest a directory of images
 *   npx ts-node scripts/precip-ingest.ts fetch [--hours N]     # download + ingest recent hours (cron)
 *   npx ts-node scripts/precip-ingest.ts query <lon> <lat> <fromISO> <toISO>
 *
 * Times are JST throughout the source: tenki.jp archives on the hour under
 * .../YYYY/MM/DD/hh/00/00/, and the caption painted into each image is the same
 * JST hour. Only minute 00 exists — 05/10/15/30 all return 404 — so hourly is
 * the archive's real resolution, not a sampling choice made here.
 */

import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import sharp from 'sharp'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

import {
    SOURCE, IMAGE_WIDTH, IMAGE_HEIGHT, GRID_W, GRID_H,
    extractGrid, encodeCells, decodeCells,
    lonLatToCell, readCell, bandRange, gridSpec, BAND_MASKED,
} from '../apps/api/src/lib/precip'

const ARCHIVE_URL = (y: number, m: number, d: number, h: number) =>
    `https://storage.tenki.jp/archive/radar/${y}/${p2(m)}/${p2(d)}/${p2(h)}/00/00/pref-43-large.jpg`

const p2 = (n: number) => String(n).padStart(2, '0')

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** JST calendar hour -> the UTC instant it denotes. */
function jstHourToUtc(y: number, m: number, d: number, h: number): Date {
    return new Date(Date.UTC(y, m - 1, d, h) - JST_OFFSET_MS)
}

/** UTC instant -> the JST calendar hour it falls in. */
function utcToJstHour(t: Date): { y: number; m: number; d: number; h: number } {
    const j = new Date(t.getTime() + JST_OFFSET_MS)
    return { y: j.getUTCFullYear(), m: j.getUTCMonth() + 1, d: j.getUTCDate(), h: j.getUTCHours() }
}

/** precip-43-YYYYMMDD-HH.jpg -> observedAt, or null if the name does not match. */
function observedAtFromFilename(name: string): Date | null {
    const m = /^precip-43-(\d{4})(\d{2})(\d{2})-(\d{2})\.jpg$/.exec(path.basename(name))
    if (!m) return null
    return jstHourToUtc(+m[1], +m[2], +m[3], +m[4])
}

// ---------------------------------------------------------------------------

/**
 * Decode to raw RGB and extract. Done one image at a time on purpose: sharp
 * decodes into libvips native memory, and this runs on a 960 MiB host where an
 * unbounded batch is what puts postgres within reach of the OOM killer.
 */
async function extractFile(file: string) {
    const buf = await fs.promises.readFile(file)
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex')

    const { data, info } = await sharp(buf)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

    if (info.width !== IMAGE_WIDTH || info.height !== IMAGE_HEIGHT) {
        throw new Error(
            `${path.basename(file)}: expected ${IMAGE_WIDTH}x${IMAGE_HEIGHT}, got ${info.width}x${info.height}. ` +
            `The grid spec is tied to that size — ingesting a different one would misplace every cell.`,
        )
    }
    if (info.channels !== 3) throw new Error(`${path.basename(file)}: expected 3 channels, got ${info.channels}`)

    return { ...extractGrid(data, info.width, info.height), sha256 }
}

/**
 * The grid row matching the current spec, created on first use. Compared on the
 * fields that would change how a stored blob is read, so a spec change forces a
 * new row instead of silently reinterpreting existing snapshots.
 */
async function ensureGrid(prisma: PrismaClient): Promise<number> {
    const spec = gridSpec()
    const existing = await prisma.precipGrid.findFirst({
        where: {
            source:    spec.source,
            lonPx:     spec.lonPx,
            lonPy:     spec.lonPy,
            lonC:      spec.lonC,
            latPx:     spec.latPx,
            latPy:     spec.latPy,
            latC:      spec.latC,
            blockSize: spec.blockSize,
            width:     spec.width,
            height:    spec.height,
        },
        orderBy: { id: 'desc' },
    })
    if (existing) return existing.id

    const created = await prisma.precipGrid.create({ data: spec as never })
    console.log(`Created precip_grids id=${created.id} (${spec.width}x${spec.height}, block ${spec.blockSize})`)
    return created.id
}

async function ingestFile(prisma: PrismaClient, gridId: number, file: string, observedAt: Date) {
    const { grid, maxBand, echoCells, sha256 } = await extractFile(file)
    const cells = await encodeCells(grid)

    await prisma.precipSnapshot.upsert({
        where:  { gridId_observedAt: { gridId, observedAt } },
        create: { gridId, observedAt, cells, maxBand, echoCells, imageSha256: sha256 },
        update: { cells, maxBand, echoCells, imageSha256: sha256, fetchedAt: new Date() },
    })

    return { maxBand, echoCells, bytes: cells.length }
}

// ---------------------------------------------------------------------------
// backfill
// ---------------------------------------------------------------------------

async function cmdBackfill(prisma: PrismaClient, dir: string) {
    const files = (await fs.promises.readdir(dir))
        .filter(f => observedAtFromFilename(f) !== null)
        .sort()

    if (files.length === 0) {
        console.error(`No precip-43-YYYYMMDD-HH.jpg files in ${dir}`)
        process.exit(1)
    }

    const gridId = await ensureGrid(prisma)
    console.log(`Ingesting ${files.length.toLocaleString()} snapshots from ${dir} ...`)

    let ok = 0, failed = 0, bytes = 0
    const t0 = Date.now()

    for (const [n, f] of files.entries()) {
        const observedAt = observedAtFromFilename(f)!
        try {
            const r = await ingestFile(prisma, gridId, path.join(dir, f), observedAt)
            ok++
            bytes += r.bytes
        } catch (err) {
            failed++
            console.warn(`  ${f}: ${(err as Error).message}`)
        }
        if ((n + 1) % 250 === 0 || n + 1 === files.length) {
            const secs = (Date.now() - t0) / 1000
            const rate = (n + 1) / secs
            const eta = (files.length - n - 1) / rate
            console.log(
                `  [${n + 1}/${files.length}] ok=${ok} failed=${failed} ` +
                `stored=${(bytes / 1e6).toFixed(1)}MB ${rate.toFixed(1)}/s eta ${Math.round(eta / 60)}m`,
            )
        }
    }

    console.log(`\nDone: ${ok} ingested, ${failed} failed, ${(bytes / 1e6).toFixed(1)} MB of grids.`)
}

// ---------------------------------------------------------------------------
// fetch (cron)
// ---------------------------------------------------------------------------

/**
 * Download and ingest any hour in the last N that is not already stored.
 *
 * Scanning a window rather than only the previous hour is what makes a missed
 * run self-healing: a reboot, a network blip or a stopped container repairs
 * itself on the next tick without anyone noticing. Upstream gaps are real — the
 * existing download log shows 20 genuine 404s in 14,040 hours — so a 404 is
 * recorded as absent and not retried forever.
 */
async function cmdFetch(prisma: PrismaClient, hours: number) {
    const gridId = await ensureGrid(prisma)

    // The current JST hour's image may not be published yet; start from the previous one.
    const now = new Date()
    const wanted: Date[] = []
    for (let k = 1; k <= hours; k++) {
        wanted.push(new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 - k * 3_600_000))
    }

    const have = new Set(
        (await prisma.precipSnapshot.findMany({
            where:  { gridId, observedAt: { in: wanted } },
            select: { observedAt: true },
        })).map(r => r.observedAt.getTime()),
    )

    const missing = wanted.filter(t => !have.has(t.getTime())).sort((a, b) => a.getTime() - b.getTime())
    if (missing.length === 0) {
        console.log(`Up to date: all ${hours} of the last hours already stored.`)
        return
    }
    console.log(`${missing.length} of the last ${hours} hours missing; fetching ...`)

    const tmpDir = await fs.promises.mkdtemp(path.join(require('os').tmpdir(), 'precip-'))
    let ok = 0, notFound = 0, failed = 0
    try {
        for (const observedAt of missing) {
            const { y, m, d, h } = utcToJstHour(observedAt)
            const url = ARCHIVE_URL(y, m, d, h)
            try {
                const resp = await fetch(url, {
                    headers: { 'User-Agent': 'mycologs-precip/1.0 (+https://www.mycologs.club)' },
                    signal:  AbortSignal.timeout(30_000),
                })
                if (resp.status === 404) {
                    notFound++
                    console.log(`  ${y}-${p2(m)}-${p2(d)} ${p2(h)}:00 JST — not published (404)`)
                    continue
                }
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

                const tmp = path.join(tmpDir, `precip-43-${y}${p2(m)}${p2(d)}-${p2(h)}.jpg`)
                await fs.promises.writeFile(tmp, Buffer.from(await resp.arrayBuffer()))
                const r = await ingestFile(prisma, gridId, tmp, observedAt)
                await fs.promises.unlink(tmp)
                ok++
                console.log(
                    `  ${y}-${p2(m)}-${p2(d)} ${p2(h)}:00 JST — maxBand=${r.maxBand} ` +
                    `echo=${r.echoCells} ${r.bytes}B`,
                )
            } catch (err) {
                failed++
                console.warn(`  ${y}-${p2(m)}-${p2(d)} ${p2(h)}:00 JST — ${(err as Error).message}`)
            }
            // Be a considerate archive client; this is someone else's bandwidth.
            await new Promise(r => setTimeout(r, 500))
        }
    } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true })
    }

    console.log(`\nFetched ${ok}, absent upstream ${notFound}, failed ${failed}.`)
    if (failed > 0) process.exitCode = 1
}

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

/**
 * Rain-rate series for one point over a time range.
 *
 * Every value is an interval, never a point estimate: the legend bands *are*
 * ranges. Summing them gives bounds on accumulation, and the total is a bound
 * too — these are instantaneous rates sampled hourly, so rain that started and
 * stopped between two snapshots is not represented at all.
 */
async function cmdQuery(prisma: PrismaClient, lon: number, lat: number, from: Date, to: Date) {
    const cell = lonLatToCell(lon, lat)
    if (!cell) {
        console.error(`(${lon}, ${lat}) falls outside the radar image.`)
        process.exit(1)
    }

    const gridId = await ensureGrid(prisma)
    const snaps = await prisma.precipSnapshot.findMany({
        where:   { gridId, observedAt: { gte: from, lte: to } },
        orderBy: { observedAt: 'asc' },
    })

    console.log(`cell (${cell.i}, ${cell.j}) — ${snaps.length} snapshots from ${from.toISOString()} to ${to.toISOString()}\n`)

    let lower = 0, upper = 0, wet = 0, masked = 0
    for (const s of snaps) {
        const band = readCell(await decodeCells(s.cells, GRID_W * GRID_H), cell)
        if (band === BAND_MASKED) { masked++; continue }
        const range = bandRange(band)
        if (!range) continue
        if (band > 0) {
            wet++
            const { y, m, d, h } = utcToJstHour(s.observedAt)
            const hi = range.upper === null ? '+' : `-${range.upper}`
            console.log(`  ${y}-${p2(m)}-${p2(d)} ${p2(h)}:00 JST  band ${band}  ${range.lower}${hi} mm/h`)
        }
        lower += range.lower
        upper += range.upper ?? range.lower
    }

    console.log(
        `\n${wet} wet hours of ${snaps.length}` +
        (masked ? `, ${masked} masked (unknown)` : '') +
        `\nAccumulation over the range: ${lower.toFixed(1)}-${upper.toFixed(1)} mm ` +
        `(hourly rate samples x 1h; a bound, not a measurement)`,
    )
}

// ---------------------------------------------------------------------------

async function main() {
    const [cmd, ...args] = process.argv.slice(2)

    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
    const prisma = new PrismaClient({ adapter })

    try {
        switch (cmd) {
            case 'backfill': {
                if (!args[0]) { console.error('Usage: precip-ingest.ts backfill <dir>'); process.exit(1) }
                await cmdBackfill(prisma, path.resolve(args[0]))
                break
            }
            case 'fetch': {
                const i = args.indexOf('--hours')
                const hours = i >= 0 ? Number(args[i + 1]) : 72
                if (!Number.isFinite(hours) || hours < 1) { console.error('--hours must be a positive number'); process.exit(1) }
                await cmdFetch(prisma, hours)
                break
            }
            case 'query': {
                const [lon, lat, from, to] = args
                if (!lon || !lat || !from || !to) {
                    console.error('Usage: precip-ingest.ts query <lon> <lat> <fromISO> <toISO>')
                    process.exit(1)
                }
                await cmdQuery(prisma, Number(lon), Number(lat), new Date(from), new Date(to))
                break
            }
            default:
                console.error('Usage: precip-ingest.ts {backfill <dir>|fetch [--hours N]|query <lon> <lat> <from> <to>}')
                process.exit(1)
        }
    } finally {
        await prisma.$disconnect()
    }
}

main().catch(err => { console.error(err); process.exit(1) })
