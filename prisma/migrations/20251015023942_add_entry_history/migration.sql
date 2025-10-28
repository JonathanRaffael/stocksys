-- CreateEnum
CREATE TYPE "HistoryAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- DropForeignKey
ALTER TABLE "public"."DailyEntry" DROP CONSTRAINT "DailyEntry_createdByUserId_fkey";

-- CreateTable
CREATE TABLE "EntryHistory" (
    "id" TEXT NOT NULL,
    "dailyEntryId" TEXT,
    "productId" TEXT,
    "productCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shift" "Shift" NOT NULL,
    "action" "HistoryAction" NOT NULL,
    "byUserId" TEXT NOT NULL,
    "byRole" "Role" NOT NULL,
    "note" TEXT,
    "changes" JSONB,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntryHistory_byUserId_createdAt_idx" ON "EntryHistory"("byUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EntryHistory_productId_date_shift_idx" ON "EntryHistory"("productId", "date", "shift");

-- CreateIndex
CREATE INDEX "EntryHistory_productCode_idx" ON "EntryHistory"("productCode");

-- CreateIndex
CREATE INDEX "EntryHistory_date_idx" ON "EntryHistory"("date");

-- CreateIndex
CREATE INDEX "EntryHistory_action_idx" ON "EntryHistory"("action");

-- CreateIndex
CREATE INDEX "EntryHistory_dailyEntryId_idx" ON "EntryHistory"("dailyEntryId");

-- AddForeignKey
ALTER TABLE "DailyEntry" ADD CONSTRAINT "DailyEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryHistory" ADD CONSTRAINT "EntryHistory_dailyEntryId_fkey" FOREIGN KEY ("dailyEntryId") REFERENCES "DailyEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryHistory" ADD CONSTRAINT "EntryHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryHistory" ADD CONSTRAINT "EntryHistory_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
