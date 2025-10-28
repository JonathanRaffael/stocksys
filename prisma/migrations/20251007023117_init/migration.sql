-- CreateEnum
CREATE TYPE "Role" AS ENUM ('IPQC', 'OQC', 'MASTER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('S1', 'S2', 'S3');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "computerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyEntry" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shift" "Shift" NOT NULL,
    "beforeIpqc" INTEGER NOT NULL DEFAULT 0,
    "afterIpqc" INTEGER NOT NULL DEFAULT 0,
    "onGoingPostcured" INTEGER NOT NULL DEFAULT 0,
    "afterPostcured" INTEGER NOT NULL DEFAULT 0,
    "beforeOqc" INTEGER NOT NULL DEFAULT 0,
    "afterOqc" INTEGER NOT NULL DEFAULT 0,
    "onHoldOrReturn" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "createdByRole" "Role" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_computerCode_key" ON "Product"("computerCode");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_computerCode_idx" ON "Product"("computerCode");

-- CreateIndex
CREATE INDEX "DailyEntry_productId_date_idx" ON "DailyEntry"("productId", "date");

-- CreateIndex
CREATE INDEX "DailyEntry_date_shift_idx" ON "DailyEntry"("date", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "DailyEntry_productId_date_shift_key" ON "DailyEntry"("productId", "date", "shift");

-- AddForeignKey
ALTER TABLE "DailyEntry" ADD CONSTRAINT "DailyEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyEntry" ADD CONSTRAINT "DailyEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
