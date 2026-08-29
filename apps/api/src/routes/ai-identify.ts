import { FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { notifyAiCreditExhausted } from '../lib/mail'
import { recordAiUsage } from '../lib/ai-usage'

const UPLOADS_DIR = path.resolve(__dirname, '../../../../data/uploads')
const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:3002'

const MIME_TYPES: Record<string, string> = {
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
}

// Max 4 MB base64 payload (Claude limit is 5 MB; leave headroom)
const MAX_BYTES = 4 * 1024 * 1024

async function encodeImage(filename: string): Promise<{ data: string; mediaType: string }> {
    const filePath = path.join(UPLOADS_DIR, filename)

    // Resize to max 1024×1024, convert to JPEG to keep payload small
    let buf = await sharp(filePath)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer()

    // If still over limit, reduce quality further
    if (buf.length > MAX_BYTES) {
        buf = await sharp(filePath)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 70 })
            .toBuffer()
    }

    return { data: buf.toString('base64'), mediaType: 'image/jpeg' }
}

const AI_COST = Number(process.env.AI_IDENTIFICATION_COST ?? 10)

// The model reliably names the Japanese vernacular (ドクヤマドリ) but sometimes
// mis-spells or invents the binomial (e.g. "Sutorellus venenatus" for the real
// Sutorius venenatus). That bad string then flowed straight into the client's
// iNaturalist links, which resolve to the wrong taxon. When the vernacular name
// resolves to a known species, prefer that species' canonical scientific name
// so the links point at the right taxon; otherwise keep the model's string.
async function canonicalScientificName(
    fastify: FastifyInstance,
    japaneseName: unknown,
    scientificName: unknown,
): Promise<unknown> {
    const ja = typeof japaneseName === 'string' ? japaneseName.trim() : ''
    if (ja.length < 2) return scientificName
    try {
        const query = fastify.prisma.$queryRaw<{ scientificName: string }[]>`
            SELECT scientific_name AS "scientificName", 0 AS pri
            FROM species
            WHERE deleted_at IS NULL AND japanese_name = ${ja}
            UNION ALL
            SELECT s.scientific_name AS "scientificName", 1 AS pri
            FROM species_aliases a JOIN species s ON s.id = a.species_id
            WHERE s.deleted_at IS NULL AND a.name = ${ja}
            ORDER BY pri
            LIMIT 1
        `
        const timeout = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('canonicalScientificName timeout')), 5000),
        )
        const rows = await Promise.race([query, timeout])
        if (rows?.[0]?.scientificName) return rows[0].scientificName
    } catch {
        // DB connection lost or timed out — fall back to AI-provided name
    }
    return scientificName
}

