import { Prisma, type PrismaClient } from "@/generated/prisma/client";

const REQUIRED_INVOICE_POSTING_ACCOUNTS = [
  { code: "1200", name: "Accounts Receivable", type: "ASSET", normalBalance: "DEBIT" },
  { code: "4100", name: "Sales Revenue", type: "INCOME", normalBalance: "CREDIT" },
  { code: "2250", name: "VAT Payable", type: "LIABILITY", normalBalance: "CREDIT" },
] as const;

type InvoicePostingAccountsDb = Prisma.TransactionClient | PrismaClient;

async function readInvoicePostingAccounts(db: InvoicePostingAccountsDb, companyId: string) {
  const accounts = await db.glAccount.findMany({
    where: {
      companyId,
      code: { in: REQUIRED_INVOICE_POSTING_ACCOUNTS.map((account) => account.code) },
    },
    select: { id: true, code: true, isPosting: true },
  });

  for (const account of accounts) {
    if (!account.isPosting) {
      throw new Error(`GL account ${account.code} must be a posting account`);
    }
  }

  return new Map(accounts.map((account) => [account.code, { id: account.id }] as const));
}

export async function ensureInvoicePostingAccounts(db: InvoicePostingAccountsDb, companyId: string) {
  for (const account of REQUIRED_INVOICE_POSTING_ACCOUNTS) {
    await db.glAccount.upsert({
      where: { companyId_code: { companyId, code: account.code } },
      update: { isPosting: true },
      create: {
        companyId,
        code: account.code,
        name: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        isPosting: true,
      },
    });
  }

  return readInvoicePostingAccounts(db, companyId);
}

export async function getInvoicePostingAccountsTx(tx: Prisma.TransactionClient, companyId: string) {
  return readInvoicePostingAccounts(tx, companyId);
}

export async function ensureInvoicePostingAccountsTx(tx: Prisma.TransactionClient, companyId: string) {
  return ensureInvoicePostingAccounts(tx, companyId);
}

/**
 * Groups line-item totals by their product-level revenueAccountId.
 * Falls back to `defaultSalesAccountId` when a line has no product or the product has no revenueAccountId.
 *
 * Returns a Map<accountId, subtotal>.
 */
export async function groupRevenueByProductAccount(
  tx: InvoicePostingAccountsDb,
  lineItems: { productId: string | null; lineTotal: { toString(): string } }[],
  defaultSalesAccountId: string,
): Promise<Map<string, Prisma.Decimal>> {
  const productIds = [...new Set(lineItems.filter((l) => l.productId).map((l) => l.productId!))];

  const products =
    productIds.length > 0
      ? await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, revenueAccountId: true },
        })
      : [];

  const productAccountMap = new Map(products.map((p) => [p.id, p.revenueAccountId]));

  const accountTotals = new Map<string, Prisma.Decimal>();
  for (const line of lineItems) {
    const accountId = (line.productId && productAccountMap.get(line.productId)) || defaultSalesAccountId;
    const current = accountTotals.get(accountId) ?? new Prisma.Decimal(0);
    accountTotals.set(accountId, current.plus(new Prisma.Decimal(line.lineTotal.toString())));
  }

  return accountTotals;
}
