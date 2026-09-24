# Handoff — precipitation

Merged into `main` on 2026-09-06, from the `precip-radar` / `precip-event-graph`
branches. The branch-era framing that used to open this file — "this exists only
on this branch, main is kept clean" — no longer applies; so does the dev-DB drift
warning that went with it, since main's schema now matches the database.

## Goal

Store hourly rainfall so a post can be asked what rain preceded it — input is a
longitude/latitude and a time span, which is what `posts` already carries
(`longitude`, `latitude`, `taken_at`). 福岡 (pref-43) and 大分 (pref-47) are
ingested; see the prefecture note under Gotchas before adding a third.

## What works today

The whole path runs end to end:

```
tenki.jp JPEG -> band grid -> 4-bit packed + zlib -> precip_snapshots row
                                                  -> lon/lat query -> mm/h range
```

| Piece | File |
|---|---|
| Extraction, geometry, codec (the source of truth) | `precipication-collector/precip_extract.py` |
| Per-prefecture maps and affines | `precip_extract.PREFECTURES` |
| `backfill` / `one` / `fetch` / `status` commands | `precipication-collector/precip_fill.py` |
| Hourly cron, one pass per prefecture | `precipication-collector/precip-cron.sh` |
| Affine calibration | `precipication-collector/calibration/` |
| Reading it back (interpretation only) | `apps/api/src/lib/precip.ts`, `precip-series.ts` |
| Tables | `prisma/schema.prisma` (`PrecipGrid`, `PrecipSnapshot`) |
| Migration | `prisma/migrations/20260829135014_add_precip_snapshots/` |

`scripts/precip-ingest.ts` and the `precip-backfill` / `precip-fetch` /
`precip-query` npm entry points this table used to list are gone; ingestion is
the Python collector's job and `precip.ts` only reads stored rows.

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

**~~Dev DB drift~~ — resolved by the merge.** The precip tables used to exist in
the dev database but not on `main`, so `prisma migrate dev` there offered to
reset everything. The merge moved main's schema to match; `prisma migrate diff`
returns an empty migration. To confirm before trusting it:
```
npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script
```

**The tables still exist only on the dev database.** Nothing has been applied to
the business server, and which database this belongs in was never decided. The
migration itself is purely additive, so applying it cannot disturb the running
version; the risk there is the collector's disk, not the schema.

**The images are not in git.** ~980 MB in
`precipication-collector/precip-images/`, ignored via `.gitignore`. Keep
them: they are what lets the grids be re-derived when the colour table improves,
without re-downloading 19 months. Roughly 620 MB/year.

**Two prefectures are ingested: 福岡 (pref-43) and 大分 (pref-47).** tenki.jp
publishes one radar map per prefecture, each fitted to *its own* prefecture's
bounding box — the zoom is not shared. Measured: Kagoshima renders at 2.10 px/km
against Fukuoka's 3.78 on the same 692x519 canvas, and Oita at 3.38. Every
prefecture therefore needs its own affine, measured from landmarks; the maps are
not interchangeable. What *is* shared, and was verified between 43 and 47: the
colour swatches, the blend constant, both basemap colours, the band table, and
the three MASK_BOXES rectangles (identical pixels, though the geography beneath
them differs and must be re-checked per prefecture).

Adding a prefecture now means: calibrate an affine (see Calibration below), add
it to `PREFECTURES` in `precip_extract.py`, and add its code to `PREFS` in
`precip-cron.sh`. Each code costs ~620 MB/year of images. `precip_fill.py`
refuses a code with no calibrated affine rather than guessing.

The read path selects **by containment, not by recency**:

```
apps/api/src/lib/precip-series.ts   gridFor()
```

Among the grids whose image contains the point, the one holding snapshots for
the requested span wins, and interiority — how far inside its image the point
sits — breaks the remaining ties. This used to be
`findFirst({ orderBy: { id: 'desc' } })`, which was correct only while Fukuoka
was the only grid: ingesting a second prefecture would have made its row the
newest, resolved every post against it, and emptied every existing panel with
nothing logged. `apps/api/test/precipitation.test.ts` guards it — the test was
confirmed to fail against the old selection.

`analyze_fruiting.py` had the same latent bug from the other direction: it read
`precip_snapshots` with no `grid_id` filter, so a second prefecture would have
blended two grids that share cell indices but not geography. It now resolves its
grid by full geometry match.

