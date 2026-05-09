import { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { SubscriptionStatus, PaymentStatus } from '../../../../generated/prisma/client'

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })
    : null
const WEBHOOK_SECRET          = process.env.STRIPE_WEBHOOK_SECRET ?? ''

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

function resolveOwnerFromMeta(meta: Record<string, string> | null | undefined) {
    if (!meta) return null
    const clubId  = meta.clubId  ? Number(meta.clubId)  : null
    const userId  = meta.userId  ? Number(meta.userId)  : null
    if (clubId)  return { userId: null  as null,   clubId }
    if (userId)  return { userId,        clubId: null as null }
    return null
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

        if (!stripe) {
            return reply.code(400).send({ error: 'Stripe not configured' })
        }

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

                    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId) as any
                    const owner =
                        resolveOwnerFromMeta(stripeSub.metadata) ??
                        await resolveOwner(prisma, customerId)
                    if (!owner) {
                        fastify.log.warn(`checkout.session.completed: unknown customer ${customerId}`)
                        break
                    }

                    const trialStart   = stripeSub.trial_start       ? new Date(stripeSub.trial_start       * 1000) : null
                    const trialEnd     = stripeSub.trial_end         ? new Date(stripeSub.trial_end         * 1000) : null
                    const periodStart  = stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : null
                    const periodEnd    = stripeSub.current_period_end   ? new Date(stripeSub.current_period_end   * 1000) : null

                    await prisma.subscription.upsert({
                        where: { id: stripeSubId },
                        create: {
                            id:                 stripeSubId,
                            userId:             owner.userId,
                            clubId:             owner.clubId,
                            status:             mapStatus(stripeSub.status),
                            planId:             stripeSub.items.data[0]?.price.id ?? '',
                            cancelAtPeriodEnd:  stripeSub.cancel_at_period_end,
                            trialStart,
                            trialEnd,
                            currentPeriodStart: periodStart,
                            currentPeriodEnd:   periodEnd,
                            accessUntil:        periodEnd,
                        },
                        update: {
                            userId:             owner.userId,
                            clubId:             owner.clubId,
                            status:             mapStatus(stripeSub.status),
                            cancelAtPeriodEnd:  stripeSub.cancel_at_period_end,
                            currentPeriodStart: periodStart,
                            currentPeriodEnd:   periodEnd,
                            accessUntil:        periodEnd,
                        }
                    })

                    break
                }

                // ── Recurring payment succeeded (v2026+: InvoicePayment object) ──
                case 'invoice_payment.paid': {
                    // obj is InvoicePayment — no customer/subscription on the object itself.
                    // Retrieve the parent invoice to get those fields.
                    const invoiceId = typeof obj.invoice === 'string' ? obj.invoice : (obj.invoice as any)?.id
                    fastify.log.info({ invoicePaymentId: obj.id, invoiceId }, 'invoice_payment.paid received')
                    if (!invoiceId) { fastify.log.warn('invoice_payment.paid: no invoiceId'); break }

                    const invoice = await stripe.invoices.retrieve(invoiceId) as any
                    const stripeSubId: string | null =
                        invoice.parent?.subscription_details?.subscription
                        ?? invoice.subscription
                        ?? null
                    const customerId = invoice.customer as string
                    fastify.log.info({ stripeSubId, customerId }, 'invoice_payment.paid: invoice retrieved')
                    if (!stripeSubId) { fastify.log.warn('invoice_payment.paid: stripeSubId is null, skipping'); break }

                    // Prefer subscription metadata (set at checkout) over customer lookup
                    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId) as any
                    const owner =
                        resolveOwnerFromMeta(stripeSub.metadata) ??
                        await resolveOwner(prisma, customerId)
                    fastify.log.info({ owner }, 'invoice_payment.paid: owner resolved')
                    if (!owner) { fastify.log.warn(`invoice_payment.paid: no owner for customer ${customerId}`); break }

                    const periodStart = invoice.period_start ? new Date(invoice.period_start * 1000) : null
                    const periodEnd   = invoice.period_end   ? new Date(invoice.period_end   * 1000) : null

                    await prisma.subscription.update({
                        where: { id: stripeSubId },
                        data: {
                            status:             SubscriptionStatus.active,
                            currentPeriodStart: periodStart,
                            currentPeriodEnd:   periodEnd,
                            accessUntil:        periodEnd,
                        }
                    }).catch(() => {})

                    // v2026: price moved to line.pricing.price_details.price
                    const linePrice = invoice.lines?.data?.[0]?.pricing?.price_details?.price
                    const planId: string = (typeof linePrice === 'string' ? linePrice : linePrice?.id) ?? ''
                    fastify.log.info({ planId }, 'invoice_payment.paid: resolved planId')
                    const plan = planId ? await prisma.plan.findUnique({ where: { id: planId } }) : null
                    const creditAmount = plan?.creditsPerPeriod ?? 0
                    if (creditAmount > 0) {
                        if (owner.userId) {
                            await prisma.user.update({ where: { id: owner.userId }, data: { credit: creditAmount } }).catch(() => {})
                        } else if (owner.clubId) {
                            await prisma.club.update({ where: { id: owner.clubId }, data: { credit: creditAmount } }).catch(() => {})
                        }
                    }

                    const chargeId = typeof obj.payment?.charge === 'string' ? obj.payment.charge : (obj.payment?.charge as any)?.id ?? null
                    const paidAt   = obj.status_transitions?.paid_at
                        ? new Date(obj.status_transitions.paid_at * 1000)
                        : new Date()

                    fastify.log.info({ invoicePaymentId: obj.id, stripeSubId, planId }, 'invoice_payment.paid: upserting payment')
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

                // ── Recurring payment succeeded (legacy Invoice object) ────────
                case 'invoice.payment_succeeded': {
                    // In Stripe API v2026+, subscription moved to parent.subscription_details.subscription
                    const stripeSubId: string | null =
                        obj.parent?.subscription_details?.subscription
                        ?? obj.subscription
                        ?? null
                    const customerId   = obj.customer as string
                    fastify.log.info({ stripeSubId, customerId, parentType: obj.parent?.type, invoiceId: obj.id }, 'invoice.payment_succeeded received')
                    if (!stripeSubId) { fastify.log.warn('invoice.payment_succeeded: stripeSubId is null, skipping'); break }

                    const legacySub = await stripe.subscriptions.retrieve(stripeSubId) as any
                    const owner =
                        resolveOwnerFromMeta(legacySub.metadata) ??
                        await resolveOwner(prisma, customerId)
                    fastify.log.info({ owner }, 'invoice.payment_succeeded: owner resolved')
                    if (!owner) { fastify.log.warn(`invoice.payment_succeeded: no owner for customer ${customerId}`); break }

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

                    const legacyLinePrice = obj.lines?.data?.[0]?.pricing?.price_details?.price
                        ?? obj.lines?.data?.[0]?.price
                    const planId: string = (typeof legacyLinePrice === 'string' ? legacyLinePrice : legacyLinePrice?.id) ?? ''
                    const plan = planId ? await prisma.plan.findUnique({ where: { id: planId } }) : null
                    const creditAmount = plan?.creditsPerPeriod ?? 0
                    if (creditAmount > 0) {
                        if (owner.userId) {
                            await prisma.user.update({ where: { id: owner.userId }, data: { credit: creditAmount } }).catch(() => {})
                        } else if (owner.clubId) {
                            await prisma.club.update({ where: { id: owner.clubId }, data: { credit: creditAmount } }).catch(() => {})
                        }
                    }

                    fastify.log.info({ invoiceId: obj.id, stripeSubId, planId }, 'invoice.payment_succeeded: upserting payment')
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
                    const stripeSubId: string | null =
                        obj.parent?.subscription_details?.subscription
                        ?? obj.subscription
                        ?? null
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
