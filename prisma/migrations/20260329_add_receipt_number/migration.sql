-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN "receiptNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_companyId_receiptNumber_key" ON "InvoicePayment"("companyId", "receiptNumber");

