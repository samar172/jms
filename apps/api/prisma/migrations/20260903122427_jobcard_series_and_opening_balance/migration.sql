-- AlterTable
ALTER TABLE "Karigar" ADD COLUMN     "openingBalance" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProdJobCard" ADD COLUMN     "seriesId" TEXT;

-- CreateTable
CREATE TABLE "ProdJobCardSeries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startAt" INTEGER NOT NULL DEFAULT 1,
    "padWidth" INTEGER NOT NULL DEFAULT 3,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdJobCardSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProdJobCardSeries_name_key" ON "ProdJobCardSeries"("name");

-- AddForeignKey
ALTER TABLE "ProdJobCard" ADD CONSTRAINT "ProdJobCard_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ProdJobCardSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
