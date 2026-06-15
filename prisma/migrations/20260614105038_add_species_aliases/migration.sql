-- CreateTable
CREATE TABLE "species_aliases" (
    "id" SERIAL NOT NULL,
    "species_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "species_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "species_aliases_name_key" ON "species_aliases"("name");

-- CreateIndex
CREATE INDEX "species_aliases_species_id_idx" ON "species_aliases"("species_id");

-- AddForeignKey
ALTER TABLE "species_aliases" ADD CONSTRAINT "species_aliases_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE CASCADE ON UPDATE CASCADE;
