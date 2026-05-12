import { Resend } from 'resend'
import { PrismaClient } from '../../../../generated/prisma/client'

function getResend() {
    return new Resend(process.env.RESEND_COM_API_KEY)
}

const FROM = process.env.MAIL_FROM ?? 'Mycologs <noreply@mycologs.club>'

export async function sendMail(to: string[], subject: string, html: string) {
    const valid = to.map(s => s.trim()).filter(Boolean)
    if (valid.length === 0) return
    await getResend().emails.send({ from: FROM, to: valid, subject, html })
}

export async function getAdminEmails(prisma: PrismaClient): Promise<string[]> {
    const rows = await prisma.siteSetting.findMany({
        where: { key: { in: ['adminEmail1', 'adminEmail2', 'adminEmail3'] } },
        select: { value: true }
    })
    return rows.map(r => r.value).filter(Boolean)
}

export async function getClubManagerEmails(prisma: PrismaClient, clubId: number): Promise<string[]> {
    const managerRole = await prisma.role.findUnique({ where: { name: 'CLUBMANAGER' } })
    if (!managerRole) return []
    const members = await prisma.clubUser.findMany({
        where: { clubId, roleId: managerRole.id },
        include: { user: { select: { email: true } } }
    })
    return members.map(m => m.user.email).filter(Boolean)
}
