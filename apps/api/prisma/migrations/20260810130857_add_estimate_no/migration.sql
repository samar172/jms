ALTER TABLE "Estimate" ADD COLUMN "estimateNo" TEXT;

CREATE UNIQUE INDEX "Estimate_estimateNo_key" ON "Estimate"("estimateNo");
