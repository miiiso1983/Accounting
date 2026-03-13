import { getServerSession } from "next-auth";

import { ensureInvoicePostingAccountsTx } from "@/lib/accounting/coa/invoice-posting-accounts";
import { authOptions } from "@/lib/auth/options";
import { INTERACTIVE_TRANSACTION_OPTIONS, readTransactionErrorMessage } from "@/lib/db/interactive-transaction";
import { prisma } from "@/lib/db/prisma";
import { createPostedJournalEntryTx } from "@/lib/accounting/journal/create";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

function mustGetPostingAccountIdByCode(args: { accountsByCode: Map<string, { id: string }>; code: string }) {
  const a = args.accountsByCode.get(args.code);
  if (!a) throw new Error(`Missing required GL account code ${args.code}. Seed Chart of Accounts for the company.`);
  return a.id;
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_SEND)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: user.companyId },
    select: {
      id: true,
      companyId: true,
      invoiceNumber: true,
      status: true,
      issueDate: true,
      currencyCode: true,
      baseCurrencyCode: true,
      exchangeRateId: true,
      subtotal: true,
      discountAmount: true,
      taxTotal: true,
      total: true,
      journalEntryId: true,
    },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  if (invoice.journalEntryId) return Response.json({ error: "Already posted" }, { status: 400 });
  if (invoice.status !== "DRAFT") return Response.json({ error: "Only DRAFT invoices can be sent" }, { status: 400 });

  try {
    const posted = await prisma.$transaction(async (tx) => {
      const accountsByCode = await ensureInvoicePostingAccountsTx(tx, invoice.companyId);
      const arId = mustGetPostingAccountIdByCode({ accountsByCode, code: "1200" });
      const salesId = mustGetPostingAccountIdByCode({ accountsByCode, code: "4100" });
      const vatId = mustGetPostingAccountIdByCode({ accountsByCode, code: "2250" });

		const netSales = invoice.subtotal.minus(invoice.discountAmount);
		const entryLines = [
			{ accountId: arId, dc: "DEBIT" as const, amount: invoice.total.toFixed(6) },
			{ accountId: salesId, dc: "CREDIT" as const, amount: netSales.toFixed(6) },
			...(invoice.taxTotal.gt(0)
				? [{ accountId: vatId, dc: "CREDIT" as const, amount: invoice.taxTotal.toFixed(6) }]
				: []),
		];

      const entry = await createPostedJournalEntryTx(tx, {
        companyId: invoice.companyId,
        entryDate: invoice.issueDate,
        description: `Invoice ${invoice.invoiceNumber}`,
        baseCurrencyCode: invoice.baseCurrencyCode,
        currencyCode: invoice.currencyCode,
        exchangeRateId: invoice.exchangeRateId ?? undefined,
        referenceType: "INVOICE",
        referenceId: invoice.id,
        createdById: session.user.id,
        lines: entryLines.map((l) => ({
          accountId: l.accountId,
          dc: l.dc,
          amount: l.amount,
          currencyCode: invoice.currencyCode,
        })),
      });

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "SENT",
          journalEntryId: entry.id,
        },
        select: { id: true, journalEntryId: true },
      });

      return entry;
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    return Response.json({ journalEntryId: posted.id }, { status: 200 });
  } catch (e) {
    const message = readTransactionErrorMessage(e);
    return Response.json({ error: message }, { status: 400 });
  }
}
