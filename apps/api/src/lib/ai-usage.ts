import { PrismaClient } from '../../../../generated/prisma/client'

// Token usage as returned by the ai-service (mirrors the SDK's message.usage).
export type AiUsagePayload = {
    model:                        string
    input_tokens:                 number
    output_tokens:                number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?:     number
}

type Logger = { warn: (...args: any[]) => void; error: (...args: any[]) => void }

// Anthropic list price in USD per 1,000,000 tokens. Keep in sync with the model
// each agent uses (ai-service .../agent.py `MODEL`). Matched by prefix so dated
// ids like "claude-haiku-4-5-20251001" resolve to "claude-haiku-4-5".
// Verify against https://platform.claude.com/docs/en/pricing when prices change.
const MODEL_RATES: Record<string, { input: number; output: number }> = {
    'claude-opus-4-8':   { input: 5, output: 25 },
    'claude-opus-4-7':   { input: 5, output: 25 },
    'claude-opus-4-6':   { input: 5, output: 25 },
    'claude-opus-4-5':   { input: 5, output: 25 },
    'claude-sonnet-4-6': { input: 3, output: 15 },
    'claude-haiku-4-5':  { input: 1, output: 5 },
}

function rateFor(model: string): { input: number; output: number } | null {
    for (const [prefix, rate] of Object.entries(MODEL_RATES)) {
        if (model.startsWith(prefix)) return rate
    }
    return null
}

// micro-USD (1e-6 USD). At $R per 1e6 tokens, one token costs R micro-USD, so the
// per-token rate equals the per-million USD price — no division needed.
function costMicroUsd(usage: AiUsagePayload): { cost: number; known: boolean } {
    const rate = rateFor(usage.model)
    if (!rate) return { cost: 0, known: false }
    const cacheCreation = usage.cache_creation_input_tokens ?? 0
    const cacheRead     = usage.cache_read_input_tokens ?? 0
    const cost = Math.round(
        usage.input_tokens  * rate.input +
        usage.output_tokens * rate.output +
        cacheCreation       * rate.input * 1.25 +
        cacheRead           * rate.input * 0.1,
    )
    return { cost, known: true }
}

// Append one row to the AI cost ledger. Fire-and-forget: never throws, so a
// logging failure can't break the request path that made the AI call.
export async function recordAiUsage(
    prisma: PrismaClient,
    args: {
        kind:   'identify' | 'moderate' | 'geocode'
        usage:  AiUsagePayload | null | undefined
        postId?: number | null
        userId?: number | null
        clubId?: number | null
        log?:    Logger
    },
): Promise<void> {
    const { kind, usage, postId, userId, clubId, log } = args
    if (!usage || typeof usage.input_tokens !== 'number') {
        log?.warn({ kind }, 'AI usage missing on response; no cost row recorded')
        return
    }
    try {
        const { cost, known } = costMicroUsd(usage)
        if (!known) {
            log?.warn({ model: usage.model }, 'no rate for AI model; recording usage with cost 0 — add it to MODEL_RATES')
        }
        await prisma.aiUsageLog.create({
            data: {
                kind,
                model:               usage.model,
                inputTokens:         usage.input_tokens,
                outputTokens:        usage.output_tokens,
                cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
                cacheReadTokens:     usage.cache_read_input_tokens ?? 0,
                costMicroUsd:        cost,
                postId:              postId ?? null,
                userId:              userId ?? null,
                clubId:              clubId ?? null,
            },
        })
    } catch (err) {
        log?.error({ err, kind }, 'failed to record AI usage')
    }
}
