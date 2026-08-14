-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "CashBankAccount" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "CashBankEntryType" AS ENUM ('INVOICE_PAID', 'KARIGAR_PAYMENT', 'ADVANCE_RECEIVED', 'PURCHASE', 'MANUAL');

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "grossWeightG" DECIMAL(10,3),
ADD COLUMN     "pieces" INTEGER DEFAULT 1;

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN     "dispatchDate" TIMESTAMP(3),
ADD COLUMN     "dispatchMode" TEXT,
ADD COLUMN     "dispatchTracking" TEXT,
ADD COLUMN     "dispatchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MaterialReceipt" ADD COLUMN     "approvedLossWeightG" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "chizzatPct" DECIMAL(6,2),
ADD COLUMN     "chizzatWeightG" DECIMAL(10,3),
ADD COLUMN     "goldScrapWeightG" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "nonGoldInPieceWeightG" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "otherNonGoldWeightG" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "overAccounted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rawGapG" DECIMAL(10,3),
ADD COLUMN     "stoneReturnedNote" TEXT,
ADD COLUMN     "stoneReturnedWeightG" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "waxWireWeightG" DECIMAL(10,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "invoiceAmount" DECIMAL(12,2),
ADD COLUMN     "invoiceGstAmt" DECIMAL(12,2),
ADD COLUMN     "invoiceNetAmt" DECIMAL(12,2),
ADD COLUMN     "invoiceNo" TEXT,
ADD COLUMN     "invoicedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "compositionTemplate" JSONB,
ADD COLUMN     "wastageRuleJson" JSONB;

-- AlterTable
ALTER TABLE "WastageRecord" ADD COLUMN     "overAccounted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rawGapG" DECIMAL(10,3);

-- CreateTable
CREATE TABLE "CostingEditLog" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValueJson" TEXT NOT NULL,
    "newValueJson" TEXT NOT NULL,
    "fmt" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostingEditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashBankLedgerEntry" (
    "id" TEXT NOT NULL,
    "account" "CashBankAccount" NOT NULL,
    "entryType" "CashBankEntryType" NOT NULL DEFAULT 'MANUAL',
    "description" TEXT NOT NULL,
    "inAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "orderId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashBankLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostingEditLog_estimateId_editedAt_idx" ON "CostingEditLog"("estimateId", "editedAt");

-- CreateIndex
CREATE INDEX "CashBankLedgerEntry_account_createdAt_idx" ON "CashBankLedgerEntry"("account", "createdAt");

-- CreateIndex
CREATE INDEX "CashBankLedgerEntry_entryType_createdAt_idx" ON "CashBankLedgerEntry"("entryType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoiceNo_key" ON "Order"("invoiceNo");

-- CreateIndex
CREATE INDEX "Order_invoiceNo_idx" ON "Order"("invoiceNo");

-- AddForeignKey
ALTER TABLE "CostingEditLog" ADD CONSTRAINT "CostingEditLog_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostingEditLog" ADD CONSTRAINT "CostingEditLog_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashBankLedgerEntry" ADD CONSTRAINT "CashBankLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
