/**
 * Read side of the Python/TypeScript conformance check.
 *
 * Reads {"snapshotIds": [...], "points": [[lon, lat], ...]} on stdin and writes
 * one JSON record per (snapshot, point) to the file named in argv[2].
 *
 * A file rather than stdout because stdout is not clean: dotenv prints a banner
 * that begins with '[', which is indistinguishable from the start of a JSON
 * array to anything scanning for one. The Python driver
 * (precipication-collector/verify_conformance.py) computes the same
 * records independently and compares them exactly.
 *
 * The point is not that this code is correct — it is that it agrees. Extraction
 * lives only in precip_extract.py, but *interpretation* is duplicated: both
 * languages inflate the blob, unpack 4 bits per cell, map lon/lat through the
 * affine, and look up a band's mm/h interval. Duplicated logic drifts, and this
 * drift would be silent: the same stored bytes would simply mean different rain
 * depending on which language read them. Run this after touching either side.
 */

import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
    gridSpecFromRow, decodeCells, lonLatToCell, readCell, bandRange, cellToLonLat,
} from '../apps/api/src/lib/precip'

interface Input {
    snapshotIds: number[]
    points: [number, number][]
}

async function main() {
    const raw = await new Promise<string>((resolve, reject) => {
        let buf = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', c => { buf += c })
        process.stdin.on('end', () => resolve(buf))
        process.stdin.on('error', reject)
    })
    const input = JSON.parse(raw) as Input

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    })

    try {
        const gridRow = await prisma.precipGrid.findFirst({ orderBy: { id: 'desc' } })
        if (!gridRow) throw new Error('no precip_grids row')
        const spec = gridSpecFromRow(gridRow)

        const snaps = await prisma.precipSnapshot.findMany({
            where: { id: { in: input.snapshotIds } },
            orderBy: { id: 'asc' },
        })

        const out: unknown[] = []
        for (const snap of snaps) {
            const grid = await decodeCells(snap.cells, spec)
            for (const [lon, lat] of input.points) {
                const cell = lonLatToCell(spec, lon, lat)
                if (cell === null) {
                    out.push({ id: snap.id, lon, lat, cell: null, band: null, lower: null, upper: null })
                    continue
                }
                const band = readCell(spec, grid, cell)
                const range = bandRange(spec, band)
                const centre = cellToLonLat(spec, cell.i, cell.j)
                out.push({
                    id:    snap.id,
                    lon, lat,
                    cell:  [cell.i, cell.j],
                    // rounded: the two languages must agree on the cell, not on
                    // float formatting of its centre
                    centre: [Number(centre.lon.toFixed(6)), Number(centre.lat.toFixed(6))],
                    band,
                    lower: range === null ? null : range.lower,
                    upper: range === null ? null : range.upper,
                })
            }
        }
        const outPath = process.argv[2]
        if (!outPath) throw new Error('usage: precip-conformance-reader.ts <output.json>')
        fs.writeFileSync(outPath, JSON.stringify(out))
    } finally {
        await prisma.$disconnect()
    }
}

main().catch(err => { console.error(err); process.exit(1) })
