import type { CoaNode } from "./types";

/**
 * Iraqi "Unified Accounting System" Chart of Accounts.
 *
 * NOTE: This is a *starter* structure meant to be customized to your official
 * Unified Accounting System chart/codes (which can vary by entity/sector).
 */
export const IRAQ_UASC_COA_STARTER: CoaNode[] = [
  {
    code: "1000",
    name: "Assets",
    type: "ASSET",
    normalBalance: "DEBIT",
    isPosting: false,
    children: [
      {
        code: "1100",
        name: "Cash and Cash Equivalents",
        type: "ASSET",
        normalBalance: "DEBIT",
        isPosting: false,
        children: [
          { code: "1110", name: "Cash on Hand (IQD)", type: "ASSET", normalBalance: "DEBIT", isPosting: true },
          { code: "1111", name: "Cash on Hand (USD)", type: "ASSET", normalBalance: "DEBIT", isPosting: true, currencyCode: "USD" },
          { code: "1120", name: "Bank Account (IQD)", type: "ASSET", normalBalance: "DEBIT", isPosting: true },
          { code: "1121", name: "Bank Account (USD)", type: "ASSET", normalBalance: "DEBIT", isPosting: true, currencyCode: "USD" },
        ],
      },
      { code: "1200", name: "Accounts Receivable", type: "ASSET", normalBalance: "DEBIT", isPosting: true },
      { code: "1250", name: "VAT Receivable", type: "ASSET", normalBalance: "DEBIT", isPosting: true },
      { code: "1300", name: "Inventory", type: "ASSET", normalBalance: "DEBIT", isPosting: true },
      {
        code: "1400",
        name: "Property, Plant and Equipment",
        type: "ASSET",
        normalBalance: "DEBIT",
        isPosting: false,
        children: [
          { code: "1410", name: "Equipment", type: "ASSET", normalBalance: "DEBIT", isPosting: true },
          { code: "1490", name: "Accumulated Depreciation - Equipment", type: "ASSET", normalBalance: "CREDIT", isPosting: true },
        ],
      },
    ],
  },
  {
    code: "2000",
    name: "Liabilities",
    type: "LIABILITY",
    normalBalance: "CREDIT",
    isPosting: false,
    children: [
      { code: "2100", name: "Accounts Payable", type: "LIABILITY", normalBalance: "CREDIT", isPosting: true },
      { code: "2250", name: "VAT Payable", type: "LIABILITY", normalBalance: "CREDIT", isPosting: true },
      { code: "2300", name: "Loans Payable", type: "LIABILITY", normalBalance: "CREDIT", isPosting: true },
    ],
  },
  {
    code: "3000",
    name: "Equity",
    type: "EQUITY",
    normalBalance: "CREDIT",
    isPosting: false,
    children: [
      { code: "3100", name: "Owner's Capital", type: "EQUITY", normalBalance: "CREDIT", isPosting: true },
      { code: "3200", name: "Retained Earnings", type: "EQUITY", normalBalance: "CREDIT", isPosting: true },
    ],
  },
  {
    code: "4000",
    name: "Income",
    type: "INCOME",
    normalBalance: "CREDIT",
    isPosting: false,
    children: [
      { code: "4100", name: "Sales Revenue", type: "INCOME", normalBalance: "CREDIT", isPosting: true },
      { code: "4200", name: "Other Income", type: "INCOME", normalBalance: "CREDIT", isPosting: true },
    ],
  },
  {
    code: "5000",
    name: "Expenses",
    type: "EXPENSE",
    normalBalance: "DEBIT",
    isPosting: false,
    children: [
      { code: "5100", name: "Cost of Goods Sold", type: "EXPENSE", normalBalance: "DEBIT", isPosting: true },
      { code: "5200", name: "Salaries Expense", type: "EXPENSE", normalBalance: "DEBIT", isPosting: true },
      { code: "5300", name: "Rent Expense", type: "EXPENSE", normalBalance: "DEBIT", isPosting: true },
      { code: "5400", name: "Utilities Expense", type: "EXPENSE", normalBalance: "DEBIT", isPosting: true },
      { code: "5500", name: "Office Supplies Expense", type: "EXPENSE", normalBalance: "DEBIT", isPosting: true },
    ],
  },
];
