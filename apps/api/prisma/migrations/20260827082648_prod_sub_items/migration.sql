/*
  Warnings:

  - You are about to drop the column `subItemType` on the `ProdMaterialIssue` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ProdMaterialIssue" DROP COLUMN "subItemType";

-- CreateTable
CREATE TABLE "ProdSubItem" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "pieces" INTEGER NOT NULL DEFAULT 0,
    "weightG" DECIMAL(12,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdSubItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProdSubItem_jobCardId_idx" ON "ProdSubItem"("jobCardId");

-- AddForeignKey
ALTER TABLE "ProdSubItem" ADD CONSTRAINT "ProdSubItem_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "ProdJobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
