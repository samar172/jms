-- AlterEnum
BEGIN;
CREATE TYPE "MaterialType_new" AS ENUM ('SILVER', 'POLKI', 'COLOURED_STONE', 'FINDING');
ALTER TABLE "MaterialIssue" ALTER COLUMN "materialType" TYPE "MaterialType_new" USING ("materialType"::text::"MaterialType_new");
ALTER TABLE "StockLedgerEntry" ALTER COLUMN "materialType" TYPE "MaterialType_new" USING ("materialType"::text::"MaterialType_new");
ALTER TYPE "MaterialType" RENAME TO "MaterialType_old";
ALTER TYPE "MaterialType_new" RENAME TO "MaterialType";
DROP TYPE "MaterialType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "EstimateLine" DROP CONSTRAINT "EstimateLine_purityId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialIssue" DROP CONSTRAINT "MaterialIssue_purityId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_purityId_fkey";

-- DropForeignKey
ALTER TABLE "StockLedgerEntry" DROP CONSTRAINT "StockLedgerEntry_purityId_fkey";

-- DropTable
DROP TABLE "GoldRate";

-- DropTable
DROP TABLE "Karat";

-- CreateTable
CREATE TABLE "MetalRate" (
    "id" TEXT NOT NULL,
    "ratePerGramPure" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetalRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurityTier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purityFactor" DECIMAL(6,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PurityTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetalRate_effectiveFrom_idx" ON "MetalRate"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PurityTier_code_key" ON "PurityTier"("code");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "PurityTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "PurityTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "PurityTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "PurityTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

