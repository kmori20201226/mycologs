/**
 * Import taxonomy (Family / Genus / Species) from gbif.taxon into the
 * mycologs Shape / Family / Genus / Species tables.
 *
 * Usage:
 *   npx ts-node scripts/import-gbif-taxonomy.ts [--dry-run] [--min-occurrences N]
 *
 * Options:
 *   --dry-run           Print counts without writing to the DB
 *   --min-occurrences N Only import species with occurrence_score >= N (default 0)
 *
 * Families without a 'shape' assignment in gbif.taxon are placed under a
 * placeholder shape called "Unclassified".  You can re-assign them later
 * via the admin taxonomy page.
 */

import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient, Edibility } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
// Use require to avoid @types/pg version conflict with @prisma/adapter-pg
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require('pg') as typeof import('pg')

// ── Parse CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const minOccIdx = args.indexOf('--min-occurrences')
const MIN_OCCURRENCES = minOccIdx >= 0 ? parseInt(args[minOccIdx + 1] ?? '0', 10) : 0

// ── Prisma client (adapter-pg pattern used by this project) ──────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ── Edibility mapping ─────────────────────────────────────────────────────────

const EDIBILITY_MAP: Record<string, Edibility> = {
    edible:   'EDIBLE',
    inedible: 'INEDIBLE',
    toxic:    'TOXIC',
    deadly:   'DEADLY',
    unknown:  'UNKNOWN',
    EDIBLE:   'EDIBLE',
    INEDIBLE: 'INEDIBLE',
    TOXIC:    'TOXIC',
    DEADLY:   'DEADLY',
    UNKNOWN:  'UNKNOWN',
}

function mapEdibility(raw: string | null): Edibility | null {
    if (!raw) return null
    return EDIBILITY_MAP[raw.trim()] ?? null
}

// ── Counters ──────────────────────────────────────────────────────────────────

