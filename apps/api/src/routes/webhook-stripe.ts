import { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { SubscriptionStatus, PaymentStatus } from '../../../../generated/prisma/client'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-04-22.dahlia' })
const WEBHOOK_SECRET          = process.env.STRIPE_WEBHOOK_SECRET ?? ''
const PRICE_PERSONAL          = process.env.STRIPE_PRICE_PERSONAL ?? ''
const PRICE_CLUB              = process.env.STRIPE_PRICE_CLUB ?? ''
const PERSONAL_PLAN_CREDITS   = Number(process.env.PERSONAL_PLAN_CREDITS ?? 1000)
const CLUB_PLAN_CREDITS       = Number(process.env.CLUB_PLAN_CREDITS ?? 20000)

function mapStatus(s: string): SubscriptionStatus {
    const map: Record<string, SubscriptionStatus> = {
        trialing:           SubscriptionStatus.trialing,
        active:             SubscriptionStatus.active,
        past_due:           SubscriptionStatus.past_due,
        unpaid:             SubscriptionStatus.unpaid,
        canceled:           SubscriptionStatus.canceled,
        incomplete:         SubscriptionStatus.inactive,
        incomplete_expired: SubscriptionStatus.inactive,
        paused:             SubscriptionStatus.inactive,
    }
    return map[s] ?? SubscriptionStatus.inactive
}

async function resolveOwner(prisma: any, customerId: string) {
    const user = await prisma.user.findUnique({
        where: { stripeCustomerId: customerId },
        select: { id: true }
    })
    if (user) return { userId: user.id as number, clubId: null as null }

    const club = await prisma.club.findUnique({
        where: { stripeCustomerId: customerId },
        select: { id: true }
    })
    if (club) return { userId: null as null, clubId: club.id as number }

    return null
}

export default async function (fastify: FastifyInstance) {

    fastify.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer', bodyLimit: 1048576 },
        (_req, body, done) => done(null, body)
    )

    fastify.post('/webhooks/stripe', async (request, reply) => {
        const sig = request.headers['stripe-signature'] as string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let event: any

        try {
            event = stripe.webhooks.constructEvent(request.body as Buffer, sig, WEBHOOK_SECRET)
        } catch (err: any) {
            fastify.log.warn(`Stripe webhook signature verification failed: ${err.message}`)
            return reply.code(400).send({ error: 'Invalid signature' })
        }

        const prisma = fastify.prisma
        const obj = event.data.object as any

        try {
            switch (event.type) {

                // ── New checkout completed ─────────────────────────────────────
                case 'checkout.session.completed': {
                    if (obj.mode !== 'subscription') break

                    const customerId  = obj.customer as string
                    const stripeSubId = obj.subscription as string
                    const owner = await resolveOwner(prisma, customerId)
                    if (!owner) {
                        fastify.log.warn(`checkout.session.completed: unknown customer ${customerId}`)
                        break
                    }

                    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId) as any
                    const trialStart = stripeSub.trial_start ? new Date(stripeSub.trial_start * 1000) : null
                    const trialEnd   = stripeSub.trial_end   ? new Date(stripeSub.trial_end   * 1000) : null

                    await prisma.subscription.upsert({
                        where: { id: stripeSubId },
                        create: {
                            id:                stripeSubId,
                            userId:            owner.userId,
                            clubId:            owner.clubId,
                            status:            mapStatus(stripeSub.status),
                            planId:            stripeSub.items.data[0]?.price.id ?? '',
                            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
                            trialStart,
                            trialEnd,
                        },
                        update: {
                            status:            mapStatus(stripeSub.status),
                            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
                        }
                    })
                    break
                }

                // ── Recurring payment succeeded ────────────────────────────────
                case 'invoice.payment_succeeded': {
                    const stripeSubId  = obj.subscription as string | null
                    const customerId   = obj.customer as string
                    if (!stripeSubId) break

                    const owner = await resolveOwner(prisma, customerId)
                    if (!owner) break

                    // Invoice carries period_start / period_end in v22
                    const periodStart = obj.period_start ? new Date(obj.period_start * 1000) : null
                    const periodEnd   = obj.period_end   ? new Date(obj.period_end   * 1000) : null

                    await prisma.subscription.update({
                        where: { id: stripeSubId },
                        data: {
                            status:             SubscriptionStatus.active,
                            currentPeriodStart: periodStart,
                            currentPeriodEnd:   periodEnd,
                            accessUntil:        periodEnd,
                        }
                    }).catch(() => {})

                    // Top up credits based on plan
                    const planId = obj.lines?.data?.[0]?.price?.id ?? ''
                    if (owner.userId) {
                        const creditAmount = planId === PRICE_PERSONAL ? PERSONAL_PLAN_CREDITS : 0
                        if (creditAmount > 0) {
                            await prisma.user.update({
                                where: { id: owner.userId },
                                data:  { credit: { increment: creditAmount } },
                            }).catch(() => {})
                        }
                    } else if (owner.clubId) {
                        const creditAmount = planId === PRICE_CLUB ? CLUB_PLAN_CREDITS : 0
                        if (creditAmount > 0) {
                            await prisma.club.update({
                                where: { id: owner.clubId },
                                data:  { credit: { increment: creditAmount } },
                            }).catch(() => {})
                        }
                    }

                    // Record payment — idempotent via invoice id
                    const chargeId = typeof obj.charge === 'string' ? obj.charge : obj.charge?.id ?? null
                    const paidAt   = obj.status_transitions?.paid_at
                        ? new Date(obj.status_transitions.paid_at * 1000)
                        : new Date()

                    await prisma.payment.upsert({
                        where: { id: obj.id },
                        create: {
                            id:             obj.id,
                            userId:         owner.userId,
                            clubId:         owner.clubId,
                            subscriptionId: stripeSubId,
                            amount:         obj.amount_paid,
                            currency:       obj.currency,
                            status:         PaymentStatus.paid,
                            provider:       'stripe',
                            providerRef:    chargeId,
                            paidAt,
                        },
                        update: {}
                    })
                    break
                }

                // ── Payment failed ─────────────────────────────────────────────
                case 'invoice.payment_failed': {
                    const stripeSubId = obj.subscription as string | null
                    if (!stripeSubId) break

                    await prisma.subscription.update({
                        where: { id: stripeSubId },
                        data: { status: SubscriptionStatus.past_due }
                    }).catch(() => {})

                    const customerId = obj.customer as string
                    const owner = await resolveOwner(prisma, customerId)
                    if (owner) {
                        const chargeId = typeof obj.charge === 'string' ? obj.charge : obj.charge?.id ?? null
                        await prisma.payment.upsert({
                            where: { id: obj.id },
                            create: {
                                id:             obj.id,
                                userId:         owner.userId,
                                clubId:         owner.clubId,
                                subscriptionId: stripeSubId,
                                amount:         obj.amount_due,
                                currency:       obj.currency,
                                status:         PaymentStatus.failed,
                                provider:       'stripe',
                                providerRef:    chargeId,
                            },
                            update: {}
                        })
                    }
                    break
                }

                // ── Subscription updated ───────────────────────────────────────
                case 'customer.subscription.updated': {
                    const isCanceled = obj.status === 'canceled'
                    await prisma.subscription.update({
                        where: { id: obj.id },
                        data: {
                            status:            mapStatus(obj.status),
                            planId:            obj.items?.data[0]?.price.id ?? undefined,
                            ...(isCanceled && { accessUntil: new Date() }),
                            cancelAtPeriodEnd: obj.cancel_at_period_end,
                            canceledAt:        obj.canceled_at ? new Date(obj.canceled_at * 1000) : null,
                            trialStart:        obj.trial_start ? new Date(obj.trial_start * 1000) : null,
                            trialEnd:          obj.trial_end   ? new Date(obj.trial_end   * 1000) : null,
                        }
                    }).catch(() => {})
                    break
                }

                // ── Subscription deleted ───────────────────────────────────────
                case 'customer.subscription.deleted': {
                    await prisma.subscription.update({
                        where: { id: obj.id },
                        data: {
                            status:      SubscriptionStatus.canceled,
                            accessUntil: new Date(),
                            canceledAt:  new Date(),
                        }
                    }).catch(() => {})
                    break
                }

                default:
                    fastify.log.info(`Unhandled Stripe event: ${event.type}`)
            }
        } catch (err) {
            fastify.log.error(err, `Error handling Stripe event ${event.type}`)
            return reply.code(500).send({ error: 'Handler error' })
        }

        return reply.send({ received: true })
    })
}
