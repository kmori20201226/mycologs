import { FastifyInstance } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const UPLOADS_DIR = path.join(process.cwd(), '../../data/uploads')

const SYSTEM_PROMPT = `\
You are a mycologist specialising in Japanese fungi.
When given a mushroom photo, respond ONLY with a JSON object —
no markdown fences, no preamble, no explanation outside the JSON.

Required keys:
  scientific_name   string   Best-guess binomial (e.g. "Amanita muscaria")
  japanese_name     string   Standard Japanese name in katakana/kanji, or ""
  confidence        string   One of: "high", "medium", "low"
  shape             string   One of: Cap, Bracket, Coral, Tooth, Jelly, Cup,
                             Puffball, Stinkhorn, Crust, Truffle
  edibility         string   One of: edible, toxic, inedible, unknown
  key_features      list     2–4 visual features that led to this identification
  similar_species   list     0–2 species that could be confused with this one
  disclaimer        string   Always include a safety disclaimer about not
                             relying on AI for edibility decisions

If the image does not contain a mushroom, set scientific_name to ""
and explain briefly in the disclaimer field.
The mushroom is assumed to have been found in Japan, so only consider
species native to or commonly found in Japan.
When describing key features, use simple language that a beginner could understand.
For similar species, choose ones that are visually similar and briefly explain how to tell them apart.
Always include a clear safety disclaimer, even for edible mushrooms.
Requirements:
- Always respond in Japanese
- Use clear, natural Japanese
- Include:
  - 推定される種名（日本語名と学名）
  - 特徴の説明
  - 類似種との違い
  - 食用可否（不明な場合は「不明」とする）`

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

export default async function (fastify: FastifyInstance) {
    fastify.post('/posts/:postId/ai-identify', {
        schema: {
            params: {
                type: 'object',
                properties: { postId: { type: 'integer' } },
                required: ['postId'],
            },
        },
    }, async (request, reply) => {
        const { postId } = request.params as { postId: number }

        // Fetch the post with its event (for location data)
        const post = await fastify.prisma.post.findUnique({
            where: { id: Number(postId) },
            include: { event: true },
        })

        // Fetch images attached to this post
        const images = await fastify.prisma.media.findMany({
            where: { postId: Number(postId), type: 'IMAGE', deletedAt: null },
            orderBy: { createdAt: 'asc' },
        })

        if (images.length === 0) {
            return reply.code(422).send({ message: 'No images attached to this post.' })
        }

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

        // Build image content blocks (resize each image before encoding)
        const imageBlocks: Anthropic.ImageBlockParam[] = await Promise.all(
            images.map(async (img) => {
                const { data, mediaType } = await encodeImage(img.filename)
                return {
                    type: 'image' as const,
                    source: {
                        type: 'base64' as const,
                        media_type: mediaType as Anthropic.Base64ImageSource['media_type'],
                        data,
                    },
                }
            })
        )

        const event = post?.event
        const hasCoords = event?.latitude != null && event?.longitude != null
        const locationLine = hasCoords
            ? `GPS: latitude ${event!.latitude}, longitude ${event!.longitude}.`
            : 'No GPS provided. Assume somewhere in Japan.'

        const textBlock: Anthropic.TextBlockParam = {
            type: 'text',
            text: images.length > 1
                ? `${locationLine}\n複数の画像を総合的に見て同定してください。`
                : locationLine,
        }

        const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: [...imageBlocks, textBlock] }],
        })

        let raw = (response.content[0] as Anthropic.TextBlock).text.trim()

        // Strip accidental markdown fences
        if (raw.startsWith('```')) {
            raw = raw.replace(/^```[^\n]*\n/, '').replace(/```[\s\S]*$/, '').trim()
        }

        const result = JSON.parse(raw)
        return reply.send(result)
    })
}
