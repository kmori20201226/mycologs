import { PrismaClient } from '../../../../generated/prisma/client'

type PrismaLike = Pick<PrismaClient, 'subscription'>

export async function hasActiveAccess(
    prisma: PrismaLike,
    opts: { userId?: number; clubId?: number }
): Promise<boolean> {
    const now = new Date()
    const sub = await prisma.subscription.findFirst({
        where: {
            ...(opts.userId != null ? { userId: opts.userId } : { clubId: opts.clubId }),
            status: { in: ['active', 'trialing'] },
            accessUntil: { gte: now },
        },
        select: { id: true },
    })
    return sub !== null
}
