-- CreateTable
CREATE TABLE "ai_usage_log" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cache_creation_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micro_usd" INTEGER NOT NULL,
    "post_id" INTEGER,
    "user_id" INTEGER,
    "club_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_log_created_at_idx" ON "ai_usage_log"("created_at");

-- CreateIndex
CREATE INDEX "ai_usage_log_club_id_created_at_idx" ON "ai_usage_log"("club_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_log_user_id_created_at_idx" ON "ai_usage_log"("user_id", "created_at");

-- RenameForeignKey
ALTER TABLE "payments" RENAME CONSTRAINT "payments_subscriptionId_fkey" TO "payments_subscription_id_fkey";

-- RenameForeignKey
ALTER TABLE "subscriptions" RENAME CONSTRAINT "subscriptions_userId_fkey" TO "subscriptions_user_id_fkey";

-- RenameIndex
ALTER INDEX "payments_provider_providerRef_idx" RENAME TO "payments_provider_provider_ref_idx";

-- RenameIndex
ALTER INDEX "payments_subscriptionId_idx" RENAME TO "payments_subscription_id_idx";

-- RenameIndex
ALTER INDEX "subscriptions_userId_idx" RENAME TO "subscriptions_user_id_idx";
