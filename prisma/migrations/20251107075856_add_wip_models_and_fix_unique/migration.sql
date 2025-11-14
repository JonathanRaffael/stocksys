/*
  Warnings:

  - A unique constraint covering the columns `[productId,date,shift,plant,line]` on the table `DailyEntry` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('BEFORE_IPQC', 'AFTER_IPQC_BEFORE_POSTCURED', 'AFTER_POSTCURED');

-- DropIndex
DROP INDEX "public"."DailyEntry_productId_date_shift_key";

-- CreateTable
CREATE TABLE "WipStock" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "plant" TEXT,
    "line" TEXT,
    "stage" "Stage" NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WipStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WipMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "plant" TEXT,
    "line" TEXT,
    "fromStage" "Stage",
    "toStage" "Stage",
    "qty" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "shift" "Shift" NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WipMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WipStock_productId_stage_idx" ON "WipStock"("productId", "stage");

-- CreateIndex
CREATE INDEX "WipStock_plant_line_idx" ON "WipStock"("plant", "line");

-- CreateIndex
CREATE UNIQUE INDEX "WipStock_productId_plant_line_stage_key" ON "WipStock"("productId", "plant", "line", "stage");

-- CreateIndex
CREATE INDEX "WipMovement_productId_date_shift_idx" ON "WipMovement"("productId", "date", "shift");

-- CreateIndex
CREATE INDEX "WipMovement_fromStage_idx" ON "WipMovement"("fromStage");

-- CreateIndex
CREATE INDEX "WipMovement_toStage_idx" ON "WipMovement"("toStage");

-- CreateIndex
CREATE INDEX "WipMovement_plant_line_idx" ON "WipMovement"("plant", "line");

-- CreateIndex
CREATE UNIQUE INDEX "DailyEntry_productId_date_shift_plant_line_key" ON "DailyEntry"("productId", "date", "shift", "plant", "line");

-- AddForeignKey
ALTER TABLE "WipStock" ADD CONSTRAINT "WipStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WipMovement" ADD CONSTRAINT "WipMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WipMovement" ADD CONSTRAINT "WipMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
