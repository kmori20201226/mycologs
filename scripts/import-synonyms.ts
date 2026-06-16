/**
 * Import Japanese name synonyms from the `gbif extract-synonyms` CSV into the
 * mycologs `species_aliases` table, so a vernacular name mentioned in a post
 * can be resolved back to its canonical species.
 *
 * Usage:
 *   npx ts-node scripts/import-synonyms.ts <synonyms.csv> [--dry-run] [--no-wipe]
 *
 * The committed dataset lives at prisma/seed/synonyms.csv:
 *   npx ts-node scripts/import-synonyms.ts prisma/seed/synonyms.csv
 *
 * CSV columns (from synonym_extractor.py):
 *   taxon_key, species_key, occurrence_score, scientific_name, source, name
 *   (occurrence_score is optional — older CSVs without it score every row 0.)
 *
 * Behaviour:
 *   - Sources inat, db, wikipedia, gbif are ingested (katumoto is already
 *     represented by the `db` row). iNaturalist is preferred, gbif last.
 *   - Each CSV row is joined to a mycologs species via
 *       species_key = species.gbif_taxon_key
 *     which collapses synonym usages onto the accepted species.
 *   - `species_aliases.name` is globally unique, so when one name points at
 *     several species the winner is chosen by source priority
 *       db > wikipedia > inat
 *     breaking ties by the species' gbif occurrence_score (then lower id).
 *   - Names shorter than MIN_NAME_LEN chars are dropped (matches the runtime
 *     matcher in extractMentionedSpecies).
 *   - By default the table is rebuilt (existing rows deleted) since it is
 *     derived data; pass --no-wipe to upsert on top of existing rows instead.
 */

import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
// Use require to avoid @types/pg version conflict with @prisma/adapter-pg
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require('pg') as typeof import('pg')

// ── Config ──────────────────────────────────────────────────────────────────

const ALLOWED_SOURCES = new Set(['inat', 'db', 'wikipedia', 'gbif'])
// iNaturalist common names are the highest-quality vernacular source; db is the
// curated stored name; gbif vernacularNames are broadest but noisiest, so they
// only win a name no better source claims.
const SOURCE_PRIORITY: Record<string, number> = { inat: 4, db: 3, wikipedia: 2, gbif: 1 }
const MIN_NAME_LEN = 2
const INSERT_BATCH = 1000

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const NO_WIPE = args.includes('--no-wipe')
const inputArg = args.find((a) => !a.startsWith('--'))
if (!inputArg) {
    console.error('Usage: ts-node scripts/import-synonyms.ts <synonyms.csv> [--dry-run] [--no-wipe]')
    process.exit(1)
}
const INPUT_PATH = path.resolve(inputArg)

// ── Quote-aware CSV parser (RFC-4180 subset matching Python csv.writer) ──────

function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let field = ''
    let row: string[] = []
    let inQuotes = false
    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++ }  // escaped quote
                else inQuotes = false
            } else {
                field += c
            }
        } else if (c === '"') {
            inQuotes = true
        } else if (c === ',') {
            row.push(field); field = ''
        } else if (c === '\n') {
            row.push(field); field = ''
            rows.push(row); row = []
        } else if (c === '\r') {
            // ignore; \n handles the row break
        } else {
            field += c
        }
    }
    // trailing field/row (file may not end in newline)
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
    return rows
}

// ── Prisma ──────────────────────────────────────────────────────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ── Winner type ──────────────────────────────────────────────────────────────

type Winner = { speciesId: number; source: string; priority: number; score: number }

/** True when `cand` should replace `cur` for the same name. */
function isBetter(cand: Winner, cur: Winner): boolean {
    if (cand.priority !== cur.priority) return cand.priority > cur.priority
    if (cand.score !== cur.score) return cand.score > cur.score
    return cand.speciesId < cur.speciesId  // deterministic tie-break
}

