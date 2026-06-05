import { FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { notifyAiCreditExhausted } from '../lib/mail'

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
                },
            },
        },
    }, async (request, reply) => {
        const { postId } = request.params as { postId: number }
        const { hint, userId } = (request.body ?? {}) as { hint?: string; userId?: number }

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

        // Build image payload (resize each image before encoding)
        const encodedImages = await Promise.all(
            images.map(async (img) => {
                const { data, mediaType } = await encodeImage(img.filename)
                return { data, media_type: mediaType }
            })
        )

        const event = post?.event
        const body: Record<string, unknown> = { images: encodedImages }
        if (event?.latitude != null)  body.latitude  = event.latitude
        if (event?.longitude != null) body.longitude = event.longitude
        if (hint)                     body.hint       = hint

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
        return reply.send({ ...result, hint: hint || null })
    })
}
