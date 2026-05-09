-- Rename camelCase columns in subscriptions to snake_case (data-safe: RENAME COLUMN only)
ALTER TABLE "subscriptions" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "subscriptions" RENAME COLUMN "planId" TO "plan_id";
ALTER TABLE "subscriptions" RENAME COLUMN "currentPeriodStart" TO "current_period_start";
ALTER TABLE "subscriptions" RENAME COLUMN "currentPeriodEnd" TO "current_period_end";
ALTER TABLE "subscriptions" RENAME COLUMN "cancelAtPeriodEnd" TO "cancel_at_period_end";
ALTER TABLE "subscriptions" RENAME COLUMN "canceledAt" TO "canceled_at";
ALTER TABLE "subscriptions" RENAME COLUMN "trialStart" TO "trial_start";
ALTER TABLE "subscriptions" RENAME COLUMN "trialEnd" TO "trial_end";
ALTER TABLE "subscriptions" RENAME COLUMN "accessUntil" TO "access_until";
ALTER TABLE "subscriptions" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "subscriptions" RENAME COLUMN "updatedAt" TO "updated_at";

-- Rename camelCase columns in payments to snake_case (data-safe: RENAME COLUMN only)
ALTER TABLE "payments" RENAME COLUMN "subscriptionId" TO "subscription_id";
ALTER TABLE "payments" RENAME COLUMN "providerRef" TO "provider_ref";
ALTER TABLE "payments" RENAME COLUMN "paidAt" TO "paid_at";
ALTER TABLE "payments" RENAME COLUMN "createdAt" TO "created_at";
