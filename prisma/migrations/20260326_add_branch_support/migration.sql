-- CreateTable (if not exists)
CREATE TABLE IF NOT EXISTS "Branch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_companyId_code_key" ON "Branch"("companyId", "code");
CREATE INDEX IF NOT EXISTS "Branch_companyId_isActive_idx" ON "Branch"("companyId", "isActive");
CREATE INDEX IF NOT EXISTS "Branch_companyId_name_idx" ON "Branch"("companyId", "name");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Branch_companyId_fkey') THEN
    ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable: Add branchId to Invoice
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

-- AlterTable: Add branchId to JournalEntry
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

-- AlterTable: Add defaultBranchId to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultBranchId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_companyId_branchId_idx" ON "Invoice"("companyId", "branchId");
CREATE INDEX IF NOT EXISTS "JournalEntry_companyId_branchId_idx" ON "JournalEntry"("companyId", "branchId");
CREATE INDEX IF NOT EXISTS "User_defaultBranchId_idx" ON "User"("defaultBranchId");

-- AddForeignKeys
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_branchId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JournalEntry_branchId_fkey') THEN
    ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_defaultBranchId_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_defaultBranchId_fkey" FOREIGN KEY ("defaultBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

