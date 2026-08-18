-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LabourRateBasis" ADD VALUE 'PERCENT_GOLD_MAKING';
ALTER TYPE "LabourRateBasis" ADD VALUE 'PERCENT_GOLD_STONE';
ALTER TYPE "LabourRateBasis" ADD VALUE 'LUMPSUM';

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN     "jobNo" TEXT;

-- CreateTable
CREATE TABLE "LabourRule" (
    "id" TEXT NOT NULL,
    "processStageId" TEXT NOT NULL,
    "calcBase" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "LabourRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabourRule_processStageId_key" ON "LabourRule"("processStageId");

-- CreateIndex
CREATE UNIQUE INDEX "JobCard_jobNo_key" ON "JobCard"("jobNo");

-- AddForeignKey
ALTER TABLE "LabourRule" ADD CONSTRAINT "LabourRule_processStageId_fkey" FOREIGN KEY ("processStageId") REFERENCES "ProcessStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
