import { FastifyInstance } from 'fastify'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import sharp from 'sharp'
import { createMediaSchema, mediaSchema, updateMediaSchema } from '../schemas/media'

const UPLOADS_DIR = path.resolve(__dirname, '../../../../data/uploads')
const NEIGHBOR_WINDOW_MS = 60 * 60 * 1000 // 1 hour

// The post a picture can move into for a given direction: the requester's own
// post that is immediately before ('prev') or after ('next') `post` by photo
// taken time, and no more than an hour away. Individual photos don't store
// their own capture time, so the post's takenAt is used as the reference.
async function neighborPost(
    fastify: FastifyInstance,
    post: { id: number; userId: number; takenAt: Date | null },
    direction: 'prev' | 'next',
) {
    if (!post.takenAt) return null
    const base = post.takenAt.getTime()
    const range = direction === 'prev'
        ? { lt: post.takenAt, gte: new Date(base - NEIGHBOR_WINDOW_MS) }
        : { gt: post.takenAt, lte: new Date(base + NEIGHBOR_WINDOW_MS) }
    return fastify.prisma.post.findFirst({
        where: {
            userId: post.userId,
            id: { not: post.id },
            deletedAt: null,
            parentPostId: null,
            takenAt: range,
        },
        orderBy: { takenAt: direction === 'prev' ? 'desc' : 'asc' },
        select: { id: true, takenAt: true },
    })
}

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/media', {
        schema: {
            body: createMediaSchema,
            response: {
                201: mediaSchema
            }
        }
    }, async (request, reply) => {
        const {
            filename,
            originalName,
            url,
            type,
            mimeType,
            size,
            duration,
            width,
            height,
            postId,
            thumbnailUrl,
            isPublic,
            description,
            tags
        } = request.body as any

        const media = await fastify.prisma.media.create({
            data: {
                filename,
                originalName,
                url,
                type,
                mimeType,
                size,
                duration,
                width,
                height,
                postId,
                thumbnailUrl,
                isPublic: isPublic ?? false,
                description,
                tags: tags || []
            },
            include: {
                post: { select: { id: true, contents: true } }
            }
        })

        return reply.code(201).send(media)
    })

    // READ BY ID
    fastify.get('/media/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            },
            response: {
                200: mediaSchema,
                404: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any

        const media = await fastify.prisma.media.findUnique({
            where: { id },
            include: {
                post: { select: { id: true, contents: true } }
            }
        })

        if (!media) {
            return reply.code(404).send({ message: 'Media not found' })
        }

        return media
    })

    // LIST ALL
    fastify.get('/media', {
        schema: {
            response: {
                200: {
                    type: 'array',
                    items: mediaSchema
                }
            }
        }
    }, async (request, reply) => {
        const media = await fastify.prisma.media.findMany({
            include: {
                post: { select: { id: true, contents: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        return media
    })

    // LIST BY POST
    fastify.get('/posts/:postId/media', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    postId: { type: 'integer' }
                },
                required: ['postId']
            },
            response: {
                200: {
                    type: 'array',
                    items: mediaSchema
                }
            }
        }
    }, async (request, reply) => {
        const { postId } = request.params as any

        const media = await fastify.prisma.media.findMany({
            // Exclude soft-deleted rows: without this the client's media poll
            // re-fetches a just-deleted picture and it reappears (revives).
            where: { postId: Number(postId), deletedAt: null },
            include: {
                post: { select: { id: true, contents: true } }
            },
            orderBy: { createdAt: 'asc' }
        })

        return media
    })

    // UPDATE
    fastify.patch('/media/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            },
            body: updateMediaSchema,
            response: {
                200: mediaSchema,
                404: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const updateData = request.body as any

        try {
            const media = await fastify.prisma.media.update({
                where: { id },
                data: updateData,
                include: {
                    post: { select: { id: true, contents: true } }
                }
            })

            return media
        } catch (error) {
            return reply.code(404).send({ message: 'Media not found' })
        }
    })

    // DELETE (Soft delete)
    fastify.delete('/media/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                },
                404: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any

        try {
            const media = await fastify.prisma.media.findUnique({
                where: { id },
                select: { type: true, postId: true, deletedAt: true, post: { select: { expectedMediaCount: true } } },
            })
            if (!media || media.deletedAt) {
                return reply.code(404).send({ message: 'Media not found' })
            }

            await fastify.prisma.media.update({
                where: { id },
                data: { deletedAt: new Date() },
            })

            // Keep the post's expected image count in sync so it doesn't fall
            // back to "incomplete" (which restarts the client's upload poll and
            // disables Identify). Only images count toward expectedMediaCount.
            if (media.type === 'IMAGE' && media.post.expectedMediaCount > 0) {
                await fastify.prisma.post.update({
                    where: { id: media.postId },
                    data: { expectedMediaCount: media.post.expectedMediaCount - 1 },
                })
            }

            return { message: 'Media soft deleted' }
        } catch (error) {
            return reply.code(404).send({ message: 'Media not found' })
        }
    })

    // ROTATE (90° clockwise / counter-clockwise). Rotates the stored file in
    // place, baking any EXIF orientation first, and writes it under a fresh name
    // so browsers never serve a stale cached copy. Dimensions are swapped.
    fastify.post('/media/:id/rotate', {
        preHandler: [fastify.authenticate],
        schema: {
            params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
            body: {
                type: 'object',
                properties: { direction: { type: 'string', enum: ['cw', 'ccw'] } },
                required: ['direction'],
            },
            response: {
                200: mediaSchema,
                403: { type: 'object', properties: { message: { type: 'string' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } },
                422: { type: 'object', properties: { message: { type: 'string' } } },
            },
        },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const { direction } = request.body as { direction: 'cw' | 'ccw' }
        const { id: userId } = request.user as { id: number }

        const media = await fastify.prisma.media.findUnique({
            where: { id },
            include: { post: { select: { userId: true } } },
        })
        if (!media || media.deletedAt) return reply.code(404).send({ message: 'Media not found' })
        if (media.post.userId !== userId) return reply.code(403).send({ message: '権限がありません' })
        if (media.type !== 'IMAGE') return reply.code(422).send({ message: '画像のみ回転できます' })

        const srcPath = path.join(UPLOADS_DIR, media.filename)
        if (!fs.existsSync(srcPath)) return reply.code(404).send({ message: 'File not found' })

        const angle = direction === 'cw' ? 90 : -90
        // First bake in EXIF orientation (so our 90° is relative to what the user
        // sees), then apply the requested rotation.
        const oriented = await sharp(srcPath).rotate().toBuffer()
        const rotated = await sharp(oriented).rotate(angle).toBuffer()
        const meta = await sharp(rotated).metadata()

        const ext = path.extname(media.filename)
        const newName = `P-${userId}-${media.postId}-${crypto.randomBytes(4).toString('hex')}${ext}`
        await fs.promises.writeFile(path.join(UPLOADS_DIR, newName), rotated)

        const apiBase = process.env.API_URL ?? 'http://localhost:3000'
        const updated = await fastify.prisma.media.update({
            where: { id },
            data: {
                filename: newName,
                url: `${apiBase}/uploads/${newName}`,
                width: meta.width ?? media.width,
                height: meta.height ?? media.height,
                size: rotated.length,
            },
            include: { post: { select: { id: true, contents: true } } },
        })

        // Best-effort cleanup of the pre-rotation file.
        fs.promises.unlink(srcPath).catch(() => {})

        return updated
    })

    // Which neighbouring posts a picture on this post could move into (for
    // enabling/disabling the move arrows). Only the post owner gets targets.
    fastify.get('/posts/:postId/photo-neighbors', {
        preHandler: [fastify.authenticate],
        schema: {
            params: { type: 'object', properties: { postId: { type: 'integer' } }, required: ['postId'] },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        prev: { type: 'number', nullable: true },
                        next: { type: 'number', nullable: true },
                    },
                },
            },
        },
    }, async (request) => {
        const { postId } = request.params as { postId: number }
        const { id: userId } = request.user as { id: number }
        const post = await fastify.prisma.post.findUnique({
            where: { id: Number(postId) },
            select: { id: true, userId: true, takenAt: true },
        })
        if (!post || post.userId !== userId) return { prev: null, next: null }
        const [prev, next] = await Promise.all([
            neighborPost(fastify, post, 'prev'),
            neighborPost(fastify, post, 'next'),
        ])
        return { prev: prev?.id ?? null, next: next?.id ?? null }
    })

    // MOVE a picture to the previous/next post (by photo taken time, within 1h).
    fastify.post('/media/:id/move', {
        preHandler: [fastify.authenticate],
        schema: {
            params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
            body: {
                type: 'object',
                properties: { direction: { type: 'string', enum: ['prev', 'next'] } },
                required: ['direction'],
            },
            response: {
                200: { type: 'object', properties: { postId: { type: 'number' } } },
                403: { type: 'object', properties: { message: { type: 'string' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } },
                409: { type: 'object', properties: { message: { type: 'string' } } },
            },
        },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const { direction } = request.body as { direction: 'prev' | 'next' }
        const { id: userId } = request.user as { id: number }

        const media = await fastify.prisma.media.findUnique({
            where: { id },
            include: { post: { select: { id: true, userId: true, takenAt: true, expectedMediaCount: true } } },
        })
        if (!media || media.deletedAt) return reply.code(404).send({ message: 'Media not found' })
        if (media.post.userId !== userId) return reply.code(403).send({ message: '権限がありません' })

        const neighbor = await neighborPost(fastify, media.post, direction)
        if (!neighbor) {
            return reply.code(409).send({
                message: direction === 'prev'
                    ? '1時間以内の前の投稿がありません'
                    : '1時間以内の次の投稿がありません',
            })
        }

        // Reassign the picture, and keep both posts' expected image counts in
        // sync so neither is left looking "incomplete" (see the delete handler).
        const ops: any[] = [
            fastify.prisma.media.update({ where: { id }, data: { postId: neighbor.id } }),
        ]
        if (media.type === 'IMAGE') {
            if (media.post.expectedMediaCount > 0) {
                ops.push(fastify.prisma.post.update({
                    where: { id: media.post.id },
                    data: { expectedMediaCount: media.post.expectedMediaCount - 1 },
                }))
            }
            ops.push(fastify.prisma.post.update({
                where: { id: neighbor.id },
                data: { expectedMediaCount: { increment: 1 } },
            }))
        }
        await fastify.prisma.$transaction(ops)
        return { postId: neighbor.id }
    })
}