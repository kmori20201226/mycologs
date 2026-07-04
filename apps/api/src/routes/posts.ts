import { FastifyInstance } from 'fastify'
import { PublicityType } from '../../../../generated/prisma/client'
import { createPostSchema, postSchema, updatePostSchema } from '../schemas/post'
import { notifyAiCreditExhausted } from '../lib/mail'
import { recordAiUsage } from '../lib/ai-usage'
import { hasActiveAccess } from '../lib/subscription'

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:3002'

const AI_UNAVAILABLE_MESSAGE =
    '現在、投稿のAIチェックを一時的にご利用いただけません。管理者へ通知しましたので、復旧までしばらくお待ちください。'

// Run a post through the moderation agent. Returns the agent's verdict, or the
// sentinel 'unavailable' when the Anthropic *account* credit is exhausted — in
// that case the caller must reject the post (the admin is notified here). Any
// other failure fails open (returns PASS) to match the prior behaviour: a
// transient AI outage shouldn't block posting or penalise the user.
async function runModeration(fastify: FastifyInstance, contents: string): Promise<any | 'unavailable'> {
    try {
        const res = await fetch(`${AI_SERVICE_URL}/api/moderation/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ post: contents }),
        })
        if (res.status === 503) {
            const body = await res.text()
            if (body.includes('insufficient_ai_credit')) {
                await notifyAiCreditExhausted(fastify.prisma, fastify.log)
                return 'unavailable'
            }
        }
        if (!res.ok) return { allowed: true, category: 'PASS', comment: '' }
        return await res.json()
    } catch {
        return { allowed: true, category: 'PASS', comment: '' }
    }
}

const CATEGORY_POINTS: Record<string, number> = {
    POTENTIALLY_OFFENSIVE: -2,
    OFF_TOPIC_IMAGE:        -1,
}

const POST_INCLUDE = {
    user: { select: { id: true, name: true, handleName: true, email: true } },
    event: { select: { id: true, name: true, startAt: true, publicPlace: true } },
    postClubs: { select: { clubId: true } },
    media: { where: { deletedAt: null }, select: { url: true }, orderBy: { createdAt: 'asc' as const }, take: 1 },
} as const

function formatPost(post: any) {
    return {
        ...post,
        clubIds: post.postClubs.map((pc: any) => pc.clubId),
        postClubs: undefined,
        thumbnail: post.media?.[0]?.url ?? null,
        media: undefined,
    }
}

type MentionedSpecies = { id: number; scientificName: string; japaneseName: string }

// Deterministically find the mushrooms mentioned in a post's text by matching
// known species Japanese names against the contents — no AI call. Used to seed
// identification candidates (with iNaturalist links) in the UI.
//
// Two name sources are matched and unified: the canonical japanese_name on
// `species`, plus vernacular synonyms in `species_aliases` (so マツタケ resolves
// to the same species as the stored 松茸). Each candidate carries the literal
// text to search for; matches always resolve to the canonical species.
async function extractMentionedSpecies(fastify: FastifyInstance, contents: string): Promise<MentionedSpecies[]> {
    if (!contents || !contents.trim()) return []

    // Canonical Japanese names stored directly on species. ≥2 chars keeps famous
    // short names (松茸, ナメコ) while excluding 1-char noise.
    const speciesRows = await fastify.prisma.$queryRaw<MentionedSpecies[]>`
        SELECT id, scientific_name AS "scientificName", japanese_name AS "japaneseName"
        FROM species
        WHERE deleted_at IS NULL
          AND japanese_name IS NOT NULL
          AND char_length(japanese_name) >= 2
          AND strpos(${contents}, japanese_name) > 0
    `

    // Synonym aliases, each resolving to its canonical species. The canonical
    // japanese_name may be null, so fall back to the matched alias for display.
    const aliasRows = await fastify.prisma.$queryRaw<{
        matchText: string; id: number; scientificName: string; japaneseName: string | null
    }[]>`
        SELECT a.name AS "matchText",
               s.id, s.scientific_name AS "scientificName", s.japanese_name AS "japaneseName"
        FROM species_aliases a
        JOIN species s ON s.id = a.species_id
        WHERE s.deleted_at IS NULL
          AND char_length(a.name) >= 2
          AND strpos(${contents}, a.name) > 0
    `

    // Unify both sources into (matchText → canonical species) candidates.
    type Candidate = { matchText: string; sp: MentionedSpecies }
    const candidates: Candidate[] = [
        ...speciesRows.map((sp) => ({ matchText: sp.japaneseName, sp })),
        ...aliasRows.map((r) => ({
            matchText: r.matchText,
            sp: { id: r.id, scientificName: r.scientificName, japaneseName: r.japaneseName ?? r.matchText },
        })),
    ]

    // Containment dedup over text spans: drop a match whose occurrence sits fully
    // inside a longer match (テングタケ inside ベニテングタケ), but keep a shorter
    // name that also appears standalone elsewhere.
    type Span = { start: number; end: number; sp: MentionedSpecies }
    const spans: Span[] = []
    for (const { matchText, sp } of candidates) {
        let i = contents.indexOf(matchText)
        while (i !== -1) {
            spans.push({ start: i, end: i + matchText.length, sp })
            i = contents.indexOf(matchText, i + 1)
        }
    }
    spans.sort((a, b) => (b.end - b.start) - (a.end - a.start)) // longest first
    const kept: Span[] = []
    for (const s of spans) {
        if (!kept.some((k) => k.start <= s.start && s.end <= k.end)) kept.push(s)
    }

    // Unique species, in order of first appearance, capped.
    kept.sort((a, b) => a.start - b.start)
    const seen = new Set<number>()
    const result: MentionedSpecies[] = []
    for (const s of kept) {
        if (seen.has(s.sp.id)) continue
        seen.add(s.sp.id)
        result.push(s.sp)
        if (result.length >= 20) break
    }
    return result
}

// True when `eventId` refers to a personal event (no club) whose owner no longer
// has active subscription access. Personal events are a paid feature, so posting
// into — or attaching — such an event must be refused. Uses hasActiveAccess
// (honors access_until), the same definition the events route enforces.
async function personalEventLocked(fastify: FastifyInstance, eventId: number | null | undefined): Promise<boolean> {
    if (eventId == null) return false
    const event = await fastify.prisma.event.findUnique({
        where: { id: Number(eventId) },
        select: { clubId: true, userId: true },
    })
    if (!event || event.clubId != null || event.userId == null) return false
    return !(await hasActiveAccess(fastify.prisma, { userId: event.userId }))
}

async function resolveVisibilityAndClubs(
    fastify: FastifyInstance,
    userId: number,
    requestedVisibility: PublicityType | undefined,
    requestedClubIds: number[] | undefined,
): Promise<{ visibility: PublicityType; clubIds: number[] }> {
    if (requestedVisibility === 'PRIVATE') {
        // PRIVATE posts are subscriber-only; honor access_until, not just status.
        if (!await hasActiveAccess(fastify.prisma, { userId })) {
            throw { statusCode: 403, message: 'サブスクリプションが必要です' }
        }
        return { visibility: 'PRIVATE', clubIds: [] }
    }

    if (requestedVisibility === 'PUBLIC') {
        return { visibility: 'PUBLIC', clubIds: [] }
    }

    if (requestedVisibility === 'CLUBMEMBERONLY') {
        const clubIds = requestedClubIds ?? []
        return { visibility: 'CLUBMEMBERONLY', clubIds }
    }

    // No visibility specified — compute default
    const memberships = await fastify.prisma.clubUser.findMany({
        where: { userId },
        select: { clubId: true },
    })
    if (memberships.length === 0) {
        return { visibility: 'PUBLIC', clubIds: [] }
    }
    return { visibility: 'CLUBMEMBERONLY', clubIds: memberships.map(m => m.clubId) }
}

// Returns a Prisma where-clause fragment that gates visibility for a viewer.
// viewerId=null means anonymous (public only).
function visibilityFilter(viewerId: number | null) {
    if (viewerId === null) {
        return { visibility: 'PUBLIC' as PublicityType }
    }
    return {
        OR: [
            { visibility: 'PUBLIC' as PublicityType },
            { userId: viewerId },
            {
                visibility: 'CLUBMEMBERONLY' as PublicityType,
                postClubs: {
                    some: {
                        club: { clubUsers: { some: { userId: viewerId } } }
                    }
                }
            },
        ],
    }
}

// Photo capture times (takenAt) are filtered by calendar day in JST (UTC+9),
// matching how users think about "when the picture was taken" regardless of the
// server's timezone. Given a yyyy-mm-dd day, returns the UTC instant at its JST
// start; addDays yields an exclusive upper bound (start of the day after).
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
function jstDayStart(day: string, addDays = 0): Date {
    const d = new Date(`${day}T00:00:00+09:00`)
    if (addDays) d.setUTCDate(d.getUTCDate() + addDays)
    return d
}

async function getViewerId(request: any): Promise<number | null> {
    try {
        await request.jwtVerify()
        return (request.user as { id: number }).id
    } catch {
        return null
    }
}

export default async function (fastify: FastifyInstance) {

    // CREATE
    fastify.post('/posts', {
        schema: {
            body: createPostSchema,
            response: {
                201: postSchema,
                403: { type: 'object', properties: { message: { type: 'string' } } },
                422: {
                    type: 'object',
                    properties: {
                        status:   { type: 'string' },
                        category: { type: 'string' },
                        comment:  { type: 'string' },
                    }
                },
                503: {
                    type: 'object',
                    properties: {
                        status:  { type: 'string' },
                        message: { type: 'string' },
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { eventId, userId, contents: rawContents, confirmedModeration, visibility: reqVisibility, clubIds: reqClubIds, expectedMediaCount, longitude, latitude, takenAt } = request.body as any
        const contents: string = rawContents ?? ''

        if (!confirmedModeration && contents) {
            const modResult = await runModeration(fastify, contents)

            if (modResult === 'unavailable') {
                return reply.code(503).send({ status: 'unavailable', message: AI_UNAVAILABLE_MESSAGE })
            }

            // postId is unknown here (the post isn't created yet, and may be
            // rejected) — record the cost against the user only.
            await recordAiUsage(fastify.prisma, {
                kind:   'moderate',
                usage:  modResult.usage,
                userId: userId ? Number(userId) : null,
                log:    request.log,
            })

            if (!modResult.allowed) {
                const validCategories = ['OFFENSIVE_SEXUAL', 'POTENTIALLY_OFFENSIVE', 'OFF_TOPIC_IMAGE', 'NONE']
                const safeCategory = validCategories.includes(modResult.category) ? modResult.category : 'NONE'
                await fastify.prisma.userLog.create({
                    data: {
                        userId:            Number(userId),
                        point:             Number(modResult.point ?? -5),
                        transactionType:   'POST',
                        rejectionCategory: safeCategory,
                        userPost:          contents,
                        comment:           modResult.comment ?? '',
                        createdBy:         Number(userId),
                    },
                }).catch(() => {})
                return reply.code(422).send({ status: 'rejected', comment: modResult.comment ?? '' })
            }

            if (modResult.category !== 'PASS') {
                return reply.code(422).send({
                    status:   'warning',
                    category: modResult.category,
                    comment:  modResult.comment,
                })
            }
        }

        // Personal events are a paid feature — refuse posting into one whose owner
        // has lapsed (mirrors the events route's creation gate).
        if (await personalEventLocked(fastify, eventId)) {
            return reply.code(403).send({ message: 'サブスクリプションが必要です' })
        }

        let resolved: { visibility: PublicityType; clubIds: number[] }
        try {
            resolved = await resolveVisibilityAndClubs(fastify, Number(userId), reqVisibility, reqClubIds)
        } catch (e: any) {
            return reply.code(e.statusCode ?? 403).send({ message: e.message })
        }

        const post = await fastify.prisma.post.create({
            data: {
                eventId: eventId ?? null,
                userId: Number(userId),
                contents,
                visibility: resolved.visibility,
                expectedMediaCount: Number(expectedMediaCount ?? 0),
                longitude: longitude ?? null,
                latitude: latitude ?? null,
                takenAt: takenAt ?? null,
                postClubs: { create: resolved.clubIds.map(clubId => ({ clubId })) },
            },
            include: POST_INCLUDE,
        })

        const logCategory = confirmedModeration?.category ?? 'NONE'
        const logPoint    = confirmedModeration && CATEGORY_POINTS[confirmedModeration.category] !== undefined
            ? CATEGORY_POINTS[confirmedModeration.category] as number
            : 0
        await fastify.prisma.userLog.create({
            data: {
                userId:            Number(userId),
                postId:            post.id,
                point:             logPoint,
                transactionType:   'POST',
                rejectionCategory: logCategory as any,
                userPost:          contents,
                comment:           confirmedModeration?.comment ?? '',
                createdBy:         Number(userId),
            },
        })

        return reply.code(201).send(formatPost(post))
    })

    // READ BY ID
    fastify.get('/posts/:id', {
        schema: {
            params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
            response: {
                200: postSchema,
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const viewerId = await getViewerId(request)

        const post = await fastify.prisma.post.findFirst({
            where: { id: Number(id), deletedAt: null, ...visibilityFilter(viewerId) },
            include: POST_INCLUDE,
        })

        if (!post) return reply.code(404).send({ message: 'Post not found' })
        const mentionedSpecies = await extractMentionedSpecies(fastify, post.contents)
        return { ...formatPost(post), mentionedSpecies }
    })

    // LIST ALL
    // Distinct events among the posts the viewer is allowed to see, for the
    // browse-page event filter. Gated by the same visibility rules as the list
    // so it never reveals event names the viewer has no visible posts for.
    // Registered before '/posts/:id' — find-my-way prefers this static route.
    fastify.get('/posts/filter-events', {
        schema: {
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { id: { type: 'number' }, name: { type: 'string' } },
                    },
                },
            },
        },
    }, async (request) => {
        const viewerId = await getViewerId(request)
        const rows = await fastify.prisma.post.findMany({
            where: {
                deletedAt: null,
                parentPostId: null,
                eventId: { not: null },
                ...visibilityFilter(viewerId),
            },
            select: { event: { select: { id: true, name: true } } },
        })
        const byId = new Map<number, { id: number; name: string }>()
        for (const r of rows) if (r.event) byId.set(r.event.id, r.event)
        return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    })

    fastify.get('/posts', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    eventId:    { type: 'integer' },
                    visibility: { type: 'string', enum: ['PUBLIC', 'CLUBMEMBERONLY', 'PRIVATE'] },
                    takenFrom:  { type: 'string' },
                    takenTo:    { type: 'string' },
                },
            },
            response: { 200: { type: 'array', items: postSchema } }
        }
    }, async (request, reply) => {
        const { eventId, visibility, takenFrom, takenTo } = request.query as {
            eventId?: number; visibility?: PublicityType; takenFrom?: string; takenTo?: string
        }
        const viewerId = await getViewerId(request)

        // The visibility gate must always apply; a requested `visibility` can only
        // narrow it (AND), never widen it — otherwise an anonymous viewer could
        // ask for PRIVATE and see others' private posts.
        const where: any = {
            deletedAt: null,
            parentPostId: null,
            AND: [visibilityFilter(viewerId)],
        }
        if (eventId) where.eventId = Number(eventId)
        if (visibility) where.AND.push({ visibility })
        if (takenFrom || takenTo) {
            const takenAt: any = {}
            if (takenFrom && DAY_RE.test(takenFrom)) takenAt.gte = jstDayStart(takenFrom)
            if (takenTo && DAY_RE.test(takenTo))     takenAt.lt  = jstDayStart(takenTo, 1)
            if (Object.keys(takenAt).length) where.takenAt = takenAt
        }

        const posts = await fastify.prisma.post.findMany({
            where,
            include: POST_INCLUDE,
            orderBy: { createdAt: 'desc' },
        })

        return posts.map(formatPost)
    })

    // UPDATE
    fastify.patch('/posts/:id', {
        schema: {
            params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
            body: updatePostSchema,
            response: {
                200: postSchema,
                403: { type: 'object', properties: { message: { type: 'string' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } },
                422: {
                    type: 'object',
                    properties: {
                        status:   { type: 'string' },
                        category: { type: 'string' },
                        comment:  { type: 'string' },
                    }
                },
                503: {
                    type: 'object',
                    properties: {
                        status:  { type: 'string' },
                        message: { type: 'string' },
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any
        const { userId, confirmedModeration, visibility: reqVisibility, clubIds: reqClubIds, ...updateData } = request.body as any

        const existing = await fastify.prisma.post.findUnique({
            where: { id: Number(id) },
            select: { userId: true, visibility: true, event: { select: { clubId: true, userId: true } } },
        })
        if (!existing) return reply.code(404).send({ message: 'Post not found' })

        if (userId && Number(userId) !== existing.userId) {
            return reply.code(403).send({ message: 'この投稿を編集する権限がありません' })
        }

        // A post that uses a paid feature — attached to a personal event, or PRIVATE
        // visibility — becomes read-only once the owner's access lapses. Any edit
        // (including detaching the event) is refused, though the post stays visible.
        // Deletion is a separate handler and remains allowed.
        const usesPersonalEvent = existing.event != null && existing.event.clubId == null && existing.event.userId != null
        if ((usesPersonalEvent || existing.visibility === 'PRIVATE')
            && !(await hasActiveAccess(fastify.prisma, { userId: existing.userId }))) {
            return reply.code(403).send({ message: 'サブスクリプションが必要です' })
        }

        // Likewise, a lapsed user must not *attach* a personal event to a post that
        // doesn't already have one (the freeze above only covers existing events).
        if ('eventId' in updateData && await personalEventLocked(fastify, updateData.eventId)) {
            return reply.code(403).send({ message: 'サブスクリプションが必要です' })
        }

        if (updateData.contents && !confirmedModeration) {
            const modResult = await runModeration(fastify, updateData.contents)

            if (modResult === 'unavailable') {
                return reply.code(503).send({ status: 'unavailable', message: AI_UNAVAILABLE_MESSAGE })
            }

            await recordAiUsage(fastify.prisma, {
                kind:   'moderate',
                usage:  modResult.usage,
                postId: Number(id),
                userId: userId ? Number(userId) : null,
                log:    request.log,
            })

            if (!modResult.allowed) {
                const validCategories = ['OFFENSIVE_SEXUAL', 'POTENTIALLY_OFFENSIVE', 'OFF_TOPIC_IMAGE', 'NONE']
                const safeCategory = validCategories.includes(modResult.category) ? modResult.category : 'NONE'
                if (userId) {
                    await fastify.prisma.userLog.create({
                        data: {
                            userId:            Number(userId),
                            postId:            Number(id),
                            point:             Number(modResult.point ?? -5),
                            transactionType:   'UPDATE',
                            rejectionCategory: safeCategory,
                            userPost:          updateData.contents,
                            comment:           modResult.comment ?? '',
                            createdBy:         Number(userId),
                        },
                    }).catch(() => {})
                }
                return reply.code(422).send({ status: 'rejected', comment: modResult.comment ?? '' })
            }

            if (modResult.category !== 'PASS') {
                return reply.code(422).send({
                    status:   'warning',
                    category: modResult.category,
                    comment:  modResult.comment,
                })
            }
        }

        // Resolve visibility change if requested
        let visibilityUpdate: { visibility?: PublicityType; postClubs?: any } = {}
        if (reqVisibility !== undefined || reqClubIds !== undefined) {
            let resolved: { visibility: PublicityType; clubIds: number[] }
            try {
                resolved = await resolveVisibilityAndClubs(fastify, existing.userId, reqVisibility, reqClubIds)
            } catch (e: any) {
                return reply.code(e.statusCode ?? 403).send({ message: e.message })
            }
            visibilityUpdate = {
                visibility: resolved.visibility,
                postClubs: {
                    deleteMany: {},
                    create: resolved.clubIds.map(clubId => ({ clubId })),
                },
            }
        }

        try {
            const post = await fastify.prisma.post.update({
                where: { id: Number(id) },
                data: { ...updateData, ...visibilityUpdate },
                include: POST_INCLUDE,
            })

            if (userId) {
                const logCategory = confirmedModeration?.category ?? 'NONE'
                const logPoint    = confirmedModeration && CATEGORY_POINTS[confirmedModeration.category] !== undefined
                    ? CATEGORY_POINTS[confirmedModeration.category] as number
                    : 0
                await fastify.prisma.userLog.create({
                    data: {
                        userId:            Number(userId),
                        postId:            post.id,
                        point:             logPoint,
                        transactionType:   'UPDATE',
                        rejectionCategory: logCategory as any,
                        userPost:          post.contents,
                        comment:           confirmedModeration?.comment ?? '',
                        createdBy:         Number(userId),
                    },
                })
            }

            return formatPost(post)
        } catch {
            return reply.code(404).send({ message: 'Post not found' })
        }
    })

    // DELETE
    fastify.delete('/posts/:id', {
        schema: {
            params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
            response: {
                200: { type: 'object', properties: { message: { type: 'string' } } },
                404: { type: 'object', properties: { message: { type: 'string' } } }
            }
        }
    }, async (request, reply) => {
        const { id } = request.params as any

        const existing = await fastify.prisma.post.findUnique({
            where: { id: Number(id) },
            select: { userId: true, contents: true }
        })

        if (!existing) return reply.code(404).send({ message: 'Post not found' })

        try {
            await fastify.prisma.post.update({
                where: { id: Number(id) },
                data: { deletedAt: new Date() }
            })

            await fastify.prisma.userLog.create({
                data: {
                    userId:            existing.userId,
                    postId:            Number(id),
                    point:             0,
                    transactionType:   'DELETE',
                    rejectionCategory: 'NONE',
                    userPost:          existing.contents,
                    comment:           '',
                    createdBy:         existing.userId,
                },
            })

            return { message: 'Post deleted' }
        } catch {
            return reply.code(404).send({ message: 'Post not found' })
        }
    })
}