export default async function (fastify: FastifyInstance) {
    fastify.post('/posts/:postId/ai-identify', {
        schema: {
            params: {
                type: 'object',
                properties: { postId: { type: 'integer' } },
                required: ['postId'],
            },
            body: {
                type: 'object',
                properties: {
                    hint:   { type: 'string' },
                    userId: { type: 'integer' },
                    candidates: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                japanese_name:   { type: 'string' },
                                scientific_name: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const { postId } = request.params as { postId: number }
        const { hint, userId, candidates } = (request.body ?? {}) as {
            hint?: string
            userId?: number
            candidates?: { japanese_name: string; scientific_name: string }[]
        }

        // Fetch the post with its event (for location data + credit ownership)
        const post = await fastify.prisma.post.findUnique({
            where: { id: Number(postId) },
            include: { event: true },
        })

        // ── Credit check ─────────────────────────────────────────────────────
        // Remember how to undo the deduction so we can refund if the AI call
        // can't be fulfilled for reasons outside the user's control.
        const eventClubId = post?.event?.clubId ?? null
        let refundCredit: (() => Promise<void>) | null = null
        if (eventClubId) {
            const deducted = await fastify.prisma.club.updateMany({
                where: { id: eventClubId, credit: { gte: AI_COST } },
                data:  { credit: { decrement: AI_COST } },
            })
            if (deducted.count === 0) {
                return reply.code(402).send({ message: 'クラブのクレジットが不足しています。サブスクリプションを更新してください。' })
            }
            refundCredit = async () => {
                await fastify.prisma.club.update({
                    where: { id: eventClubId },
                    data:  { credit: { increment: AI_COST } },
                })
            }
        } else if (userId) {
            const deducted = await fastify.prisma.user.updateMany({
                where: { id: Number(userId), credit: { gte: AI_COST } },
                data:  { credit: { decrement: AI_COST } },
            })
            if (deducted.count === 0) {
                return reply.code(402).send({ message: 'クレジットが不足しています。サブスクリプションを購入してください。' })
            }
            refundCredit = async () => {
                await fastify.prisma.user.update({
                    where: { id: Number(userId) },
                    data:  { credit: { increment: AI_COST } },
                })
            }
        }

        // Fetch images attached to this post
        const images = await fastify.prisma.media.findMany({
            where: { postId: Number(postId), type: 'IMAGE', deletedAt: null },
            orderBy: { createdAt: 'asc' },
        })

        if (images.length === 0) {
            if (refundCredit) await refundCredit().catch(() => {})
            return reply.code(422).send({ message: 'No images attached to this post.' })
        }

        // Defense-in-depth: the post's images may still be uploading in the
        // background. Identifying on a partial set wastes credit, so refund and
        // ask the caller to wait. The UI also disables the button until complete.
        const expectedMediaCount = post?.expectedMediaCount ?? 0
        if (expectedMediaCount > 0 && images.length < expectedMediaCount) {
            if (refundCredit) await refundCredit().catch(() => {})
            return reply.code(409).send({
                code:    'media_incomplete',
                message: '画像のアップロードが完了してから同定をご依頼ください。（クレジットは消費されていません）',
            })
        }

        // Build image payload (resize each image before encoding).
        //
        // Encoded one at a time on purpose. Each encode decodes the full-size
        // source in libvips' native memory — roughly 9 MB for a 1536x2048 photo,
        // plus the JPEG buffer and a base64 string a third larger again. Running
        // every image on the post concurrently multiplied that peak and put the
        // API within reach of the kernel OOM killer, which shows up to the user
        // as a dropped connection ("同定に失敗しました") that succeeds on retry.
        const encodedImages: { data: string; media_type: string }[] = []
        for (const img of images) {
            const { data, mediaType } = await encodeImage(img.filename)
            encodedImages.push({ data, media_type: mediaType })
        }

        const event = post?.event
        const body: Record<string, unknown> = { images: encodedImages }
        if (event?.latitude != null)  body.latitude  = event.latitude
        if (event?.longitude != null) body.longitude = event.longitude
        if (hint)                     body.hint       = hint
        if (Array.isArray(candidates) && candidates.length) body.candidates = candidates

        const response = await fetch(`${AI_SERVICE_URL}/api/identification/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })

        if (!response.ok) {
            const detail = await response.text()

            // The Anthropic *account* credit is exhausted (a platform-billing
            // problem, not the user's fault): refund the credit we just took,
            // alert the admins, and tell the user it's a temporary outage.
            if (response.status === 503 && detail.includes('insufficient_ai_credit')) {
                if (refundCredit) await refundCredit().catch(() => {})
                await notifyAiCreditExhausted(fastify.prisma, request.log)
                return reply.code(503).send({
                    code:    'ai_service_unavailable',
                    message: '現在、AI同定機能を一時的にご利用いただけません。管理者へ通知しましたので、復旧までしばらくお待ちください。（クレジットは消費されていません）',
                })
            }

            if (refundCredit) await refundCredit().catch(() => {})
            return reply.code(response.status).send({ message: detail })
        }

        const result = await response.json()
        await recordAiUsage(fastify.prisma, {
            kind:   'identify',
            usage:  result?.usage,
            postId: Number(postId),
            userId: userId ? Number(userId) : null,
            clubId: eventClubId,
            log:    request.log,
        })
        // `usage` is internal cost bookkeeping — don't leak it to the client.
        const { usage: _usage, ...clientResult } = result ?? {}

        // Reconcile AI-proposed binomials with the taxonomy DB so iNaturalist
        // links resolve correctly (see canonicalScientificName). Applies to the
        // primary result and each similar-species entry, which also link out.
        clientResult.scientific_name = await canonicalScientificName(
            fastify, clientResult.japanese_name, clientResult.scientific_name,
        )
        if (Array.isArray(clientResult.similar_species)) {
            await Promise.all(clientResult.similar_species.map(async (s: Record<string, unknown>) => {
                if (s && typeof s === 'object') {
                    s.scientific_name = await canonicalScientificName(fastify, s.japanese_name, s.scientific_name)
                }
            }))
        }

        return reply.send({ ...clientResult, hint: hint || null })
    })
}