let shapesUpserted   = 0
let familiesUpserted = 0
let generaUpserted   = 0
let speciesUpserted  = 0
let speciesSkipped   = 0

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`Starting GBIF taxonomy import${DRY_RUN ? ' (DRY RUN)' : ''}`)
    console.log(`  min-occurrences filter: ${MIN_OCCURRENCES}`)

    // Use a direct pg client for reading from gbif schema
    const client = new Client({ connectionString: process.env.DATABASE_URL! })
    await client.connect()

    try {
        // ── 1. Load gbif data ────────────────────────────────────────────────

        const { rows } = await client.query<{
            shape:         string | null
            shape_ja:      string | null
            family:        string | null
            family_ja:     string | null
            genus:         string | null
            genus_ja:      string | null
            species:       string | null
            japanese_name: string | null
            edibility:     string | null
            species_key:   number | null
        }>(`
            SELECT DISTINCT
                shape,
                shape_ja,
                family,
                family_ja,
                genus,
                genus_ja,
                species,
                japanese_name,
                edibility,
                species_key
            FROM gbif.taxon
            WHERE
                family  IS NOT NULL
                AND genus   IS NOT NULL
                AND species IS NOT NULL
                AND occurrence_score >= $1
            ORDER BY family, genus, species
        `, [MIN_OCCURRENCES])

        console.log(`  GBIF rows to process: ${rows.length.toLocaleString()}`)

        if (DRY_RUN) {
            // Count uniques and report
            const shapes   = new Set(rows.map(r => r.shape ?? 'Unclassified'))
            const families = new Set(rows.map(r => r.family!))
            const genera   = new Set(rows.map(r => `${r.family}|${r.genus}`))
            const species  = new Set(rows.map(r => r.species!))
            console.log('\n  DRY RUN summary:')
            console.log(`    Shapes   : ${shapes.size}`)
            console.log(`    Families : ${families.size}`)
            console.log(`    Genera   : ${genera.size}`)
            console.log(`    Species  : ${species.size}`)
            return
        }

        // ── 2. Collect unique shapes ─────────────────────────────────────────

        const shapeMap = new Map<string, { ja: string | null }>()
        for (const row of rows) {
            const shapeName = row.shape?.trim() || 'Unclassified'
            if (!shapeMap.has(shapeName)) {
                shapeMap.set(shapeName, { ja: row.shape_ja?.trim() || null })
            }
        }

        // ── 3. Upsert shapes → build shapeId map ────────────────────────────

        const shapeIdMap = new Map<string, number>()   // shapeName → id

        for (const [name, { ja }] of shapeMap) {
            const shape = await prisma.shape.upsert({
                where:  { name },
                create: { name, japaneseName: ja },
                update: { japaneseName: ja ?? undefined },
            })
            shapeIdMap.set(name, shape.id)
            shapesUpserted++
        }
        console.log(`  Shapes upserted   : ${shapesUpserted}`)

        // ── 4. Collect unique families ───────────────────────────────────────

        const familyMap = new Map<string, { ja: string | null; shapeName: string }>()
        for (const row of rows) {
            const fam = row.family!.trim()
            if (!familyMap.has(fam)) {
                familyMap.set(fam, {
                    ja:        row.family_ja?.trim() || null,
                    shapeName: row.shape?.trim() || 'Unclassified',
                })
            }
        }

        // ── 5. Upsert families → build familyId map ──────────────────────────

        const familyIdMap = new Map<string, number>()  // scientificName → id

        for (const [scientificName, { ja, shapeName }] of familyMap) {
            const shapeId = shapeIdMap.get(shapeName)!
            const family = await prisma.family.upsert({
                where:  { scientificName },
                create: { scientificName, japaneseName: ja, shapeId },
                // Don't overwrite shapeId if admin already re-assigned it
                update: { japaneseName: ja ?? undefined },
            })
            familyIdMap.set(scientificName, family.id)
            familiesUpserted++
        }
        console.log(`  Families upserted : ${familiesUpserted}`)

        // ── 6. Collect unique genera ──────────────────────────────────────────

        const genusMap = new Map<string, { ja: string | null; family: string }>()
        for (const row of rows) {
            const gen = row.genus!.trim()
            if (!genusMap.has(gen)) {
                genusMap.set(gen, {
                    ja:     row.genus_ja?.trim() || null,
                    family: row.family!.trim(),
                })
            }
        }

        // ── 7. Upsert genera → build genusId map ─────────────────────────────

        const genusIdMap = new Map<string, number>()   // scientificName → id

        for (const [scientificName, { ja, family }] of genusMap) {
            const familyId = familyIdMap.get(family)
            if (!familyId) {
                console.warn(`  WARN: family not found for genus ${scientificName} (family=${family}) — skipping`)
                continue
            }
            const genus = await prisma.genus.upsert({
                where:  { scientificName },
                create: { scientificName, japaneseName: ja, familyId },
                update: { japaneseName: ja ?? undefined },
            })
            genusIdMap.set(scientificName, genus.id)
            generaUpserted++
        }
        console.log(`  Genera upserted   : ${generaUpserted}`)

        // ── 8. Upsert species ────────────────────────────────────────────────

        // Batch in groups of 500 to avoid memory pressure
        const BATCH = 500
        for (let i = 0; i < rows.length; i += BATCH) {
            const batch = rows.slice(i, i + BATCH)
            for (const row of batch) {
                const scientificName = row.species!.trim()
                const genusId = genusIdMap.get(row.genus!.trim())
                if (!genusId) {
                    speciesSkipped++
                    continue
                }

                const data = {
                    scientificName,
                    japaneseName: row.japanese_name?.trim() || null,
                    gbifTaxonKey: row.species_key ?? null,
                    edibility:    mapEdibility(row.edibility),
                    genusId,
                    deletedAt:    null as Date | null,
                }

                await prisma.species.upsert({
                    where:  { scientificName },
                    create: data,
                    update: {
                        japaneseName: data.japaneseName ?? undefined,
                        gbifTaxonKey: data.gbifTaxonKey ?? undefined,
                        edibility:    data.edibility ?? undefined,
                        deletedAt:    null,   // restore if soft-deleted
                    },
                })
                speciesUpserted++
            }
            if (i % 5000 === 0 && i > 0) {
                console.log(`    species progress: ${i.toLocaleString()} / ${rows.length.toLocaleString()}`)
            }
        }
        console.log(`  Species upserted  : ${speciesUpserted}`)
        if (speciesSkipped > 0) {
            console.log(`  Species skipped   : ${speciesSkipped} (genus not found)`)
        }

    } finally {
        await client.end()
    }

    console.log('\nDone.')
}

main()
    .catch((err) => { console.error(err); process.exit(1) })
    .finally(() => prisma.$disconnect())
