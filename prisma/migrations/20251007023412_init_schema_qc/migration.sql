-- DropForeignKey
ALTER TABLE "public"."DailyEntry" DROP CONSTRAINT "DailyEntry_createdByUserId_fkey";

-- DropIndex
DROP INDEX "public"."DailyEntry_date_shift_idx";

-- AlterTable
ALTER TABLE "DailyEntry" ADD COLUMN     "line" TEXT,
ADD COLUMN     "plant" TEXT,
ADD COLUMN     "updatedByUserId" TEXT,
ALTER COLUMN "date" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "uom" TEXT;

-- CreateIndex
CREATE INDEX "DailyEntry_date_idx" ON "DailyEntry"("date");

-- CreateIndex
CREATE INDEX "DailyEntry_productId_date_shift_idx" ON "DailyEntry"("productId", "date", "shift");

-- CreateIndex
CREATE INDEX "DailyEntry_productId_date_plant_line_idx" ON "DailyEntry"("productId", "date", "plant", "line");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- AddForeignKey
ALTER TABLE "DailyEntry" ADD CONSTRAINT "DailyEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyEntry" ADD CONSTRAINT "DailyEntry_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
