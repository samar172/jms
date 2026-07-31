-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ALTER COLUMN "gstPct" SET NOT NULL,
ALTER COLUMN "gstPct" SET DEFAULT 3;

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "embedding" vector(1024);
