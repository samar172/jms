-- AlterTable
ALTER TABLE "MaterialReceipt" ADD COLUMN     "fillerNote" TEXT,
ADD COLUMN     "fillerWeightG" DECIMAL(10,3) NOT NULL DEFAULT 0;
