import { Prisma } from "@/generated/prisma/client";

const REQUIRED_INVOICE_POSTING_ACCOUNTS = [
  { code: "1200", name: "Accounts Receivable", type: "ASSET", normalBalance: "DEBIT" },
  { code: "4100", name: "Sales Revenue", type: "INCOME", normalBalance: "CREDIT" },
  { code: "2250", name: "VAT Payable", type: "LIABILITY", normalBalance: "CREDIT" },
] as const;

export async function ensureInvoicePostingAccountsTx(tx: Prisma.TransactionClient, companyId: string) {
  for (const account of REQUIRED_INVOICE_POSTING_ACCOUNTS) {
    await tx.glAccount.upsert({
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

  const accounts = await tx.glAccount.findMany({
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
