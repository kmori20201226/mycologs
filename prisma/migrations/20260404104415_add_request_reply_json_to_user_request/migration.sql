/*
  Warnings:

  - You are about to drop the column `message` on the `user_requests` table. All the data in the column will be lost.
  - You are about to drop the column `reply_message` on the `user_requests` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "user_requests" DROP COLUMN "message",
DROP COLUMN "reply_message",
ADD COLUMN     "reply" JSONB,
ADD COLUMN     "request" JSONB;
