import type { CurrencyCode, Dc, JournalEntryType } from "../../../generated/prisma/client";

export type JournalLineInput = {
  accountId: string;
  dc: Dc;
  /** optional cost center dimension */
  costCenterId?: string;
  /** amount in `currencyCode` */
  amount: string;
  currencyCode: CurrencyCode;
  /** optional override; will be computed if omitted */
  amountBase?: string;
  description?: string;
};

export type CreateJournalEntryInput = {
  companyId: string;

  /** optional branch (nullable in DB; omit to leave null) */
  branchId?: string;
  entryDate: Date;
  description?: string;
  type?: JournalEntryType;
  /** reporting/base currency (typically Company.baseCurrencyCode) */
  baseCurrencyCode: CurrencyCode;

  /** optional entry transaction currency (if single-currency entry) */
  currencyCode?: CurrencyCode;
  exchangeRateId?: string;

  referenceType?: string;
  referenceId?: string;
  createdById?: string;

  lines: JournalLineInput[];
};
