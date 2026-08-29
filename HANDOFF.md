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

1. **Full backfill.** ~14,020 images in
   `dev-helpers/precipication-collector/images/`, ~19 min, ~19 MB stored.
   ```
   npm run precip-backfill -- dev-helpers/precipication-collector/images
   ```
   Only 7 test snapshots are loaded right now.

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
`dev-helpers/precipication-collector/images/`, ignored via `.gitignore`. Keep
them: they are what lets the grids be re-derived when the colour table improves,
without re-downloading 19 months. Roughly 620 MB/year.

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
numpy (`mycologs` has Pillow, `zmlenv` has numpy). `dev-helpers/precipication-collector/precip-fukuoka.py`
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
