-- Add Edibility enum
DO $$ BEGIN
  CREATE TYPE "Edibility" AS ENUM ('EDIBLE', 'INEDIBLE', 'TOXIC', 'DEADLY', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Shape: add japanese_name
ALTER TABLE "Shape" ADD COLUMN "japanese_name" TEXT;

-- Family: add scientific_name (nullable), copy from name, make NOT NULL, drop name, add japanese_name
ALTER TABLE "Family" ADD COLUMN "scientific_name" TEXT;
UPDATE "Family" SET "scientific_name" = "name";
ALTER TABLE "Family" ALTER COLUMN "scientific_name" SET NOT NULL;
ALTER TABLE "Family" DROP COLUMN "name";
ALTER TABLE "Family" ADD COLUMN "japanese_name" TEXT;
ALTER TABLE "Family" ADD CONSTRAINT "Family_scientific_name_key" UNIQUE ("scientific_name");

-- Genus: add scientific_name (nullable), copy from name, make NOT NULL, drop name, add japanese_name
ALTER TABLE "Genus" ADD COLUMN "scientific_name" TEXT;
UPDATE "Genus" SET "scientific_name" = "name";
ALTER TABLE "Genus" ALTER COLUMN "scientific_name" SET NOT NULL;
ALTER TABLE "Genus" DROP COLUMN "name";
ALTER TABLE "Genus" ADD COLUMN "japanese_name" TEXT;
ALTER TABLE "Genus" ADD CONSTRAINT "Genus_scientific_name_key" UNIQUE ("scientific_name");

-- Species: add scientific_name (nullable), copy from name, make NOT NULL, drop name, add new fields
ALTER TABLE "Species" ADD COLUMN "scientific_name" TEXT;
UPDATE "Species" SET "scientific_name" = "name";
ALTER TABLE "Species" ALTER COLUMN "scientific_name" SET NOT NULL;
ALTER TABLE "Species" DROP COLUMN "name";
ALTER TABLE "Species" ADD COLUMN "japanese_name" TEXT;
ALTER TABLE "Species" ADD COLUMN "gbif_taxon_key" INTEGER;
ALTER TABLE "Species" ADD COLUMN "edibility" "Edibility";
ALTER TABLE "Species" ADD CONSTRAINT "Species_scientific_name_key" UNIQUE ("scientific_name");
ALTER TABLE "Species" ADD CONSTRAINT "Species_gbif_taxon_key_key" UNIQUE ("gbif_taxon_key");
