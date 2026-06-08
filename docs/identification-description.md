# `identifications.description` — JSON structure

The `description` column on the **`identifications`** table stores the structured
**AI identification result** as JSON.

- **Prisma:** `description Json? @map("description")` (`prisma/schema.prisma`, model `Identification`)
- **Postgres:** nullable `jsonb`
- **API contract:** typed as a free-form object — `{ type: 'object', nullable: true, additionalProperties: true }` (`apps/api/src/schemas/identification.ts`). The database and API do **not** enforce the field shape; the structure below is a convention defined by the AI service, so consumers should read fields defensively (optional ones may be missing on older rows).

## When is it populated?

| Identification source | `description` | `specieId` |
|---|---|---|
| **AI identification** (user runs AI identify, then saves the result) | the JSON object below | auto-linked from `scientific_name` when a matching species exists, else `null` |
| **Human identification** (user picks a species) | usually `null` | the chosen species id |

So `description` is the payload for **AI-generated** identifications. It is written by `POST /identifications` (`apps/api/src/routes/identifications.ts`) from the body the web client sends in `createIdentification(...)`, which passes the AI result object straight through (`apps/web/src/app/posts/[id]/page.tsx` → `description: aiResult`).

## Source of truth for the shape

The structure originates in the AI service and flows through unchanged:

```
ai-service IdentificationResult (Pydantic)      ← canonical schema
  └─ ai-service/src/mycologs_ai_service/api/identification/schemas.py
→ returned by POST /posts/:id/ai-identify        ← Node gateway
→ TS type AiIdentification                        ← apps/web/src/lib/api.ts
→ saved verbatim into identifications.description
```

Two adjustments happen between the raw AI result and what is stored:

- **`usage` is removed.** The AI service attaches per-call token usage (`usage`) to its result, but the Node gateway strips it before returning to the client (`apps/api/src/routes/ai-identify.ts`), so it never reaches `description`. (Token usage is recorded separately in `ai_usage_log`.)
- **`hint` is added.** The gateway appends the user's free-text hint (or `null`) to the response, so a saved `description` typically includes a `hint` field.

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `scientific_name` | `string` | yes | Proposed species scientific name. **Empty string `""`** when no mushroom could be identified in the image. Used server-side to auto-link `specieId` (looked up in `species` by `scientificName`). |
| `japanese_name` | `string` | yes | Japanese common name. |
| `dialect_names` | `string[]` | yes | Local / dialect names (may be empty). |
| `confidence` | `"high" \| "medium" \| "low"` | yes | Qualitative confidence level. |
| `score` | `number` | yes | Numeric confidence (float, roughly 0.0–1.0). Mirrored into the `identifications.score` column (the route falls back to `description.score` when `score` isn't sent explicitly). |
| `shape` | `string` | yes | Overall form/shape description (e.g. 傘, 半球形). |
| `edibility` | `"edible" \| "toxic" \| "inedible" \| "unknown"` | yes | Edibility classification. ⚠️ informational only — see `disclaimer`. |
| `key_features` | `string[]` | yes | 2–4 visually observable features, in Japanese, beginner-friendly. |
| `similar_species` | `SimilarSpecies[]` | yes | 0–2 look-alike species with how to tell them apart (may be empty). See below. |
| `missing_info` | `string[]` | optional | Information that would raise confidence but isn't visible in the image (e.g. spore-print color, stem base, smell). |
| `candidate_evaluations` | `CandidateEvaluation[]` | optional | Present only for **guided identification** (when the poster's mentioned species were passed as candidates). One entry per candidate: how well the images match it. See below. Empty/absent for open-ended identification. |
| `disclaimer` | `string` | yes | Safety notice. Defaults to: 「※ AIによる同定は参考情報です。食用の判断をAIに委ねず、必ず専門家にご確認ください。」 |
| `agent_version` | `string` | optional | Model / prompt version that produced the result, e.g. `"claude-opus-4-7/prompt-v2.1"`. Useful for tracing which agent version generated an older row. |
| `hint` | `string \| null` | optional | The user-supplied hint passed to the AI for this identification (added by the gateway). |

### `SimilarSpecies` (elements of `similar_species`)

| Field | Type | Description |
|---|---|---|
| `japanese_name` | `string` | Look-alike species' Japanese name. |
| `scientific_name` | `string` | Look-alike species' scientific name. |
| `how_to_distinguish` | `string` | How to tell it apart from the proposed species (Japanese). |

### `CandidateEvaluation` (elements of `candidate_evaluations`)

| Field | Type | Description |
|---|---|---|
| `japanese_name` | `string` | Candidate's Japanese name (echo of the input candidate). |
| `scientific_name` | `string` | Candidate's scientific name (echo of the input). Used to link `specieId` when the candidate is saved. |
| `matches` | `boolean` | Whether the images match this candidate. |
| `confidence` | `"high" \| "medium" \| "low"` | Confidence in the verdict. |
| `score` | `number` | Match score (0.0–1.0). |
| `reason` | `string` | Short Japanese justification (matched / conflicting features). |

> **Saved-candidate variant.** When a user saves an individual candidate (guided
> identification), the new `Identification.description` stores that
> **`CandidateEvaluation` object itself** — not the full result above. It shares
> `scientific_name` / `japanese_name` / `confidence` / `score`, but carries
> `matches` + `reason` instead of the open-guess fields (`shape`, `key_features`,
> `similar_species`, …). Treat `description` as either shape and read fields
> defensively, per the convention noted above.

## Example

```json
{
  "scientific_name": "Amanita muscaria",
  "japanese_name": "ベニテングタケ",
  "dialect_names": ["ハエトリタケ"],
  "confidence": "high",
  "score": 0.92,
  "shape": "傘",
  "edibility": "toxic",
  "key_features": [
    "鮮やかな赤い傘",
    "傘の表面に白いイボ状の斑点",
    "柄の根元にツボがある"
  ],
  "similar_species": [
    {
      "japanese_name": "タマゴタケ",
      "scientific_name": "Amanita caesareoides",
      "how_to_distinguish": "傘が橙色で白いイボがなく、柄は黄色い。"
    }
  ],
  "missing_info": ["胞子紋の色", "柄の基部の形状"],
  "disclaimer": "※ AIによる同定は参考情報です。食用の判断をAIに委ねず、必ず専門家にご確認ください。",
  "agent_version": "claude-opus-4-7/prompt-v2.1",
  "hint": "林の中の地面に生えていた"
}
```

### "No mushroom detected" case

When the image doesn't contain an identifiable mushroom, the AI returns an empty
`scientific_name` and explains in the `disclaimer`; the other fields may be empty
or low-confidence:

```json
{
  "scientific_name": "",
  "japanese_name": "",
  "dialect_names": [],
  "confidence": "low",
  "score": 0.0,
  "shape": "",
  "edibility": "unknown",
  "key_features": [],
  "similar_species": [],
  "missing_info": [],
  "disclaimer": "画像にキノコが確認できませんでした。…",
  "agent_version": "claude-opus-4-7/prompt-v2.1",
  "hint": null
}
```

## Notes for consumers

- Because `scientific_name` can be `""` and `specieId` may be `null`, don't assume
  a `description`-bearing identification is always linked to a `species` row.
- Treat `missing_info`, `agent_version`, and `hint` as optional — older rows may
  lack them.
- The enum-like fields (`confidence`, `edibility`) come from the AI service's
  `ConfidenceLevel` / `EdibilityLevel` literals; if you switch on them, keep a
  default branch in case the set is extended.
