import { getServerSession } from "next-auth";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { ensureInvoicePostingAccounts, getInvoicePostingAccountsTx } from "@/lib/accounting/coa/invoice-posting-accounts";
import { createPostedJournalEntryTx } from "@/lib/accounting/journal/create";
import { authOptions } from "@/lib/auth/options";
import { INTERACTIVE_TRANSACTION_OPTIONS, readTransactionErrorMessage } from "@/lib/db/interactive-transaction";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const BodySchema = z.object({
  /** Return amount in base currency */
  amount: z.string().min(1),
  reason: z.string().optional(),
});

/**
 * POST /api/invoices/[id]/return
 *
 * Records a sales return (credit note) against an invoice.
 * Reverses part or all of the original posting:
 *   DR Sales Revenue
 *   CR Accounts Receivable
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const body = parsed.data;

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
  if (invoice.status !== "SENT" && invoice.status !== "PAID" && invoice.status !== "OVERDUE") {
    return Response.json({ error: "Only SENT, PAID, or OVERDUE invoices support sales returns" }, { status: 400 });
  }

  const returnAmount = new Prisma.Decimal(body.amount);
  if (returnAmount.lte(0)) return Response.json({ error: "Return amount must be > 0" }, { status: 400 });
  if (returnAmount.gt(invoice.totalBase)) {
    return Response.json({ error: "Return amount cannot exceed invoice total" }, { status: 400 });
  }

  try {
    await ensureInvoicePostingAccounts(prisma, invoice.companyId);

    const result = await prisma.$transaction(async (tx) => {
      const accountsByCode = await getInvoicePostingAccountsTx(tx, invoice.companyId);
      const arId = accountsByCode.get("1200");
      if (!arId) throw new Error("Missing GL account code 1200 (Accounts Receivable)");
      const salesId = accountsByCode.get("4100");
      if (!salesId) throw new Error("Missing GL account code 4100 (Sales Revenue)");

      const reason = body.reason ? ` — ${body.reason}` : "";
      const entry = await createPostedJournalEntryTx(tx, {
        companyId: invoice.companyId,
	        branchId: invoice.branchId ?? undefined,
        entryDate: new Date(),
        description: `Sales Return: Invoice ${invoice.invoiceNumber}${reason}`,
        baseCurrencyCode: invoice.baseCurrencyCode,
        currencyCode: invoice.currencyCode,
        exchangeRateId: invoice.exchangeRateId ?? undefined,
        referenceType: "SALES_RETURN",
        referenceId: invoice.id,
        createdById: session.user.id,
        lines: [
          { accountId: salesId.id, dc: "DEBIT", amount: returnAmount.toFixed(6), currencyCode: invoice.baseCurrencyCode },
          { accountId: arId.id, dc: "CREDIT", amount: returnAmount.toFixed(6), currencyCode: invoice.baseCurrencyCode },
        ],
      });

      // If full return, cancel the invoice
      if (returnAmount.gte(invoice.totalBase)) {
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED" } });
      }

      return { journalEntryId: entry.id };
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    return Response.json(result, { status: 200 });
  } catch (e) {
    const message = readTransactionErrorMessage(e);
    return Response.json({ error: message }, { status: 400 });
  }
}