## Calibration

`precipication-collector/calibration/` holds three tools. The normal loop is two
commands; reading landmarks off a map by hand is now the fallback, not the job.

```
python auto_affine.py   --pref 44 --ref 43                        # produce
python verify_affine.py --pref 44 --ref 43 --landmarks landmarks-pref-44.tsv
```

**auto_affine.py** calibrates against an already-calibrated neighbour. The maps
overlap and see the same rain, so the reference grid is ground truth: it searches
the pixel-space scale and offset that makes the target read the same bands.
Measured by calibrating 大分 against 福岡 with its landmarks withheld, then
comparing to the landmark affine: **worst image-corner displacement 1.71 px,
504 m**. Two things it prints every run are the ones to read — whether the
fitted sx and sy agree (they must, the transform is a similarity), and how far
the *reference* departs from Mercator, which is the floor on what calibrating
against it can achieve (福岡: 1.3 px).

Do not chain linear affines to compose the result. Longitude is exactly linear
in Mercator and latitude is not, so a stored affine is only the best linear fit
over its own latitude band; composing through it costs 4 px. `compose()` goes
through a Mercator model of the reference and refits over the target's frame.

**verify_affine.py** runs three checks that are not either fitter's objective:
held-out landmark coordinates projected against the coastline the map draws; the
overlap agreement with a neighbour as a shift sweep (the peak must sit dead
centre — the value alone is weak evidence, since auto_affine nearly optimises
it); and what the three mask boxes cover, with the land fraction under each.
大分 measures: held-out median 0.42 km, overlap 95.4% peaking at (0,0), one box
over land but Ehime's, not Oita's.

**fit_affine.py** is the manual path, for a prefecture with no calibrated
neighbour or when auto disagrees with verification. Pick 6-10 landmarks — capes,
island tips, lighthouses, **not prefecture borders**: the map draws those
generalised, and the 大分 fit was thrown by a border point whose coordinate and
pixel disagreed by 3 km and which induced a spurious 1.27 deg tilt. Read pixels
off a rain-free frame, coordinates from 地理院地図, then judge the fit by RMS
under ~1 px, rotation near zero (福岡 is +0.03 deg), and the scale-free aspect
check `lon_px/|lat_py| = 1/cos(lat)`, which 福岡 satisfies to +0.17%. Never
expect the absolute scale to match another prefecture's.

Verification numbers are only comparable when measured the same way: an early
hand-run of the overlap check reported 87.5% for the same 大分 affine that
verify_affine scores 95.4%, because it sampled four hours of the 2025-08-10
extreme where echo covered 80% of the map. verify_affine picks hours in the
10-65% echo band.

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

This is about the deprecated prototype specifically, not about `precip_fill.py`
(the script the cron actually runs) — see "Setting up the `mycologs` env on a
new machine" below, which gets that one working.

**Setting up the `mycologs` env on a new machine.** As of 2026-09-22 a fresh
machine had no `mycologs` conda env at all (not even the incomplete one above)
and no crontab entry installed — `precip_fill.py` failed immediately with
`DATABASE_URL is not set`. From scratch:

```
conda create -y -n mycologs python=3.13
"$(conda info --base)/envs/mycologs/bin/python" -m pip install -r precipication-collector/requirements.txt
(crontab -l 2>/dev/null; echo "20 * * * * $(pwd)/precipication-collector/precip-cron.sh") | crontab -
```

Recent conda refuses to create envs from the `defaults` channels until their
Terms of Service are accepted (once per machine):
```
conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main
conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r
```

Before trusting the cron, run `python precip_fill.py status` — it should
report a connected DB and a non-zero snapshot count (needs `db:up` running).
If it instead complains about `DATABASE_URL`, check `REPO_ROOT` in
`precip_fill.py` first: it is computed as `parents[N]` relative to the
script's own location, so it silently breaks again if the collector is ever
moved without updating that line (this happened once already — see commit
`b5f1bfb`, fixing the fallout of `050fe24`).

## Resuming

```
git checkout precip-radar
npm run prisma:gen          # regenerate the client with the precip models
npm run precip-query -- 130.80546 33.66280 2025-08-30T00:00:00Z 2025-08-31T00:00:00Z
```

If the dev DB was reset or cleaned in the meantime, re-apply the migration first
(`npm run do-migrate`) and re-run the backfill.
