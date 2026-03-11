import type { CurrencyCode, Dc } from "../../../generated/prisma/client";

export type JournalLineInput = {
  accountId: string;
  dc: Dc;
  /** amount in `currencyCode` */
  amount: string;
  currencyCode: CurrencyCode;
  /** optional override; will be computed if omitted */
  amountBase?: string;
  description?: string;
};

export type CreateJournalEntryInput = {
  companyId: string;
  entryDate: Date;
  description?: string;
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
