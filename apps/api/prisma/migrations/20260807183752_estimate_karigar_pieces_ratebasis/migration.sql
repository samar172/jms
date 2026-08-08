-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "karigarId" TEXT;

-- AlterTable
ALTER TABLE "EstimateLine" ADD COLUMN     "pieces" INTEGER,
ADD COLUMN     "rateBasis" "LabourRateBasis";

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
