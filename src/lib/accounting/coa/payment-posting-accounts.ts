import { Prisma, type PrismaClient, type CurrencyCode } from "@/generated/prisma/client";

const REQUIRED_PAYMENT_POSTING_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: "ASSET";
  normalBalance: "DEBIT";
  currencyCode?: CurrencyCode;
}> = [
  // Debit side (deposit accounts)
  { code: "1110", name: "Cash on Hand (IQD)", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1111", name: "Cash on Hand (USD)", type: "ASSET", normalBalance: "DEBIT", currencyCode: "USD" },
  { code: "1120", name: "Bank Account (IQD)", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1121", name: "Bank Account (USD)", type: "ASSET", normalBalance: "DEBIT", currencyCode: "USD" },
  // Credit side
  { code: "1200", name: "Accounts Receivable", type: "ASSET", normalBalance: "DEBIT" },
];

type PaymentPostingAccountsDb = Prisma.TransactionClient | PrismaClient;

async function readPaymentPostingAccounts(db: PaymentPostingAccountsDb, companyId: string) {
  const accounts = await db.glAccount.findMany({
    where: {
      companyId,
      code: { in: REQUIRED_PAYMENT_POSTING_ACCOUNTS.map((a) => a.code) },
    },
    select: { id: true, code: true, isPosting: true },
  });

  for (const account of accounts) {
    if (!account.isPosting) throw new Error(`GL account ${account.code} must be a posting account`);
  }

  return new Map(accounts.map((a) => [a.code, { id: a.id }] as const));
}

export async function ensurePaymentPostingAccounts(db: PaymentPostingAccountsDb, companyId: string) {
  for (const account of REQUIRED_PAYMENT_POSTING_ACCOUNTS) {
    await db.glAccount.upsert({
      where: { companyId_code: { companyId, code: account.code } },
      update: { isPosting: true, currencyCode: account.currencyCode ?? null },
      create: {
        companyId,
        code: account.code,
        name: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        isPosting: true,
        currencyCode: account.currencyCode ?? null,
      },
    });
  }

  return readPaymentPostingAccounts(db, companyId);
}

export async function getPaymentPostingAccountsTx(tx: Prisma.TransactionClient, companyId: string) {
  return readPaymentPostingAccounts(tx, companyId);
}
