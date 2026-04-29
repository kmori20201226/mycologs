/**
 * Seed initial data into the database.
 *
 * Seeds:
 *   1. roles  — fixed set of RoleType values
 *   2. shapes, families, genera, species — taxonomy from prisma/seed/csv/
 *
 * Usage:
 *   npm run seed
 *
 * Safe to re-run: uses upsert so existing rows are not duplicated.
 */

import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import fs from 'fs'
import readline from 'readline'
import { PrismaClient, RoleType, Edibility } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const CSV_DIR = path.resolve(__dirname, '../prisma/seed/taxonomy')

async function parseCsv(file: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = []
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(CSV_DIR, file)),
    crlfDelay: Infinity,
  })
  let headers: string[] = []
  for await (const line of rl) {
    const cols = parseCsvLine(line)
    if (headers.length === 0) { headers = cols; continue }
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cols[i] ?? '' })
    rows.push(row)
  }
  return rows
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else { inQuotes = !inQuotes }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

async function seedRoles() {
  console.log('Seeding roles...')
  for (const name of Object.values(RoleType)) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } })
  }
  console.log(`  ${Object.values(RoleType).length} roles done`)
}

async function seedShapes() {
  console.log('Seeding shapes...')
  const rows = await parseCsv('shapes.csv')
  for (const r of rows) {
    await prisma.shape.upsert({
      where: { id: Number(r.id) },
      update: { name: r.name, japaneseName: r.japanese_name || null },
      create: { id: Number(r.id), name: r.name, japaneseName: r.japanese_name || null },
    })
  }
  console.log(`  ${rows.length} shapes done`)
}

async function seedFamilies() {
  console.log('Seeding families...')
  const rows = await parseCsv('families.csv')
  for (const r of rows) {
    await prisma.family.upsert({
      where: { id: Number(r.id) },
      update: { scientificName: r.scientific_name, japaneseName: r.japanese_name || null, shapeId: Number(r.shape_id) },
      create: { id: Number(r.id), scientificName: r.scientific_name, japaneseName: r.japanese_name || null, shapeId: Number(r.shape_id) },
    })
  }
  console.log(`  ${rows.length} families done`)
}

async function seedGenera() {
  console.log('Seeding genera...')
  const rows = await parseCsv('genera.csv')
  for (const r of rows) {
    await prisma.genus.upsert({
      where: { id: Number(r.id) },
      update: { scientificName: r.scientific_name, japaneseName: r.japanese_name || null, familyId: Number(r.family_id) },
      create: { id: Number(r.id), scientificName: r.scientific_name, japaneseName: r.japanese_name || null, familyId: Number(r.family_id) },
    })
  }
  console.log(`  ${rows.length} genera done`)
}

async function seedSpecies() {
  console.log('Seeding species...')
  const rows = await parseCsv('species.csv')
  for (const r of rows) {
    const edibility = r.edibility ? (r.edibility as Edibility) : null
    await prisma.species.upsert({
      where: { id: Number(r.id) },
      update: {
        scientificName: r.scientific_name,
        japaneseName: r.japanese_name || null,
        genusId: Number(r.genus_id),
        gbifTaxonKey: r.gbif_taxon_key ? Number(r.gbif_taxon_key) : null,
        edibility,
      },
      create: {
        id: Number(r.id),
        scientificName: r.scientific_name,
        japaneseName: r.japanese_name || null,
        genusId: Number(r.genus_id),
        gbifTaxonKey: r.gbif_taxon_key ? Number(r.gbif_taxon_key) : null,
        edibility,
      },
    })
  }
  console.log(`  ${rows.length} species done`)
}

async function main() {
  await seedRoles()
  await seedShapes()
  await seedFamilies()
  await seedGenera()
  await seedSpecies()
  console.log('Seed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
