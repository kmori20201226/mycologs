-- Add parent_post_id self-reference on posts
ALTER TABLE "posts" ADD COLUMN "parent_post_id" INTEGER;
ALTER TABLE "posts" ADD CONSTRAINT "posts_parent_post_id_fkey" FOREIGN KEY ("parent_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Remove followup_id from user_log
ALTER TABLE "user_log" DROP COLUMN IF EXISTS "followup_id";

-- Drop followups table
DROP TABLE IF EXISTS "followups";
