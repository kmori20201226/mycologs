-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "taken_at" TIMESTAMP(3);
