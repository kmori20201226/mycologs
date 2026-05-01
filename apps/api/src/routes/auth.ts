import { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import { Resend } from 'resend'

const BCRYPT_ROUNDS = 12
const CODE_EXPIRY_MINUTES = 15
const MAX_ATTEMPTS = 5

const resend = new Resend(process.env.RESEND_COM_API_KEY)

const registerSchema = {
    type: 'object',
    required: ['name', 'email', 'password'],
    properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 8 }
    }
}

const loginSchema = {
    type: 'object',
    required: ['email', 'password'],
    properties: {
        email: { type: 'string' },
        password: { type: 'string' }
    }
}

const authResponseSchema = {
    type: 'object',
    properties: {
        token: { type: 'string' },
        user: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string', nullable: true }
            }
        }
    }
}

const errorSchema = {
    type: 'object',
    properties: {
        message: { type: 'string' }
    }
}

function generateCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000))
}

async function sendVerificationEmail(email: string, name: string, code: string): Promise<void> {
    const from = process.env.MAIL_FROM ?? 'Mycologs <noreply@mycologs.com>'
    await resend.emails.send({
        from,
        to: email,
        subject: '【Mycologs】メールアドレスの確認',
        html: `
            <p>${name} 様</p>
            <p>Mycologsにご登録いただきありがとうございます。</p>
            <p>以下の確認コードを入力してアカウントを有効化してください。</p>
            <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:24px 0">${code}</p>
            <p>このコードは${CODE_EXPIRY_MINUTES}分間有効です。</p>
            <p>このメールに心当たりがない場合は無視してください。</p>
        `
    })
}

