-- AlterTable
ALTER TABLE "Identification" ALTER COLUMN "specie_id" DROP NOT NULL;
ALTER TABLE "Identification" ADD COLUMN "accepted" BOOLEAN NOT NULL DEFAULT false;

-- DropForeignKey (re-add with SET NULL)
ALTER TABLE "Identification" DROP CONSTRAINT "Identification_specie_id_fkey";
ALTER TABLE "Identification" ADD CONSTRAINT "Identification_specie_id_fkey"
  FOREIGN KEY ("specie_id") REFERENCES "Species"("id") ON DELETE SET NULL ON UPDATE CASCADE;