async function main() {
    if (!fs.existsSync(INPUT_PATH)) {
        console.error(`Input CSV not found: ${INPUT_PATH}`)
        process.exit(1)
    }
    console.log(`Importing synonyms from ${INPUT_PATH}${DRY_RUN ? ' (DRY RUN)' : ''}`)

    const client = new Client({ connectionString: process.env.DATABASE_URL! })
    await client.connect()

    try {
        // ── 1. species_key -> species.id ─────────────────────────────────────
        const speciesRes = await client.query<{ id: number; gbif_taxon_key: number }>(`
            SELECT id, gbif_taxon_key
            FROM species
            WHERE gbif_taxon_key IS NOT NULL AND deleted_at IS NULL
        `)
        const speciesByKey = new Map<number, number>()
        for (const r of speciesRes.rows) speciesByKey.set(r.gbif_taxon_key, r.id)
        console.log(`  species with gbif_taxon_key: ${speciesByKey.size.toLocaleString()}`)

        // ── 2. Parse CSV and resolve a single winner per name ────────────────
        // The occurrence_score tie-breaker is read from the CSV itself, so this
        // importer never touches the (temporary, dev-only) gbif schema.
        const text = fs.readFileSync(INPUT_PATH, 'utf-8')
        const records = parseCsv(text)
        if (records.length === 0) { console.log('  empty CSV — nothing to do'); return }

        // Map header -> column index (tolerate column reordering)
        const header = records[0]!.map((h) => h.trim())
        const col = (name: string) => {
            const idx = header.indexOf(name)
            if (idx < 0) throw new Error(`CSV missing required column "${name}" (have: ${header.join(', ')})`)
            return idx
        }
        const cSpeciesKey = col('species_key')
        const cSource = col('source')
        const cName = col('name')
        const cScore = header.indexOf('occurrence_score')  // optional

        const winners = new Map<string, Winner>()
        let total = 0, skippedSource = 0, skippedShort = 0, skippedNoSpecies = 0
        const conflicted = new Set<string>()

        for (let i = 1; i < records.length; i++) {
            const rec = records[i]!
            if (rec.length <= cName) continue  // blank/short line
            total++

            const source = rec[cSource]!.trim()
            if (!ALLOWED_SOURCES.has(source)) { skippedSource++; continue }

            const name = rec[cName]!.trim()
            if (name.length < MIN_NAME_LEN) { skippedShort++; continue }

            const speciesKey = Number(rec[cSpeciesKey])
            const speciesId = speciesByKey.get(speciesKey)
            if (speciesId === undefined) { skippedNoSpecies++; continue }

            const cand: Winner = {
                speciesId,
                source,
                priority: SOURCE_PRIORITY[source] ?? 0,
                score: cScore >= 0 ? (Number(rec[cScore]) || 0) : 0,
            }

            const cur = winners.get(name)
            if (!cur) {
                winners.set(name, cand)
            } else {
                if (cur.speciesId !== cand.speciesId) conflicted.add(name)
                if (isBetter(cand, cur)) winners.set(name, cand)
            }
        }

        console.log(`  CSV rows                : ${total.toLocaleString()}`)
        console.log(`  skipped (source!=allowed): ${skippedSource.toLocaleString()}`)
        console.log(`  skipped (name <${MIN_NAME_LEN} chars) : ${skippedShort.toLocaleString()}`)
        console.log(`  skipped (no species)    : ${skippedNoSpecies.toLocaleString()}`)
        console.log(`  unique alias names      : ${winners.size.toLocaleString()}`)
        console.log(`  ambiguous names resolved: ${conflicted.size.toLocaleString()}`)

        if (DRY_RUN) {
            console.log('\n  DRY RUN — no rows written.')
            return
        }

        // ── 4. Write to species_aliases ──────────────────────────────────────
        if (!NO_WIPE) {
            const del = await prisma.speciesAlias.deleteMany({})
            console.log(`  wiped existing aliases  : ${del.count.toLocaleString()}`)
        }

        const rowsToInsert = [...winners.entries()].map(([name, w]) => ({
            name, speciesId: w.speciesId, source: w.source,
        }))

        let inserted = 0
        if (NO_WIPE) {
            // Upsert on top of existing rows (name is unique).
            for (const r of rowsToInsert) {
                await prisma.speciesAlias.upsert({
                    where: { name: r.name },
                    create: r,
                    update: { speciesId: r.speciesId, source: r.source },
                })
                inserted++
                if (inserted % 5000 === 0) console.log(`    upserted ${inserted.toLocaleString()} / ${rowsToInsert.length.toLocaleString()}`)
            }
        } else {
            // Fast bulk insert into the freshly-wiped table.
            for (let i = 0; i < rowsToInsert.length; i += INSERT_BATCH) {
                const batch = rowsToInsert.slice(i, i + INSERT_BATCH)
                const res = await prisma.speciesAlias.createMany({ data: batch, skipDuplicates: true })
                inserted += res.count
            }
        }
        console.log(`  aliases written         : ${inserted.toLocaleString()}`)
    } finally {
        await client.end()
    }

    console.log('\nDone.')
}

main()
    .catch((err) => { console.error(err); process.exit(1) })
    .finally(() => prisma.$disconnect())
