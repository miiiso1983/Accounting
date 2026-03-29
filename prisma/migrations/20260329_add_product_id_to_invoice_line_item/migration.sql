-- AlterTable
ALTER TABLE "InvoiceLineItem" ADD COLUMN "productId" TEXT;

-- CreateIndex
CREATE INDEX "InvoiceLineItem_productId_idx" ON "InvoiceLineItem"("productId");

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

