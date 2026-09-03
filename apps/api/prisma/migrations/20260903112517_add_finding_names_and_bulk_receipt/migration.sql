-- CreateTable
CREATE TABLE "BulkStockReceipt" (
    "id" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "purityId" TEXT NOT NULL,
    "weightGrams" DECIMAL(12,3) NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulkStockReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdFindingName" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdFindingName_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkStockReceipt_karigarId_idx" ON "BulkStockReceipt"("karigarId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdFindingName_label_key" ON "ProdFindingName"("label");

-- AddForeignKey
ALTER TABLE "BulkStockReceipt" ADD CONSTRAINT "BulkStockReceipt_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkStockReceipt" ADD CONSTRAINT "BulkStockReceipt_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "PurityTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
