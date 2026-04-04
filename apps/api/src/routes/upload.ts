import { FastifyPluginAsync } from 'fastify'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { pipeline } from 'stream/promises'
import imageSize from 'image-size'

const UPLOADS_DIR = path.resolve(__dirname, '../../../../data/uploads')

function mimeToMediaType(mime: string): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' {
    if (mime.startsWith('image/')) return 'IMAGE'
    if (mime.startsWith('video/')) return 'VIDEO'
    if (mime.startsWith('audio/')) return 'AUDIO'
    return 'DOCUMENT'
}

const uploadRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post<{ Params: { postId: string } }>(
        '/posts/:postId/media/upload',
        {
            schema: {
                params: {
                    type: 'object',
                    properties: { postId: { type: 'string' } },
                    required: ['postId'],
                },
                response: {
                    201: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            filename: { type: 'string' },
                            originalName: { type: 'string' },
                            url: { type: 'string' },
                            type: { type: 'string' },
                            mimeType: { type: 'string' },
                            size: { type: 'number' },
                            width: { type: 'number', nullable: true },
                            height: { type: 'number', nullable: true },
                            description: { type: 'string', nullable: true },
                            tags: { type: 'array', items: { type: 'string' } },
                            isPublic: { type: 'boolean' },
                            createdAt: { type: 'string' },
                        },
                    },
                },
            },
        },
        async (request, reply) => {
            const postId = Number(request.params.postId)
            if (isNaN(postId)) {
                return reply.status(400).send({ error: 'Invalid post ID' })
            }

            const post = await fastify.prisma.post.findUnique({ where: { id: postId } })
            if (!post) {
                return reply.status(404).send({ error: 'Post not found' })
            }

            const file = await request.file({ limits: { fileSize: 50 * 1024 * 1024 } })
            if (!file) {
                return reply.status(400).send({ error: 'No file uploaded' })
            }

            if (!fs.existsSync(UPLOADS_DIR)) {
                fs.mkdirSync(UPLOADS_DIR, { recursive: true })
            }

            const ext = path.extname(file.filename).toLowerCase()
            const storedName = `${crypto.randomUUID()}${ext}`
            const filePath = path.join(UPLOADS_DIR, storedName)

            try {
                await pipeline(file.file, fs.createWriteStream(filePath))
            } catch (err) {
                // Clean up partial file on stream error
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
                throw err
            }

            // Detect truncation (file exceeded size limit)
            if (file.file.truncated) {
                fs.unlinkSync(filePath)
                return reply.status(413).send({ error: 'File too large (max 50 MB)' })
            }

            const stat = fs.statSync(filePath)
            const mimeType = file.mimetype
            const type = mimeToMediaType(mimeType)

            let width: number | undefined
            let height: number | undefined

            if (type === 'IMAGE') {
                try {
                    const buf = fs.readFileSync(filePath)
                    const dims = imageSize(buf)
                    width = dims.width
                    height = dims.height
                } catch { /* skip if dimensions can't be determined */ }
            }

            const apiBase = process.env.API_URL ?? 'http://localhost:3000'
            const url = `${apiBase}/uploads/${storedName}`

            const media = await fastify.prisma.media.create({
                data: {
                    filename: storedName,
                    originalName: file.filename,
                    url,
                    mimeType,
                    type,
                    size: stat.size,
                    postId,
                    ...(width !== undefined && { width }),
                    ...(height !== undefined && { height }),
                },
            })

            return reply.status(201).send(media)
        }
    )
}

export default uploadRoutes
