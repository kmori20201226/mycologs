-- Add credit and timestamps to clubs
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "credit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Add credit and deleted_at to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "credit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Create enums
DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'unpaid', 'canceled', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('paid', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create Subscription table
CREATE TABLE IF NOT EXISTS "Subscription" (
  "id"                    TEXT         NOT NULL,
  "userId"                INTEGER,
  "club_id"               INTEGER,
  "status"                "SubscriptionStatus" NOT NULL,
  "planId"                TEXT         NOT NULL,
  "currentPeriodStart"    TIMESTAMP(3),
  "currentPeriodEnd"      TIMESTAMP(3),
  "cancelAtPeriodEnd"     BOOLEAN      NOT NULL DEFAULT false,
  "canceledAt"            TIMESTAMP(3),
  "trialStart"            TIMESTAMP(3),
  "trialEnd"              TIMESTAMP(3),
  "accessUntil"           TIMESTAMP(3),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Subscription_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX IF NOT EXISTS "Subscription_club_id_idx" ON "Subscription"("club_id");
CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status");

-- Create Payment table
CREATE TABLE IF NOT EXISTS "Payment" (
  "id"              TEXT         NOT NULL,
  "user_id"         INTEGER,
  "club_id"         INTEGER,
  "subscriptionId"  TEXT,
  "amount"          INTEGER      NOT NULL,
  "currency"        TEXT         NOT NULL,
  "status"          "PaymentStatus" NOT NULL,
  "provider"        TEXT         NOT NULL,
  "providerRef"     TEXT,
  "paidAt"          TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Payment_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Payment_user_id_idx" ON "Payment"("user_id");
CREATE INDEX IF NOT EXISTS "Payment_club_id_idx" ON "Payment"("club_id");
CREATE INDEX IF NOT EXISTS "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");
CREATE INDEX IF NOT EXISTS "Payment_provider_providerRef_idx" ON "Payment"("provider", "providerRef");
