-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'MANAGER', 'COSTING', 'STORE', 'PRODUCTION', 'SALES', 'KARIGAR', 'AUDITOR');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE');

-- CreateEnum
CREATE TYPE "StoneCategory" AS ENUM ('POLKI', 'DIAMOND', 'COLOURED_STONE');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('IN_HOUSE', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "LabourRateBasis" AS ENUM ('PER_GRAM', 'PER_PIECE', 'PER_CARAT', 'DAILY_WAGE');

-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('REFINER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DESIGN', 'ESTIMATED', 'IN_PRODUCTION', 'FINISHED', 'SOLD', 'MELTED');

-- CreateEnum
CREATE TYPE "DesignSource" AS ENUM ('IN_HOUSE', 'CUSTOMER_SUPPLIED');

-- CreateEnum
CREATE TYPE "ImageType" AS ENUM ('SKETCH', 'WORK_IN_PROGRESS', 'FINAL_PRODUCT');

-- CreateEnum
CREATE TYPE "JobCardStatus" AS ENUM ('OPEN', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "JobStageStatus" AS ENUM ('PENDING', 'ISSUED', 'IN_PROGRESS', 'RECEIVED', 'APPROVED', 'REWORK');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('GOLD', 'POLKI', 'COLOURED_STONE', 'FINDING');

-- CreateEnum
CREATE TYPE "WastageExceptionStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DustLotStatus" AS ENUM ('OPEN', 'DESPATCHED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "LabourEntryStatus" AS ENUM ('PENDING', 'APPROVED');

-- CreateEnum
CREATE TYPE "KarigarLedgerEntryType" AS ENUM ('METAL_DEBIT', 'METAL_CREDIT', 'LABOUR_EARNED', 'ADVANCE_PAID', 'ADVANCE_ADJUSTED', 'WASTAGE_RECOVERY');

-- CreateEnum
CREATE TYPE "EstimateType" AS ENUM ('ROUGH_ESTIMATE', 'FINAL_COSTING');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "EstimateLineHead" AS ENUM ('GOLD', 'POLKI', 'COLOURED_STONE', 'MAKING', 'OTHER', 'WASTAGE');

-- CreateEnum
CREATE TYPE "EstimateLineSource" AS ENUM ('MANUAL', 'FROM_LABOUR', 'FROM_WASTAGE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "karigarId" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldRate" (
    "id" TEXT NOT NULL,
    "ratePerGram24k" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoldRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Karat" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purityFactor" DECIMAL(6,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Karat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoneType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StoneCategory" NOT NULL,
    "defaultRatePerCarat" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StoneType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcategory" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessStage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "wastageTolerancePct" DECIMAL(5,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProcessStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Karigar" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "contactNumber" TEXT,
    "address" TEXT,
    "specialization" TEXT,
    "employmentType" "EmploymentType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Karigar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KarigarStageRate" (
    "id" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "processStageId" TEXT NOT NULL,
    "rateBasis" "LabourRateBasis" NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "KarigarStageRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VendorType" NOT NULL,
    "contact" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChargeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "legacyRef" TEXT,
    "designName" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "purityId" TEXT NOT NULL,
    "grossWeightG" DECIMAL(10,3) NOT NULL,
    "netWeightG" DECIMAL(10,3) NOT NULL,
    "stoneWeightCt" DECIMAL(10,3),
    "size" TEXT,
    "description" TEXT,
    "designSource" "DesignSource" NOT NULL DEFAULT 'IN_HOUSE',
    "customerId" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DESIGN',
    "clonedFromId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerialSequence" (
    "bucketKey" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SerialSequence_pkey" PRIMARY KEY ("bucketKey")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "ImageType" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCard" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT,
    "targetDeliveryDate" TIMESTAMP(3),
    "status" "JobCardStatus" NOT NULL DEFAULT 'OPEN',
    "holdReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "JobCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStage" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "processStageId" TEXT NOT NULL,
    "karigarId" TEXT,
    "sequenceOrder" INTEGER NOT NULL,
    "status" "JobStageStatus" NOT NULL DEFAULT 'PENDING',
    "assignedAt" TIMESTAMP(3),
    "expectedCompletionAt" TIMESTAMP(3),
    "isRework" BOOLEAN NOT NULL DEFAULT false,
    "reworkOfStageId" TEXT,

    CONSTRAINT "JobStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialIssue" (
    "id" TEXT NOT NULL,
    "issueNo" TEXT NOT NULL,
    "jobStageId" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "materialType" "MaterialType" NOT NULL,
    "purityId" TEXT,
    "stoneTypeId" TEXT,
    "grossWeightG" DECIMAL(10,3),
    "fineWeightG" DECIMAL(10,3) NOT NULL,
    "caratWeight" DECIMAL(10,3),
    "pieces" INTEGER,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" TEXT,

    CONSTRAINT "MaterialIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialReceipt" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "jobStageId" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "finishedPieceWeightG" DECIMAL(10,3) NOT NULL,
    "dustWeightG" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "unusedReturnedWeightG" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "stonesReturnedJson" JSONB,
    "dustLotId" TEXT,
    "receivedById" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" TEXT,

    CONSTRAINT "MaterialReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WastageRecord" (
    "id" TEXT NOT NULL,
    "jobStageId" TEXT NOT NULL,
    "fineIssuedG" DECIMAL(10,3) NOT NULL,
    "finePieceG" DECIMAL(10,3) NOT NULL,
    "fineDustG" DECIMAL(10,3) NOT NULL,
    "fineReturnedG" DECIMAL(10,3) NOT NULL,
    "netWastageG" DECIMAL(10,3) NOT NULL,
    "wastagePct" DECIMAL(6,2) NOT NULL,
    "tolerancePct" DECIMAL(5,2) NOT NULL,
    "withinTolerance" BOOLEAN NOT NULL,
    "exceptionStatus" "WastageExceptionStatus" NOT NULL DEFAULT 'NONE',
    "exceptionReason" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "recoveredFromKarigar" BOOLEAN NOT NULL DEFAULT false,
    "recoveryAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WastageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DustLot" (
    "id" TEXT NOT NULL,
    "lotNo" TEXT NOT NULL,
    "status" "DustLotStatus" NOT NULL DEFAULT 'OPEN',
    "totalDustWeightG" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "vendorId" TEXT,
    "despatchedAt" TIMESTAMP(3),
    "recoveredPureGoldG" DECIMAL(10,3),
    "recoveredAt" TIMESTAMP(3),
    "recoveryPct" DECIMAL(6,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DustLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabourEntry" (
    "id" TEXT NOT NULL,
    "jobStageId" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "rateBasis" "LabourRateBasis" NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "status" "LabourEntryStatus" NOT NULL DEFAULT 'PENDING',
    "enteredById" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "LabourEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KarigarLedgerEntry" (
    "id" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "type" "KarigarLedgerEntryType" NOT NULL,
    "fineGoldG" DECIMAL(10,3),
    "amount" DECIMAL(12,2),
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KarigarLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "EstimateType" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "estimateDate" TIMESTAMP(3) NOT NULL,
    "goldRateSnapshot24k" DECIMAL(12,2) NOT NULL,
    "profitPct" DECIMAL(5,2) NOT NULL,
    "materialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "makingCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "wastageCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "profit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "showBreakdownOnPdf" BOOLEAN NOT NULL DEFAULT false,
    "gstPct" DECIMAL(5,2),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLine" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "head" "EstimateLineHead" NOT NULL,
    "description" TEXT,
    "purityId" TEXT,
    "stoneTypeId" TEXT,
    "chargeTypeId" TEXT,
    "karigarName" TEXT,
    "quantity" DECIMAL(10,3) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sourceType" "EstimateLineSource" NOT NULL DEFAULT 'MANUAL',
    "sourceLabourEntryId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EstimateLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_karigarId_key" ON "User"("karigarId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "GoldRate_effectiveFrom_idx" ON "GoldRate"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Karat_code_key" ON "Karat"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Category_code_key" ON "Category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_categoryId_name_key" ON "Subcategory"("categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessStage_name_key" ON "ProcessStage"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Karigar_code_key" ON "Karigar"("code");

-- CreateIndex
CREATE INDEX "Karigar_isActive_idx" ON "Karigar"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "KarigarStageRate_karigarId_processStageId_key" ON "KarigarStageRate"("karigarId", "processStageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChargeType_name_key" ON "ChargeType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_serialNo_key" ON "Product"("serialNo");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_categoryId_purityId_idx" ON "Product"("categoryId", "purityId");

-- CreateIndex
CREATE INDEX "JobCard_status_idx" ON "JobCard"("status");

-- CreateIndex
CREATE INDEX "JobStage_jobCardId_idx" ON "JobStage"("jobCardId");

-- CreateIndex
CREATE INDEX "JobStage_status_idx" ON "JobStage"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssue_issueNo_key" ON "MaterialIssue"("issueNo");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssue_reversalOfId_key" ON "MaterialIssue"("reversalOfId");

-- CreateIndex
CREATE INDEX "MaterialIssue_jobStageId_idx" ON "MaterialIssue"("jobStageId");

-- CreateIndex
CREATE INDEX "MaterialIssue_karigarId_idx" ON "MaterialIssue"("karigarId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialReceipt_receiptNo_key" ON "MaterialReceipt"("receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialReceipt_reversalOfId_key" ON "MaterialReceipt"("reversalOfId");

-- CreateIndex
CREATE INDEX "MaterialReceipt_jobStageId_idx" ON "MaterialReceipt"("jobStageId");

-- CreateIndex
CREATE INDEX "MaterialReceipt_karigarId_idx" ON "MaterialReceipt"("karigarId");

-- CreateIndex
CREATE UNIQUE INDEX "WastageRecord_jobStageId_key" ON "WastageRecord"("jobStageId");

-- CreateIndex
CREATE INDEX "WastageRecord_exceptionStatus_idx" ON "WastageRecord"("exceptionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "DustLot_lotNo_key" ON "DustLot"("lotNo");

-- CreateIndex
CREATE INDEX "LabourEntry_karigarId_idx" ON "LabourEntry"("karigarId");

-- CreateIndex
CREATE INDEX "LabourEntry_status_idx" ON "LabourEntry"("status");

-- CreateIndex
CREATE INDEX "KarigarLedgerEntry_karigarId_createdAt_idx" ON "KarigarLedgerEntry"("karigarId", "createdAt");

-- CreateIndex
CREATE INDEX "Estimate_productId_idx" ON "Estimate"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_productId_type_version_key" ON "Estimate"("productId", "type", "version");

-- CreateIndex
CREATE INDEX "EstimateLine_estimateId_idx" ON "EstimateLine"("estimateId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarigarStageRate" ADD CONSTRAINT "KarigarStageRate_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarigarStageRate" ADD CONSTRAINT "KarigarStageRate_processStageId_fkey" FOREIGN KEY ("processStageId") REFERENCES "ProcessStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "Karat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStage" ADD CONSTRAINT "JobStage_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStage" ADD CONSTRAINT "JobStage_processStageId_fkey" FOREIGN KEY ("processStageId") REFERENCES "ProcessStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStage" ADD CONSTRAINT "JobStage_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_jobStageId_fkey" FOREIGN KEY ("jobStageId") REFERENCES "JobStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "Karat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_stoneTypeId_fkey" FOREIGN KEY ("stoneTypeId") REFERENCES "StoneType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReceipt" ADD CONSTRAINT "MaterialReceipt_jobStageId_fkey" FOREIGN KEY ("jobStageId") REFERENCES "JobStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReceipt" ADD CONSTRAINT "MaterialReceipt_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReceipt" ADD CONSTRAINT "MaterialReceipt_dustLotId_fkey" FOREIGN KEY ("dustLotId") REFERENCES "DustLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReceipt" ADD CONSTRAINT "MaterialReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WastageRecord" ADD CONSTRAINT "WastageRecord_jobStageId_fkey" FOREIGN KEY ("jobStageId") REFERENCES "JobStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WastageRecord" ADD CONSTRAINT "WastageRecord_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DustLot" ADD CONSTRAINT "DustLot_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourEntry" ADD CONSTRAINT "LabourEntry_jobStageId_fkey" FOREIGN KEY ("jobStageId") REFERENCES "JobStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourEntry" ADD CONSTRAINT "LabourEntry_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourEntry" ADD CONSTRAINT "LabourEntry_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourEntry" ADD CONSTRAINT "LabourEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarigarLedgerEntry" ADD CONSTRAINT "KarigarLedgerEntry_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "Karat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_stoneTypeId_fkey" FOREIGN KEY ("stoneTypeId") REFERENCES "StoneType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_chargeTypeId_fkey" FOREIGN KEY ("chargeTypeId") REFERENCES "ChargeType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