export default async function (fastify: FastifyInstance) {

    // POST /auth/register
    fastify.post('/auth/register', {
        schema: {
            body: registerSchema,
            response: {
                201: { type: 'object', properties: { message: { type: 'string' }, email: { type: 'string' } } },
                409: errorSchema
            }
        }
    }, async (request, reply) => {
        const { name, email, password } = request.body as {
            name: string
            email: string
            password: string
        }

        const existing = await fastify.prisma.user.findUnique({
            where: { email },
            select: { id: true, emailVerified: true, name: true }
        })
        if (existing) {
            // Already verified → hard conflict
            if (existing.emailVerified) {
                return reply.code(409).send({ message: 'Email already in use' })
            }
            // Registered but not yet verified → resend code and let them verify
            await fastify.prisma.emailVerificationCode.deleteMany({ where: { userId: existing.id } })
            const code = generateCode()
            const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000)
            await fastify.prisma.emailVerificationCode.create({ data: { userId: existing.id, code, expiresAt } })
            await sendVerificationEmail(email, existing.name, code)
            return reply.code(201).send({ message: 'Verification code resent', email })
        }

        const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
        const freeTierCredits = Number(process.env.FREE_TIER_CREDITS ?? 50)

        const user = await fastify.prisma.user.create({
            data: { name, email, password_hash, credit: freeTierCredits },
            select: { id: true, name: true, email: true }
        })

        const code = generateCode()
        const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000)

        await fastify.prisma.emailVerificationCode.deleteMany({ where: { userId: user.id } })
        await fastify.prisma.emailVerificationCode.create({
            data: { userId: user.id, code, expiresAt }
        })

        await sendVerificationEmail(email, name, code)

        return reply.code(201).send({ message: 'Verification code sent', email })
    })

    // POST /auth/verify-email
    fastify.post('/auth/verify-email', {
        schema: {
            body: {
                type: 'object',
                required: ['email', 'code'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    code: { type: 'string' }
                }
            },
            response: { 200: authResponseSchema, 400: errorSchema, 404: errorSchema }
        }
    }, async (request, reply) => {
        const { email, code } = request.body as { email: string; code: string }

        const user = await fastify.prisma.user.findUnique({
            where: { email },
            select: { id: true, name: true, email: true, role: true, emailVerified: true }
        })
        if (!user) return reply.code(404).send({ message: 'User not found' })

        if (user.emailVerified) {
            const token = fastify.jwt.sign({ id: user.id, email: user.email })
            return reply.send({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
        }

        const record = await fastify.prisma.emailVerificationCode.findFirst({
            where: { userId: user.id }
        })

        if (!record) return reply.code(400).send({ message: '確認コードが見つかりません。再送信してください。' })
        if (new Date() > record.expiresAt) {
            await fastify.prisma.emailVerificationCode.delete({ where: { id: record.id } })
            return reply.code(400).send({ message: '確認コードの有効期限が切れています。再送信してください。' })
        }
        if (record.attempts >= MAX_ATTEMPTS) {
            await fastify.prisma.emailVerificationCode.delete({ where: { id: record.id } })
            return reply.code(400).send({ message: '試行回数が上限に達しました。再送信してください。' })
        }

        if (record.code !== code.trim()) {
            await fastify.prisma.emailVerificationCode.update({
                where: { id: record.id },
                data: { attempts: { increment: 1 } }
            })
            const remaining = MAX_ATTEMPTS - record.attempts - 1
            return reply.code(400).send({ message: `確認コードが正しくありません。残り${remaining}回試行できます。` })
        }

        await fastify.prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: new Date() }
        })
        await fastify.prisma.emailVerificationCode.delete({ where: { id: record.id } })

        const token = fastify.jwt.sign({ id: user.id, email: user.email })
        return reply.send({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
    })

    // POST /auth/resend-verification
    fastify.post('/auth/resend-verification', {
        schema: {
            body: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } }
            },
            response: { 200: { type: 'object', properties: { message: { type: 'string' } } }, 400: errorSchema, 404: errorSchema }
        }
    }, async (request, reply) => {
        const { email } = request.body as { email: string }

        const user = await fastify.prisma.user.findUnique({
            where: { email },
            select: { id: true, name: true, emailVerified: true }
        })
        if (!user) return reply.code(404).send({ message: 'User not found' })
        if (user.emailVerified) return reply.code(400).send({ message: 'すでにメールアドレスが確認済みです。' })

        const existing = await fastify.prisma.emailVerificationCode.findFirst({ where: { userId: user.id } })
        if (existing) {
            const secondsSinceSent = (Date.now() - existing.createdAt.getTime()) / 1000
            if (secondsSinceSent < 60) {
                return reply.code(400).send({ message: `再送信は${Math.ceil(60 - secondsSinceSent)}秒後に可能です。` })
            }
            await fastify.prisma.emailVerificationCode.delete({ where: { id: existing.id } })
        }

        const code = generateCode()
        const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000)
        await fastify.prisma.emailVerificationCode.create({ data: { userId: user.id, code, expiresAt } })
        await sendVerificationEmail(email, user.name, code)

        return reply.send({ message: 'Verification code resent' })
    })

    // POST /auth/login
    fastify.post('/auth/login', {
        schema: {
            body: loginSchema,
            response: { 200: authResponseSchema, 401: errorSchema, 403: errorSchema }
        }
    }, async (request, reply) => {
        const { email, password } = request.body as {
            email: string
            password: string
        }

        const user = await fastify.prisma.user.findUnique({
            where: { email },
            select: { id: true, name: true, email: true, role: true, password_hash: true, emailVerified: true }
        })

        if (!user || !user.password_hash) {
            return reply.code(401).send({ message: 'Invalid email or password' })
        }

        const valid = await bcrypt.compare(password, user.password_hash)
        if (!valid) {
            return reply.code(401).send({ message: 'Invalid email or password' })
        }

        if (!user.emailVerified) {
            return reply.code(403).send({ message: 'EMAIL_NOT_VERIFIED' })
        }

        const token = fastify.jwt.sign({ id: user.id, email: user.email })
        return reply.send({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
    })

    // POST /auth/change-password
    fastify.post('/auth/change-password', {
        preHandler: [fastify.authenticate],
        schema: {
            body: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                    currentPassword: { type: 'string' },
                    newPassword: { type: 'string', minLength: 8 }
                }
            },
            response: { 200: { type: 'object', properties: { message: { type: 'string' } } }, 401: errorSchema, 400: errorSchema }
        }
    }, async (request, reply) => {
        const { id } = request.user as { id: number }
        const { currentPassword, newPassword } = request.body as {
            currentPassword: string
            newPassword: string
        }

        const user = await fastify.prisma.user.findUnique({
            where: { id },
            select: { password_hash: true }
        })

        if (!user || !user.password_hash) {
            return reply.code(401).send({ message: 'パスワードが設定されていません' })
        }

        const valid = await bcrypt.compare(currentPassword, user.password_hash)
        if (!valid) {
            return reply.code(401).send({ message: '現在のパスワードが正しくありません' })
        }

        const password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
        await fastify.prisma.user.update({ where: { id }, data: { password_hash } })

        return reply.send({ message: 'パスワードを変更しました' })
    })

    // GET /me/clubs — returns clubs the authenticated user belongs to
    fastify.get('/me/clubs', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { id } = request.user as { id: number }

        const memberships = await fastify.prisma.clubUser.findMany({
            where: { userId: id, club: { status: 'ACTIVE' } },
            include: {
                club: { select: { id: true, name: true, createdAt: true, credit: true } },
                role: { select: { name: true } }
            }
        })

        return memberships.map((m) => ({
            id: m.club.id,
            name: m.club.name,
            createdAt: m.club.createdAt,
            credit: m.club.credit,
            role: m.role.name
        }))
    })

}
