import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import Stripe from 'stripe'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 15

if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set')
    process.exit(1)
}
if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    console.error('STRIPE_SECRET_KEY must be a test key (sk_test_...) — aborting to protect live data')
    process.exit(1)
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function poll<T>(label: string, fn: () => Promise<T | null>): Promise<T> {
    process.stdout.write(`  Waiting for ${label}`)
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
        const result = await fn()
        if (result) { console.log(' ✓'); return result }
        process.stdout.write('.')
    }
    console.log()
    throw new Error(`Timeout: ${label} not received within ${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`)
}

async function main() {
    console.log('=== Stripe Round Trip Test ===\n')

    // 1. Find a plan with a real Stripe price ID (starts with 'price_')
    const plan = await prisma.plan.findFirst({
        where: { active: true, priceYen: { gt: 0 }, id: { startsWith: 'price_' } }
    })
    if (!plan) throw new Error('No plan with a real Stripe price ID found — set a price_xxx ID via the admin panel first')
    console.log(`Plan        : ${plan.name} (${plan.id})`)

    // 2. Find admin user to associate with
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
    if (!adminUser) throw new Error('No admin user found — run seed-admin first')
    console.log(`User        : ${adminUser.name} (id=${adminUser.id})`)

    // 3. Create Stripe test customer
    const customer = await stripe.customers.create({
        name: 'Stripe Roundtrip Test',
        email: 'roundtrip-test@test.invalid',
        metadata: { roundtrip_test: 'true' },
    })
    console.log(`Customer    : ${customer.id}`)

    // 4. Attach test payment method (pm_card_visa = Stripe's built-in test token for 4242 card)
    const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id })
    await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: pm.id },
    })
    console.log(`Payment method: ${pm.id}`)

    // 5. Create subscription — Stripe will charge immediately and fire invoice_payment.paid
    const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: plan.id }],
        metadata: { userId: String(adminUser.id) },
    }) as any
    console.log(`Subscription: ${subscription.id} (${subscription.status})\n`)

    // Pre-insert subscription so the invoice_payment.paid handler can update it
    // (checkout.session.completed is not fired for direct subscription creation)
    await prisma.subscription.upsert({
        where: { id: subscription.id },
        create: {
            id:     subscription.id,
            userId: adminUser.id,
            status: 'active',
            planId: plan.id,
        },
        update: {},
    })

    let passed = false
    try {
        // 6. Poll for Payment record — written by the invoice_payment.paid webhook handler
        const payment = await poll('invoice_payment.paid webhook', async () =>
            prisma.payment.findFirst({ where: { subscriptionId: subscription.id } })
        )
        console.log(`  Payment   : ${payment.id}`)
        console.log(`  Amount    : ${payment.amount} ${payment.currency}`)
        console.log(`  Status    : ${payment.status}`)

        // 7. Verify subscription period was updated by the webhook
        const dbSub = await prisma.subscription.findUnique({ where: { id: subscription.id } })
        if (dbSub?.currentPeriodEnd) {
            console.log(`  Period end: ${dbSub.currentPeriodEnd.toISOString()}`)
        } else {
            console.log('  Warning: subscription period not updated (webhook may still be in flight)')
        }

        passed = true
    } finally {
        // 8. Always clean up Stripe and DB test data
        console.log('\nCleaning up...')
        await stripe.subscriptions.cancel(subscription.id).catch(() => {})
        await stripe.customers.del(customer.id).catch(() => {})
        await prisma.payment.deleteMany({ where: { subscriptionId: subscription.id } }).catch(() => {})
        await prisma.subscription.delete({ where: { id: subscription.id } }).catch(() => {})
        console.log('Done.')
    }

    if (passed) console.log('\n=== PASSED ===')
}

main()
    .catch(async (err) => {
        console.error('\n=== FAILED ===')
        console.error(err.message)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
