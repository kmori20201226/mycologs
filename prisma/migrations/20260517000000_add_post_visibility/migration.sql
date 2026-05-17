-- CreateEnum (safe: no-op if already exists)
DO $$ BEGIN
    CREATE TYPE "PublicityType" AS ENUM ('PUBLIC', 'CLUBMEMBERONLY', 'PRIVATE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "visibility" "PublicityType" NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "post_clubs" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "club_id" INTEGER NOT NULL,

    CONSTRAINT "post_clubs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_clubs_post_id_club_id_key" ON "post_clubs"("post_id", "club_id");

-- AddForeignKey
ALTER TABLE "post_clubs" ADD CONSTRAINT "post_clubs_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_clubs" ADD CONSTRAINT "post_clubs_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
