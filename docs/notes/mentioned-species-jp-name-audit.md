# Mentioned-species: japanese_name data-quality audit (handoff)

**Status:** ongoing investigation, as of 2026-06-13. Resume at the **Open decision** below.

## Background — how the feature works

The post detail page shows "mentioned species" chips that link to iNaturalist
reference photos. A species links **only** when its `japanese_name` is an exact
substring of the caption text.

- API: `extractMentionedSpecies()` in `apps/api/src/routes/posts.ts` —
  `strpos(contents, japanese_name) > 0`, names `char_length >= 2`,
  `deleted_at IS NULL`. Attaches `mentionedSpecies` to `GET /posts/:id`.
- Web: chips → links rendered in `apps/web/src/app/posts/[id]/page.tsx`
  (`/identify/inat/<scientificName>?ja=<japaneseName>`).
- Trailing punctuation (e.g. `？`) is irrelevant — it's substring containment,
  not equality.

## Done so far

- Set `japanese_name = 'キクラゲ'` for **species id 733** (*Auricularia
  auricula-judae*). **DEV DB ONLY — not prod, not in git.**
- Verified end-to-end: caption `"キクラゲ？"` now returns the chip + link.

## Findings — three problem classes (total species = 11,513)

**1. Blank `japanese_name`**
| id | scientific_name | should be |
|----|-----------------|-----------|
| 35 | Agaricus bisporus | ツクリタケ |
| 8366 | Pleurotus eryngii | エリンギ |

**2. Not in DB under that scientific name (likely a synonym)**
| expected name | likely stored under |
|---------------|---------------------|
| Ganoderma lingzhi (マンネンタケ/レイシ) | Ganoderma lucidum |
| Omphalotus japonicus (ツキヨタケ) | Omphalotus guepiniformis |

**3. Has a name, but not the form users type → won't match** (invisible to a
plain null-check)
| id | scientific_name | stored | users type |
|----|-----------------|--------|-----------|
| 3946 | Hericium erinaceus | `Yamabusi-take` (romaji) | ヤマブシタケ |
| 11098 | Tricholoma matsutake | `松茸` (kanji) | マツタケ |
| 10683 | Pholiota microspora | `チュウナメコ` | ナメコ |
| 8370 | Pleurotus ostreatus | `アワビタケ` | ヒラタケ |
| 8442 | Volvariella volvacea | `クロフクロタケ` | フクロタケ |

Root issue: one `japanese_name` per species can't cover multiple common names
(katakana vs kanji vs alternates).

## Open decision (resume here)

How to investigate further:

- **A. Widen the curated checklist** — add more famous species to the hand
  `VALUES` list and re-run. Bounded by recall; has blind spots.
- **B. Whole-table data-driven scan** — flag `NULL` / `<2 char`, romaji (Latin
  letters present), and kanji-only (no katakana) `japanese_name` across all rows.
  Finds issues you don't know to look for; can't rank by "fame".
- **C. Rank by actual usage** — order species by how often they appear in
  existing posts, audit those first. Targets what users really type.

**Recommended: B + C.** Durable fix for class 3 = an aliases / synonyms table
(or a common-names column) so マツタケ *and* 松茸 both link — touches the schema
and the `extractMentionedSpecies` query.

## Reminders

- All DB edits so far are **dev-only**; replicate in prod once finalized.
- No code changes are committed for this thread.
