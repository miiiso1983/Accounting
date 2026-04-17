import { getServerSession } from "next-auth";
import { z } from "zod";

import { Prisma, type CurrencyCode } from "@/generated/prisma/client";
import { ensureInvoicePostingAccounts, getInvoicePostingAccountsTx } from "@/lib/accounting/coa/invoice-posting-accounts";
import { createPostedJournalEntryTx } from "@/lib/accounting/journal/create";
import { authOptions } from "@/lib/auth/options";
import { INTERACTIVE_TRANSACTION_OPTIONS, readTransactionErrorMessage } from "@/lib/db/interactive-transaction";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const LineSchema = z.object({
  description: z.string().min(1),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  taxRate: z.string().optional().or(z.literal("")),
});

const BodySchema = z.object({
  reason: z.string().optional(),
  lines: z.array(LineSchema).min(1),
});

/**
 * POST /api/invoices/[id]/return
 *
 * Records a sales return (credit note) against an invoice.
 * Creates a CreditNote record and posts a journal entry:
 *   DR Sales Revenue / Sales Returns
 *   CR Accounts Receivable
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CREDIT_NOTE_WRITE)) {
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
      exchangeRateId: true, totalBase: true, total: true,
      exchangeRate: { select: { rate: true } },
    },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  if (invoice.status !== "SENT" && invoice.status !== "PAID" && invoice.status !== "OVERDUE") {
    return Response.json({ error: "Only SENT, PAID, or OVERDUE invoices support sales returns" }, { status: 400 });
  }

  // Calculate line items
  const zero = new Prisma.Decimal(0);
  const computedLines = body.lines.map((l) => {
    const qty = new Prisma.Decimal(l.quantity);
    const price = new Prisma.Decimal(l.unitPrice);
    if (qty.lte(0)) throw new Error("Quantity must be > 0");
    if (price.lt(0)) throw new Error("Unit price must be >= 0");
    const lineTotal = qty.mul(price);
    const taxRate = l.taxRate ? new Prisma.Decimal(l.taxRate) : null;
    const lineTax = taxRate ? lineTotal.mul(taxRate) : zero;
    return { description: l.description, quantity: qty, unitPrice: price, lineTotal, taxRate, lineTax };
  });

  const subtotal = computedLines.reduce((acc, l) => acc.plus(l.lineTotal), zero).toDecimalPlaces(6);
  const taxTotal = computedLines.reduce((acc, l) => acc.plus(l.lineTax), zero).toDecimalPlaces(6);
  const total = subtotal.plus(taxTotal).toDecimalPlaces(6);

  if (total.lte(0)) return Response.json({ error: "Credit note total must be > 0" }, { status: 400 });

  const rateDecimal = invoice.exchangeRate ? new Prisma.Decimal(String(invoice.exchangeRate.rate)) : null;
  const mulToBase = (amt: Prisma.Decimal) => {
    if (invoice.currencyCode === invoice.baseCurrencyCode) return amt;
    if (!rateDecimal) return amt;
    return amt.mul(rateDecimal);
  };

  const subtotalBase = mulToBase(subtotal).toDecimalPlaces(6);
  const taxTotalBase = mulToBase(taxTotal).toDecimalPlaces(6);
  const totalBase = mulToBase(total).toDecimalPlaces(6);

  try {
    await ensureInvoicePostingAccounts(prisma, invoice.companyId);

    const result = await prisma.$transaction(async (tx) => {
      // Validate: total credit notes + this one <= invoice totalBase
      const existingCNs = await tx.creditNote.aggregate({
        where: { invoiceId: invoice.id, companyId: invoice.companyId },
        _sum: { totalBase: true },
      });
      const existingCNTotal = existingCNs._sum.totalBase ? new Prisma.Decimal(existingCNs._sum.totalBase) : zero;
      const maxAllowed = new Prisma.Decimal(String(invoice.totalBase)).minus(existingCNTotal);
      if (totalBase.gt(maxAllowed)) {
        throw new Error(`Credit note total (${totalBase.toFixed(2)}) exceeds remaining returnable amount (${maxAllowed.toFixed(2)})`);
      }

      // Generate credit note number
      const lastCN = await tx.creditNote.findFirst({
        where: { companyId: invoice.companyId },
        orderBy: { createdAt: "desc" },
        select: { creditNoteNumber: true },
      });
      let cnNumber = "CN-0001";
      if (lastCN?.creditNoteNumber) {
        const match = lastCN.creditNoteNumber.match(/([0-9]+)$/);
        if (match) {
          const num = parseInt(match[1], 10) + 1;
          cnNumber = lastCN.creditNoteNumber.slice(0, -match[1].length) + String(num).padStart(match[1].length, "0");
        }
      }

      // Create credit note
      const creditNote = await tx.creditNote.create({
        data: {
          companyId: invoice.companyId,
          invoiceId: invoice.id,
          creditNoteNumber: cnNumber,
          issueDate: new Date(),
          currencyCode: invoice.currencyCode,
          baseCurrencyCode: invoice.baseCurrencyCode,
          exchangeRateId: invoice.exchangeRateId ?? null,
          branchId: invoice.branchId ?? null,
          subtotal: subtotal.toFixed(6),
          taxTotal: taxTotal.toFixed(6),
          total: total.toFixed(6),
          subtotalBase: subtotalBase.toFixed(6),
          taxTotalBase: taxTotalBase.toFixed(6),
          totalBase: totalBase.toFixed(6),
          reason: body.reason?.trim() || null,
          createdById: session.user.id,
          lineItems: {
            create: computedLines.map((l) => ({
              description: l.description,
              quantity: l.quantity.toDecimalPlaces(6).toFixed(6),
              unitPrice: l.unitPrice.toDecimalPlaces(6).toFixed(6),
              lineTotal: l.lineTotal.toDecimalPlaces(6).toFixed(6),
              taxRate: l.taxRate ? l.taxRate.toDecimalPlaces(6).toFixed(6) : null,
            })),
          },
        },
        select: { id: true, creditNoteNumber: true },
      });

      // Post journal entry: DR Sales, CR AR
      const accountsByCode = await getInvoicePostingAccountsTx(tx, invoice.companyId);
      const arId = accountsByCode.get("1200");
      if (!arId) throw new Error("Missing GL account code 1200 (Accounts Receivable)");
      const salesId = accountsByCode.get("4100");
      if (!salesId) throw new Error("Missing GL account code 4100 (Sales Revenue)");
      const vatId = accountsByCode.get("2250");

      const cc = invoice.currencyCode as CurrencyCode;
      const jLines: { accountId: string; dc: "DEBIT" | "CREDIT"; amount: string; currencyCode: CurrencyCode }[] = [
        { accountId: salesId.id, dc: "DEBIT", amount: subtotal.toFixed(6), currencyCode: cc },
      ];
      if (taxTotal.gt(zero) && vatId) {
        jLines.push({ accountId: vatId.id, dc: "DEBIT", amount: taxTotal.toFixed(6), currencyCode: cc });
      }
      jLines.push({ accountId: arId.id, dc: "CREDIT", amount: total.toFixed(6), currencyCode: cc });

      const reasonStr = body.reason ? ` — ${body.reason}` : "";
      const entry = await createPostedJournalEntryTx(tx, {
        companyId: invoice.companyId,
        branchId: invoice.branchId ?? undefined,
        entryDate: new Date(),
        description: `Credit Note ${cnNumber} for Invoice ${invoice.invoiceNumber}${reasonStr}`,
        baseCurrencyCode: invoice.baseCurrencyCode,
        currencyCode: invoice.currencyCode,
        exchangeRateId: invoice.exchangeRateId ?? undefined,
        referenceType: "CREDIT_NOTE",
        referenceId: creditNote.id,
        createdById: session.user.id,
        lines: jLines,
      });

      await tx.creditNote.update({ where: { id: creditNote.id }, data: { journalEntryId: entry.id } });

      return { creditNoteId: creditNote.id, creditNoteNumber: cnNumber, journalEntryId: entry.id };
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    return Response.json(result, { status: 201 });
  } catch (e) {
    const message = readTransactionErrorMessage(e);
    return Response.json({ error: message }, { status: 400 });
  }
}
