-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'MATERIAL_PLANNING', 'MATERIAL_ISSUED', 'IN_PRODUCTION', 'MATERIAL_RETURN', 'RECONCILIATION', 'ASSEMBLY', 'QC', 'READY', 'DELIVERED');

-- CreateEnum
CREATE TYPE "AssemblyStatus" AS ENUM ('PENDING', 'IN_ASSEMBLY', 'ASSEMBLED');

-- CreateEnum
CREATE TYPE "AssemblyComponentStatus" AS ENUM ('PENDING', 'COMPLETE', 'MISSING');

-- CreateEnum
CREATE TYPE "QCResult" AS ENUM ('PENDING', 'PASS', 'FAIL', 'REWORK_REQUIRED', 'APPROVED');

-- CreateEnum
CREATE TYPE "StoneStatus" AS ENUM ('IN_STOCK', 'ISSUED', 'RETURNED', 'SET', 'SOLD');

-- CreateEnum
CREATE TYPE "StoneMovementType" AS ENUM ('PURCHASE', 'ISSUE', 'RETURN', 'SET', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN     "orderId" TEXT;

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "approvedAmount" DECIMAL(12,2) NOT NULL,
    "advanceReceived" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "expectedDeliveryDate" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assembly" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "assemblerId" TEXT,
    "status" "AssemblyStatus" NOT NULL DEFAULT 'PENDING',
    "finalWeightG" DECIMAL(10,3),
    "remarks" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyComponent" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "status" "AssemblyComponentStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "AssemblyComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QCInspection" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "checklistJson" JSONB,
    "result" "QCResult" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QCInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stone" (
    "id" TEXT NOT NULL,
    "stoneCode" TEXT NOT NULL,
    "stoneTypeId" TEXT NOT NULL,
    "shape" TEXT,
    "caratWeight" DECIMAL(10,3) NOT NULL,
    "colour" TEXT,
    "clarity" TEXT,
    "certification" TEXT,
    "purchaseCost" DECIMAL(12,2),
    "vendorId" TEXT,
    "status" "StoneStatus" NOT NULL DEFAULT 'IN_STOCK',
    "currentJobStageId" TEXT,
    "currentKarigarId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoneMovement" (
    "id" TEXT NOT NULL,
    "stoneId" TEXT NOT NULL,
    "type" "StoneMovementType" NOT NULL,
    "jobStageId" TEXT,
    "karigarId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoneMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "role" "Role",
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "Order_estimateId_key" ON "Order"("estimateId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Assembly_orderId_idx" ON "Assembly"("orderId");

-- CreateIndex
CREATE INDEX "AssemblyComponent_assemblyId_idx" ON "AssemblyComponent"("assemblyId");

-- CreateIndex
CREATE INDEX "QCInspection_orderId_idx" ON "QCInspection"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Stone_stoneCode_key" ON "Stone"("stoneCode");

-- CreateIndex
CREATE INDEX "Stone_status_idx" ON "Stone"("status");

-- CreateIndex
CREATE INDEX "Stone_stoneTypeId_idx" ON "Stone"("stoneTypeId");

-- CreateIndex
CREATE INDEX "StoneMovement_stoneId_createdAt_idx" ON "StoneMovement"("stoneId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_role_isRead_idx" ON "Notification"("role", "isRead");

-- CreateIndex
CREATE INDEX "JobCard_orderId_idx" ON "JobCard"("orderId");

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_assemblerId_fkey" FOREIGN KEY ("assemblerId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyComponent" ADD CONSTRAINT "AssemblyComponent_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyComponent" ADD CONSTRAINT "AssemblyComponent_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCInspection" ADD CONSTRAINT "QCInspection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCInspection" ADD CONSTRAINT "QCInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stone" ADD CONSTRAINT "Stone_stoneTypeId_fkey" FOREIGN KEY ("stoneTypeId") REFERENCES "StoneType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stone" ADD CONSTRAINT "Stone_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stone" ADD CONSTRAINT "Stone_currentJobStageId_fkey" FOREIGN KEY ("currentJobStageId") REFERENCES "JobStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stone" ADD CONSTRAINT "Stone_currentKarigarId_fkey" FOREIGN KEY ("currentKarigarId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stone" ADD CONSTRAINT "Stone_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoneMovement" ADD CONSTRAINT "StoneMovement_stoneId_fkey" FOREIGN KEY ("stoneId") REFERENCES "Stone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoneMovement" ADD CONSTRAINT "StoneMovement_jobStageId_fkey" FOREIGN KEY ("jobStageId") REFERENCES "JobStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoneMovement" ADD CONSTRAINT "StoneMovement_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoneMovement" ADD CONSTRAINT "StoneMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
