-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('POST', 'RESET');

-- CreateEnum
CREATE TYPE "RejectionCategory" AS ENUM ('OFFENSIVE_SEXUAL', 'POTENTIALLY_OFFENSIVE', 'OFF_TOPIC_IMAGE', 'NONE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "handle_name" TEXT;

-- CreateTable
CREATE TABLE "user_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "post_id" INTEGER,
    "followup_id" INTEGER,
    "point" INTEGER NOT NULL DEFAULT 0,
    "transaction_type" "TransactionType" NOT NULL,
    "rejection_category" "RejectionCategory",
    "user_post" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_log_user_id_created_at_idx" ON "user_log"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_log" ADD CONSTRAINT "user_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_log" ADD CONSTRAINT "user_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
