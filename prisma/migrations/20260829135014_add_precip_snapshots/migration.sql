-- CreateTable
CREATE TABLE "precip_grids" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "lon_px" DOUBLE PRECISION NOT NULL,
    "lon_py" DOUBLE PRECISION NOT NULL,
    "lon_c" DOUBLE PRECISION NOT NULL,
    "lat_px" DOUBLE PRECISION NOT NULL,
    "lat_py" DOUBLE PRECISION NOT NULL,
    "lat_c" DOUBLE PRECISION NOT NULL,
    "block_size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bands" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "precip_grids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precip_snapshots" (
    "id" SERIAL NOT NULL,
    "grid_id" INTEGER NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "cells" BYTEA NOT NULL,
    "max_band" INTEGER NOT NULL,
    "echo_cells" INTEGER NOT NULL,
    "image_sha256" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "precip_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "precip_snapshots_observed_at_idx" ON "precip_snapshots"("observed_at");

-- CreateIndex
CREATE INDEX "precip_snapshots_grid_id_max_band_idx" ON "precip_snapshots"("grid_id", "max_band");

-- CreateIndex
CREATE UNIQUE INDEX "precip_snapshots_grid_id_observed_at_key" ON "precip_snapshots"("grid_id", "observed_at");

-- AddForeignKey
ALTER TABLE "precip_snapshots" ADD CONSTRAINT "precip_snapshots_grid_id_fkey" FOREIGN KEY ("grid_id") REFERENCES "precip_grids"("id") ON DELETE CASCADE ON UPDATE CASCADE;
