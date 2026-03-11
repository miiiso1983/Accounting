import type { AccountType, CurrencyCode, Dc } from "../../../generated/prisma/client";

export type CoaNode = {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: Dc;
  isPosting: boolean;
  currencyCode?: CurrencyCode;
  children?: CoaNode[];
};
