-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "MaterialReceipt" ADD COLUMN     "fillerNote" TEXT,
ADD COLUMN     "fillerWeightG" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "pieceWeightIsFine" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
