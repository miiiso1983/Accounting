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
 * POST /api/invoices/[id]/close
 *
 * Closes an invoice that has been partially paid.
 * Creates a journal entry to reverse the remaining AR balance:
 *   DR Bad Debt / Discount Allowed (or Income reduction)
 *   CR Accounts Receivable
 */
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
    return Response.json({ error: "Only SENT or OVERDUE invoices can be closed" }, { status: 400 });
  }

  try {
    await ensureInvoicePostingAccounts(prisma, invoice.companyId);

    const result = await prisma.$transaction(async (tx) => {
      // Calculate remaining balance = total - payments - credit notes
      const [payments, creditNotes] = await Promise.all([
        tx.invoicePayment.aggregate({
          where: { invoiceId: invoice.id, companyId: invoice.companyId },
          _sum: { amountBase: true },
        }),
        tx.creditNote.aggregate({
          where: { invoiceId: invoice.id, companyId: invoice.companyId },
          _sum: { totalBase: true },
        }),
      ]);
      const paidBase = payments._sum.amountBase ? new Prisma.Decimal(payments._sum.amountBase) : new Prisma.Decimal(0);
      const creditedBase = creditNotes._sum.totalBase ? new Prisma.Decimal(creditNotes._sum.totalBase) : new Prisma.Decimal(0);
      const remainingBase = invoice.totalBase.minus(paidBase).minus(creditedBase);

      if (remainingBase.lte(0)) {
        // Already fully paid, just update status
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
        return { journalEntryId: null };
      }

      const accountsByCode = await getInvoicePostingAccountsTx(tx, invoice.companyId);
      const arId = accountsByCode.get("1200");
      if (!arId) throw new Error("Missing GL account code 1200 (Accounts Receivable)");

      // Use Sales Revenue (4100) as the contra account for closure discount
      const salesId = accountsByCode.get("4100");
      if (!salesId) throw new Error("Missing GL account code 4100 (Sales Revenue)");

      const entry = await createPostedJournalEntryTx(tx, {
        companyId: invoice.companyId,
				branchId: invoice.branchId ?? undefined,
        entryDate: new Date(),
        description: `Invoice Closure: ${invoice.invoiceNumber} — remaining balance write-down`,
        baseCurrencyCode: invoice.baseCurrencyCode,
        currencyCode: invoice.currencyCode,
        exchangeRateId: invoice.exchangeRateId ?? undefined,
        referenceType: "INVOICE_CLOSURE",
        referenceId: invoice.id,
        createdById: session.user.id,
        lines: [
          { accountId: salesId.id, dc: "DEBIT", amount: remainingBase.toFixed(6), currencyCode: invoice.baseCurrencyCode },
          { accountId: arId.id, dc: "CREDIT", amount: remainingBase.toFixed(6), currencyCode: invoice.baseCurrencyCode },
        ],
      });

      await tx.invoice.update({ where: { id: invoice.id }, data: { status: "CLOSED" } });
      return { journalEntryId: entry.id };
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    return Response.json(result, { status: 200 });
  } catch (e) {
    const message = readTransactionErrorMessage(e);
    return Response.json({ error: message }, { status: 400 });
  }
}

