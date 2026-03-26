import { getServerSession } from "next-auth";

import { Prisma } from "@/generated/prisma/client";
import { ensureInvoicePostingAccounts, getInvoicePostingAccountsTx } from "@/lib/accounting/coa/invoice-posting-accounts";
import { createPostedJournalEntryTx } from "@/lib/accounting/journal/create";
import { authOptions } from "@/lib/auth/options";
import { INTERACTIVE_TRANSACTION_OPTIONS, readTransactionErrorMessage } from "@/lib/db/interactive-transaction";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

/**
 * POST /api/invoices/[id]/writeoff
 *
 * Writes off the remaining balance of an invoice as bad debt.
 *   DR Bad Debt Expense (5300)
 *   CR Accounts Receivable (1200)
 */

const BAD_DEBT_ACCOUNT = { code: "5300", name: "Bad Debt Expense", type: "EXPENSE" as const, normalBalance: "DEBIT" as const };

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: user.companyId },
    select: {
			id: true, companyId: true, branchId: true, invoiceNumber: true, status: true,
      issueDate: true, currencyCode: true, baseCurrencyCode: true,
      exchangeRateId: true, totalBase: true,
    },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  if (invoice.status !== "SENT" && invoice.status !== "OVERDUE") {
    return Response.json({ error: "Only SENT or OVERDUE invoices can be written off" }, { status: 400 });
  }

  try {
    await ensureInvoicePostingAccounts(prisma, invoice.companyId);

    const result = await prisma.$transaction(async (tx) => {
      // Calculate remaining balance
      const payments = await tx.invoicePayment.aggregate({
        where: { invoiceId: invoice.id, companyId: invoice.companyId },
        _sum: { amountBase: true },
      });
      const paidBase = payments._sum.amountBase ? new Prisma.Decimal(payments._sum.amountBase) : new Prisma.Decimal(0);
      const remainingBase = invoice.totalBase.minus(paidBase);

      if (remainingBase.lte(0)) {
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
        return { journalEntryId: null };
      }

      // Ensure bad debt account exists
      await tx.glAccount.upsert({
        where: { companyId_code: { companyId: invoice.companyId, code: BAD_DEBT_ACCOUNT.code } },
        update: { isPosting: true },
        create: {
          companyId: invoice.companyId,
          code: BAD_DEBT_ACCOUNT.code,
          name: BAD_DEBT_ACCOUNT.name,
          type: BAD_DEBT_ACCOUNT.type,
          normalBalance: BAD_DEBT_ACCOUNT.normalBalance,
          isPosting: true,
        },
      });

      const accountsByCode = await getInvoicePostingAccountsTx(tx, invoice.companyId);
      const arId = accountsByCode.get("1200");
      if (!arId) throw new Error("Missing GL account code 1200 (Accounts Receivable)");

      const badDebtAccount = await tx.glAccount.findFirst({
        where: { companyId: invoice.companyId, code: BAD_DEBT_ACCOUNT.code },
        select: { id: true },
      });
      if (!badDebtAccount) throw new Error("Missing GL account code 5300 (Bad Debt Expense)");

      const entry = await createPostedJournalEntryTx(tx, {
        companyId: invoice.companyId,
				branchId: invoice.branchId ?? undefined,
        entryDate: new Date(),
        description: `Write-off: Invoice ${invoice.invoiceNumber}`,
        baseCurrencyCode: invoice.baseCurrencyCode,
        currencyCode: invoice.currencyCode,
        exchangeRateId: invoice.exchangeRateId ?? undefined,
        referenceType: "INVOICE_WRITEOFF",
        referenceId: invoice.id,
        createdById: session.user.id,
        lines: [
          { accountId: badDebtAccount.id, dc: "DEBIT", amount: remainingBase.toFixed(6), currencyCode: invoice.baseCurrencyCode },
          { accountId: arId.id, dc: "CREDIT", amount: remainingBase.toFixed(6), currencyCode: invoice.baseCurrencyCode },
        ],
      });

      await tx.invoice.update({ where: { id: invoice.id }, data: { status: "WRITTEN_OFF" } });
      return { journalEntryId: entry.id };
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    return Response.json(result, { status: 200 });
  } catch (e) {
    const message = readTransactionErrorMessage(e);
    return Response.json({ error: message }, { status: 400 });
  }
}

