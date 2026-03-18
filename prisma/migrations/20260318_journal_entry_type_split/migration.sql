-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('SYSTEM', 'MANUAL');

-- AlterTable
ALTER TABLE "JournalEntry"
ADD COLUMN "type" "JournalEntryType";

-- Backfill existing data
UPDATE "JournalEntry"
SET "type" = CASE
  WHEN "referenceType" IS NULL THEN 'MANUAL'::"JournalEntryType"
  ELSE 'SYSTEM'::"JournalEntryType"
END
WHERE "type" IS NULL;

ALTER TABLE "JournalEntry"
ALTER COLUMN "type" SET NOT NULL,
ALTER COLUMN "type" SET DEFAULT 'MANUAL';

-- Replace unique constraint/index with per-type numbering
DROP INDEX IF EXISTS "JournalEntry_companyId_entryNumber_key";
CREATE UNIQUE INDEX "JournalEntry_companyId_type_entryNumber_key"
ON "JournalEntry"("companyId", "type", "entryNumber");

CREATE INDEX "JournalEntry_companyId_type_idx"
ON "JournalEntry"("companyId", "type");