-- AlterTable: remove identification_hint from Post
ALTER TABLE "Post" DROP COLUMN IF EXISTS "identification_hint";

-- AlterTable: add identification_hint and score to Identification
ALTER TABLE "Identification" ADD COLUMN IF NOT EXISTS "identification_hint" TEXT;
ALTER TABLE "Identification" ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION;
