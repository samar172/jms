-- CreateEnum
CREATE TYPE "ProdStageName" AS ENUM ('Casting', 'Meenakari', 'Jadai', 'Setting', 'Fitting');

-- CreateEnum
CREATE TYPE "ProdJobStatus" AS ENUM ('Draft', 'InProduction', 'OnHold', 'Reconciliation', 'Closed');

-- CreateEnum
CREATE TYPE "ProdStageStatus" AS ENUM ('Pending', 'InProgress', 'Approved');

-- CreateEnum
CREATE TYPE "ProdIssueStatus" AS ENUM ('Issued', 'Reconciled');

-- CreateEnum
CREATE TYPE "ProdLabourBasis" AS ENUM ('WastagePct', 'PerGram', 'PerStone', 'Flat');

-- AlterTable
ALTER TABLE "Karigar" ADD COLUMN     "defaultFlatLabour" DECIMAL(12,2),
ADD COLUMN     "defaultRatePerGm" DECIMAL(12,2),
ADD COLUMN     "defaultWastagePct" DECIMAL(6,3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "designCode" TEXT;

-- AlterTable
ALTER TABLE "PurityTier" ADD COLUMN     "percent" DECIMAL(6,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BulkStockIssue" (
    "id" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "purityId" TEXT NOT NULL,
    "weightGrams" DECIMAL(12,3) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulkStockIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdJobCard" (
    "id" TEXT NOT NULL,
    "jobNo" TEXT NOT NULL,
    "itemMasterId" TEXT NOT NULL,
    "targetPurityId" TEXT NOT NULL,
    "status" "ProdJobStatus" NOT NULL DEFAULT 'InProduction',
    "pieceCount" INTEGER,
    "dueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "holdReason" TEXT,
    "manualSilverValue" DECIMAL(14,2),
    "todaysSilverRate" DECIMAL(12,2),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdJobCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdStage" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "stageName" "ProdStageName" NOT NULL,
    "status" "ProdStageStatus" NOT NULL DEFAULT 'Pending',
    "sequenceOrder" INTEGER NOT NULL,
    "approvedDate" TIMESTAMP(3),

    CONSTRAINT "ProdStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdAssignment" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdMaterialIssue" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "purityId" TEXT,
    "issuedWeight" DECIMAL(12,3),
    "issueDate" TIMESTAMP(3) NOT NULL,
    "status" "ProdIssueStatus" NOT NULL DEFAULT 'Issued',
    "returnedWeight" DECIMAL(12,3),
    "returnedPurityId" TEXT,
    "dustWeight" DECIMAL(12,3),
    "returnDate" TIMESTAMP(3),
    "fromBulkStock" BOOLEAN NOT NULL DEFAULT false,
    "pieceCount" INTEGER,
    "wastagePercent" DECIMAL(6,3),
    "wastageWeight" DECIMAL(12,3),
    "labourEntryId" TEXT,

    CONSTRAINT "ProdMaterialIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdStoneEntry" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qtyIssued" TEXT NOT NULL DEFAULT '',
    "valueIssued" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "piecesCount" INTEGER,
    "carat" DECIMAL(12,3),
    "ratePerCarat" DECIMAL(12,2),
    "qtyReturned" TEXT NOT NULL DEFAULT '',
    "valueReturned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "caratReturned" DECIMAL(12,3),

    CONSTRAINT "ProdStoneEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdLabourEntry" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "basis" "ProdLabourBasis" NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "purityId" TEXT,

    CONSTRAINT "ProdLabourEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdActivity" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "text" TEXT NOT NULL,

    CONSTRAINT "ProdActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdReversal" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "reversedFromClosedAt" TIMESTAMP(3),

    CONSTRAINT "ProdReversal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkStockIssue_karigarId_idx" ON "BulkStockIssue"("karigarId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdJobCard_jobNo_key" ON "ProdJobCard"("jobNo");

-- CreateIndex
CREATE INDEX "ProdJobCard_status_idx" ON "ProdJobCard"("status");

-- CreateIndex
CREATE INDEX "ProdStage_jobCardId_idx" ON "ProdStage"("jobCardId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdStage_jobCardId_stageName_key" ON "ProdStage"("jobCardId", "stageName");

-- CreateIndex
CREATE INDEX "ProdAssignment_stageId_idx" ON "ProdAssignment"("stageId");

-- CreateIndex
CREATE INDEX "ProdMaterialIssue_assignmentId_idx" ON "ProdMaterialIssue"("assignmentId");

-- CreateIndex
CREATE INDEX "ProdStoneEntry_assignmentId_idx" ON "ProdStoneEntry"("assignmentId");

-- CreateIndex
CREATE INDEX "ProdLabourEntry_assignmentId_idx" ON "ProdLabourEntry"("assignmentId");

-- CreateIndex
CREATE INDEX "ProdActivity_jobCardId_idx" ON "ProdActivity"("jobCardId");

-- AddForeignKey
ALTER TABLE "BulkStockIssue" ADD CONSTRAINT "BulkStockIssue_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkStockIssue" ADD CONSTRAINT "BulkStockIssue_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "PurityTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdJobCard" ADD CONSTRAINT "ProdJobCard_itemMasterId_fkey" FOREIGN KEY ("itemMasterId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdJobCard" ADD CONSTRAINT "ProdJobCard_targetPurityId_fkey" FOREIGN KEY ("targetPurityId") REFERENCES "PurityTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdJobCard" ADD CONSTRAINT "ProdJobCard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdStage" ADD CONSTRAINT "ProdStage_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "ProdJobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdAssignment" ADD CONSTRAINT "ProdAssignment_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProdStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdAssignment" ADD CONSTRAINT "ProdAssignment_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdMaterialIssue" ADD CONSTRAINT "ProdMaterialIssue_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProdAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdMaterialIssue" ADD CONSTRAINT "ProdMaterialIssue_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "PurityTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdMaterialIssue" ADD CONSTRAINT "ProdMaterialIssue_returnedPurityId_fkey" FOREIGN KEY ("returnedPurityId") REFERENCES "PurityTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdStoneEntry" ADD CONSTRAINT "ProdStoneEntry_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProdAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdLabourEntry" ADD CONSTRAINT "ProdLabourEntry_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProdAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdLabourEntry" ADD CONSTRAINT "ProdLabourEntry_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "PurityTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdActivity" ADD CONSTRAINT "ProdActivity_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "ProdJobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdReversal" ADD CONSTRAINT "ProdReversal_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "ProdJobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

