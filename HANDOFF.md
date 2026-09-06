# Handoff — `precip-radar`

Branch state as of 2026-08-30. This file exists only on this branch; `main` is
deliberately kept clean so a production incident can be handled from it at any
moment without this work in the way.

## Goal

Store hourly rainfall for Fukuoka so a post can be asked what rain preceded it —
input is a longitude/latitude and a time span, which is what `posts` already
carries (`longitude`, `latitude`, `taken_at`).

## What works today

The whole path runs end to end:

```
tenki.jp JPEG -> band grid -> 4-bit packed + zlib -> precip_snapshots row
                                                  -> lon/lat query -> mm/h range
```

| Piece | File |
|---|---|
| Extraction, geometry, codec | `apps/api/src/lib/precip.ts` |
| `backfill` / `fetch` / `query` commands | `scripts/precip-ingest.ts` |
| Tables | `prisma/schema.prisma` (`PrecipGrid`, `PrecipSnapshot`) |
| Migration | `prisma/migrations/20260829135014_add_precip_snapshots/` |
| npm entry points | `precip-backfill`, `precip-fetch`, `precip-query` |

Verified, not assumed:

- The 20–30 mm/h core of `precip-43-20250830-15.jpg` reads back at
  lon 130.80546, lat 33.66280 as band 9, timestamped 15:00 JST — matching the
  caption painted into the image itself.
- A point under the legend box reads **masked**, not zero.
- `fetch` downloaded and ingested three real hours from tenki.jp, and a second
  run correctly reported "up to date" (the upsert is idempotent).
- Throughput 12.3 snapshots/s, so the full archive is ~19 minutes.

Why the numbers and colour table are what they are is in the commit message —
`git log precip-radar` — not repeated here. Read it before changing any constant
in `precip.ts`; several are counter-intuitive and all were measured.

## What is left

1. ~~Full backfill~~ **done** (2026-08-30). 14,020 ingested, 0 failed, 8.7 MB —
   the whole 2025-01-01 .. 2026-08-08 archive is in the dev database. Took 83 min
   at 2.8 img/s; see the performance note below if that ever needs to be faster.

2. **Cron.** `fetch` is written for it and is self-healing — it scans the last N
   hours and fills any gap, so a missed run repairs itself. Suggested entry
   (20 past the hour, giving the archive time to publish):
   ```
   20 * * * * cd /path/to/mycologs && npm run precip-fetch -- --hours 72 >> /var/log/precip.log 2>&1
   ```
   Not installed anywhere yet.

3. **The actual product feature.** Nothing yet joins rainfall to posts. The
   `query` command is a CLI proof that the data is reachable, not an API. A
   real endpoint would take a post id and return the preceding N days of rain.

4. **Decide which database this lives in.** Currently applied to the local dev
   DB only. Nothing has touched the business server. The assumption baked into
   the migration is that it belongs in the main mycologs DB, because that is
   what makes the posts↔rainfall join one query — but that was never confirmed.

## Validated against climate, not just against itself

The extracted data reproduces Fukuoka's seasonal cycle across two independent
years without anything being tuned for it: winter months sit at 3.6-4.8% of
hours above 4 mm/h with *zero* hours above 30 mm/h, June peaks at 37.2% (2025)
and 33.6% (2026) for tsuyu, and August-September peaks at 62.4% and 57.5% for
typhoon season. 2025-08-09..11 stands out as a three-day extreme — 20 hours
above 50 mm/h on the 10th, peak band 14, 88% of the map under echo at once — and
is worth confirming against JMA records as an external check.

Beware the obvious "is it raining" query: `max_band >= 1` is true in essentially
every hour, because band 1 is trace echo and the grid spans ~180 x 130 km. Use
`max_band >= 4` (4 mm/h) or higher for anything meaning "it rained".

## Performance note

