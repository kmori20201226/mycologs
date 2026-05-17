-- AlterTable
ALTER TABLE "posts" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';

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
