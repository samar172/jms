/*
  Warnings:

  - You are about to drop the column `jobCardId` on the `ProdSubItem` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `ProdSubItem` table. All the data in the column will be lost.
  - Added the required column `assignmentId` to the `ProdSubItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ProdSubItem" DROP CONSTRAINT "ProdSubItem_jobCardId_fkey";

-- DropIndex
DROP INDEX "ProdSubItem_jobCardId_idx";

-- AlterTable
ALTER TABLE "ProdSubItem" DROP COLUMN "jobCardId",
DROP COLUMN "type",
ADD COLUMN     "assignmentId" TEXT NOT NULL,
ALTER COLUMN "name" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ProdSubItemName" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdSubItemName_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProdSubItemName_label_key" ON "ProdSubItemName"("label");

-- CreateIndex
CREATE INDEX "ProdSubItem_assignmentId_idx" ON "ProdSubItem"("assignmentId");

-- AddForeignKey
ALTER TABLE "ProdSubItem" ADD CONSTRAINT "ProdSubItem_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProdAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