The numpy port runs at ~2.8 img/s against the TypeScript's ~12 img/s, because
classification allocates a full (519, 692, 3) float64 temporary per reference
colour -- 28 of them per image. Irrelevant for the hourly cron (0.36 s/run), and
only matters for bulk re-ingestion. The fix, if it is ever wanted, is a
precomputed RGB->band lookup table: classification is a pure function of
(r, g, b), so a 64^3 LUT built once turns the 28-colour search into a single
array index. Re-verify against the oracle if you do it.

## Gotchas

**Dev DB drift.** The local dev DB has `precip_grids`/`precip_snapshots`, which
`main` does not know about. `prisma migrate status` reports "up to date" anyway —
it only checks that folder migrations are applied, not the reverse — but
`prisma migrate dev` on `main` sees drift and offers to **reset the whole
database**. It prompts first, so it cannot happen silently. Say no.

To confirm what it would do, without doing it:
```
npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script
```

**The images are not in git.** ~980 MB in
`precipication-collector/precip-images/`, ignored via `.gitignore`. Keep
them: they are what lets the grids be re-derived when the colour table improves,
without re-downloading 19 months. Roughly 620 MB/year.

**Adding a second prefecture will silently break the first.** tenki.jp publishes
one radar map per prefecture; `pref-43` is 福岡県 and is the only one fetched so
far. The read path picks its grid with

```
apps/api/src/lib/precip-series.ts:105
const row = await fastify.prisma.precipGrid.findFirst({ orderBy: { id: 'desc' } })
```

— the *newest* row, unconditionally, cached for the life of the process. That is
correct while Fukuoka is the only grid. Ingest a second prefecture and its row
becomes the newest, so every post is resolved against it, Fukuoka coordinates
fall outside it, `lonLatToCell` returns null, and the panels go empty with no
error logged anywhere. Existing posts appear to lose their rainfall.

Everything else is already multi-grid: every function in `precip.ts` takes a
`spec` rather than assuming one, `ensure_grid` matches on all geometry fields so
a new prefecture becomes a new row instead of overwriting the old, and
`precip_snapshots.grid_id` exists. It is only the selection that is singular.

Before prefecture #2: select the grid that *contains* the lon/lat rather than the
newest, key the cache per grid, and parameterize the Python side — `SOURCE`,
`AFFINE`, `IMAGE_WIDTH`/`IMAGE_HEIGHT` in `precip_extract.py`, the hardcoded
`precip-43-` in `FILENAME_RE`, and `BASE_URL` are all single-prefecture module
constants today. Each map needs its own affine calibration; they are not
interchangeable.

**Values are intervals, never point estimates.** tenki.jp's legend labels sit on
band *boundaries*, so yellow means 15–20 mm/h, not 15. Every answer is a lower
and upper bound. Do not collapse a band to a single number.

**This is rain rate, not accumulation.** Snapshots are instantaneous mm/h sampled
once an hour. Summing them (rate × 1 h) bounds accumulation but cannot see rain
that started and stopped between two snapshots. Fine for fruiting correlation;
say "between X and Y mm", never "X mm fell".

**The archive is hourly only.** Minute 00 returns 200; 05/10/15/30 all 404.
24 snapshots/day is the ceiling, not a sampling choice.

**The Python prototype does not run here.** No conda env has both Pillow and
numpy (`mycologs` has Pillow, `zmlenv` has numpy). `precipication-collector/precip-fukuoka.py`
is kept for reference only — its colour table is wrong in four separate ways
(see the commit message). The TypeScript path replaces it; the downloader
`download-precip-fukuoka.py` is fine and still useful for bulk fetching.

## Resuming

```
git checkout precip-radar
npm run prisma:gen          # regenerate the client with the precip models
npm run precip-query -- 130.80546 33.66280 2025-08-30T00:00:00Z 2025-08-31T00:00:00Z
```

If the dev DB was reset or cleaned in the meantime, re-apply the migration first
(`npm run do-migrate`) and re-run the backfill.
