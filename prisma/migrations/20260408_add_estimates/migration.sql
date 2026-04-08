-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED');

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "estimateNumber" TEXT NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "currencyCode" "CurrencyCode" NOT NULL,
    "baseCurrencyCode" "CurrencyCode" NOT NULL,
    "exchangeRateId" TEXT,
    "branchId" TEXT,
    "subtotal" DECIMAL(20,6) NOT NULL,
    "discountType" TEXT,
    "discountValue" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,6) NOT NULL,
    "subtotalBase" DECIMAL(20,6) NOT NULL,
    "discountAmountBase" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "taxTotalBase" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "totalBase" DECIMAL(20,6) NOT NULL,
    "note" TEXT,
    "convertedInvoiceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLineItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitPrice" DECIMAL(20,6) NOT NULL,
    "discountType" TEXT,
    "discountValue" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(20,6) NOT NULL,
    "taxRate" DECIMAL(20,6),
    "costCenterId" TEXT,
    "productId" TEXT,

    CONSTRAINT "EstimateLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_convertedInvoiceId_key" ON "Estimate"("convertedInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_companyId_estimateNumber_key" ON "Estimate"("companyId", "estimateNumber");

-- CreateIndex
CREATE INDEX "Estimate_companyId_issueDate_idx" ON "Estimate"("companyId", "issueDate");

-- CreateIndex
CREATE INDEX "Estimate_companyId_branchId_idx" ON "Estimate"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Estimate_companyId_status_idx" ON "Estimate"("companyId", "status");

-- CreateIndex
CREATE INDEX "EstimateLineItem_estimateId_idx" ON "EstimateLineItem"("estimateId");

-- CreateIndex
CREATE INDEX "EstimateLineItem_costCenterId_idx" ON "EstimateLineItem"("costCenterId");

-- CreateIndex
CREATE INDEX "EstimateLineItem_productId_idx" ON "EstimateLineItem"("productId");

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_convertedInvoiceId_fkey" FOREIGN KEY ("convertedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
