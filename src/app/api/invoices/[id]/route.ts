import { getServerSession } from "next-auth";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { ensureInvoicePostingAccounts, getInvoicePostingAccountsTx, groupRevenueByProductAccount } from "@/lib/accounting/coa/invoice-posting-accounts";
import { createPostedJournalEntryTx } from "@/lib/accounting/journal/create";
import { authOptions } from "@/lib/auth/options";
import { INTERACTIVE_TRANSACTION_OPTIONS, readTransactionErrorMessage } from "@/lib/db/interactive-transaction";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const UpdateBodySchema = z.object({
  invoiceNumber: z.string().min(1),
  customerId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().or(z.literal("")),
  currencyCode: z.enum(["IQD", "USD"]),
  exchangeRate: z
    .object({ rate: z.string().min(1) })
    .optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  discountValue: z.string().optional().or(z.literal("")),
  paymentTerms: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).optional(),
  salesRepresentativeId: z.string().optional().or(z.literal("")),
	branchId: z.string().optional().or(z.literal("")),
  lines: z
    .array(
      z.object({
        description: z.string().min(1),
				costCenterId: z.string().optional().or(z.literal("")),
        productId: z.string().optional().or(z.literal("")),
        quantity: z.string().min(1),
        unitPrice: z.string().min(1),
        discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
        discountValue: z.string().optional().or(z.literal("")),
        taxRate: z.string().optional().or(z.literal("")),
      }),
    )
    .min(1),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: user.companyId },
    include: { customer: true, exchangeRate: true, lineItems: true, salesRepresentative: { select: { id: true, name: true } } },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(invoice);
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { id: true, baseCurrencyCode: true } });
  if (!company) return Response.json({ error: "Company not found" }, { status: 400 });

  const existing = await prisma.invoice.findFirst({
    where: { id, companyId: company.id },
		select: { id: true, status: true, journalEntryId: true, invoiceNumber: true, branchId: true },
  });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "DRAFT" && existing.status !== "SENT") {
    return Response.json({ error: "Only DRAFT or SENT invoices can be edited" }, { status: 400 });
  }
  const isPosted = existing.status === "SENT" && !!existing.journalEntryId;

  const json = await req.json();
  const parsed = UpdateBodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

	const requestedBranchIdRaw = typeof body.branchId === "string" ? body.branchId.trim() : undefined;
	const nextBranchId =
		requestedBranchIdRaw === undefined ? (existing.branchId ?? null) : (requestedBranchIdRaw.length > 0 ? requestedBranchIdRaw : null);


  const issueDate = new Date(`${body.issueDate}T00:00:00.000Z`);
  const dueDate = body.dueDate ? new Date(`${body.dueDate}T00:00:00.000Z`) : null;
  const baseCurrencyCode = company.baseCurrencyCode;
  const invoiceCurrency = body.currencyCode;

  try {
    const updated = await prisma.$transaction(async (tx) => {
			if (nextBranchId) {
				const b = await tx.branch.findFirst({ where: { id: nextBranchId, companyId: company.id }, select: { id: true } });
				if (!b) throw new Error("Invalid branch");
			}

      const customer = await tx.customer.findFirst({ where: { id: body.customerId, companyId: company.id }, select: { id: true } });
      if (!customer) throw new Error("Customer not found");

      // Validate sales representative
      const salesRepId = body.salesRepresentativeId?.trim() || null;
      if (salesRepId) {
        const rep = await tx.salesRepresentative.findFirst({ where: { id: salesRepId, companyId: company.id, isActive: true }, select: { id: true } });
        if (!rep) throw new Error("Sales representative not found or inactive");
      }

			const costCenterIds = Array.from(
				new Set(body.lines.map((l) => (l.costCenterId ?? "").trim()).filter(Boolean)),
			);
			if (costCenterIds.length > 0) {
				const found = await tx.costCenter.findMany({
					where: { companyId: company.id, id: { in: costCenterIds } },
					select: { id: true },
				});
				if (found.length !== costCenterIds.length) throw new Error("Invalid cost center");
			}

      let exchangeRateId: string | null = null;
      let rateDecimal: Prisma.Decimal | null = null;
      if (invoiceCurrency !== baseCurrencyCode) {
        const rateStr = body.exchangeRate?.rate;
        if (!rateStr) throw new Error("Exchange rate is required when invoice currency != base currency");
        rateDecimal = new Prisma.Decimal(rateStr);
        if (rateDecimal.lte(0)) throw new Error("Exchange rate must be > 0");

        const fx = await tx.exchangeRate.create({
          data: {
            companyId: company.id,
            baseCurrencyCode: invoiceCurrency,
            quoteCurrencyCode: baseCurrencyCode,
            rate: rateStr,
            effectiveAt: issueDate,
            source: "invoice-manual",
          },
          select: { id: true },
        });
        exchangeRateId = fx.id;
      }

      const zero = new Prisma.Decimal(0);
			const computedLines = body.lines.map((l) => {
        const qty = new Prisma.Decimal(l.quantity);
        const price = new Prisma.Decimal(l.unitPrice);
        if (qty.lte(0)) throw new Error("Quantity must be > 0");
        if (price.lt(0)) throw new Error("Unit price must be >= 0");
        const grossTotal = qty.mul(price);

        const lineDiscountType = l.discountType ?? null;
        const lineDiscountValue = l.discountValue ? new Prisma.Decimal(l.discountValue) : zero;
        let lineDiscountAmount = zero;
        if (lineDiscountType === "PERCENTAGE" && lineDiscountValue.gt(0)) {
          lineDiscountAmount = grossTotal.mul(lineDiscountValue).div(100).toDecimalPlaces(6);
        } else if (lineDiscountType === "FIXED" && lineDiscountValue.gt(0)) {
          lineDiscountAmount = lineDiscountValue.toDecimalPlaces(6);
        }
        const lineTotal = grossTotal.minus(lineDiscountAmount);

        const taxRate = l.taxRate ? new Prisma.Decimal(l.taxRate) : null;
        if (taxRate && taxRate.lt(0)) throw new Error("Tax rate must be >= 0");
        const lineTax = taxRate ? lineTotal.mul(taxRate) : zero;
				const costCenterId = l.costCenterId?.trim() ? l.costCenterId.trim() : null;
				const productId = l.productId?.trim() ? l.productId.trim() : null;
				return { description: l.description, costCenterId, productId, quantity: qty, unitPrice: price, discountType: lineDiscountType, discountValue: lineDiscountValue, lineTotal, taxRate, lineTax };
      });

      const subtotal = computedLines.reduce((acc, l) => acc.plus(l.lineTotal), zero).toDecimalPlaces(6);

      // Discount calculation
      let discountAmount = zero;
      const discountType = body.discountType ?? null;
      const discountValue = body.discountValue ? new Prisma.Decimal(body.discountValue) : zero;
      if (discountType === "PERCENTAGE" && discountValue.gt(0)) {
        discountAmount = subtotal.mul(discountValue).div(100).toDecimalPlaces(6);
      } else if (discountType === "FIXED" && discountValue.gt(0)) {
        discountAmount = discountValue.toDecimalPlaces(6);
      }
      const afterDiscount = subtotal.minus(discountAmount);

      const taxTotal = computedLines.reduce((acc, l) => acc.plus(l.lineTax), zero).toDecimalPlaces(6);
      const total = afterDiscount.plus(taxTotal).toDecimalPlaces(6);
      if (total.lte(0)) throw new Error("Invoice total must be > 0");

      const mulToBase = (amt: Prisma.Decimal) => {
        if (invoiceCurrency === baseCurrencyCode) return amt;
        if (!rateDecimal) throw new Error("Missing exchange rate");
        return amt.mul(rateDecimal);
      };

      const subtotalBase = mulToBase(subtotal).toDecimalPlaces(6);
      const discountAmountBase = mulToBase(discountAmount).toDecimalPlaces(6);
      const taxTotalBase = mulToBase(taxTotal).toDecimalPlaces(6);
      const totalBase = mulToBase(total).toDecimalPlaces(6);

      // Delete old line items
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });

      // Update invoice
      const inv = await tx.invoice.update({
        where: { id },
        data: {
          customerId: customer.id,
					...(requestedBranchIdRaw === undefined ? {} : { branchId: nextBranchId }),
          invoiceNumber: body.invoiceNumber,
          issueDate,
          dueDate,
          currencyCode: invoiceCurrency,
          baseCurrencyCode,
          exchangeRateId,
          salesRepresentativeId: salesRepId,
          paymentTerms: body.paymentTerms || null,
          subtotal: subtotal.toFixed(6),
          discountType,
          discountValue: discountValue.toFixed(6),
          discountAmount: discountAmount.toFixed(6),
          taxTotal: taxTotal.toFixed(6),
          total: total.toFixed(6),
          subtotalBase: subtotalBase.toFixed(6),
          discountAmountBase: discountAmountBase.toFixed(6),
          taxTotalBase: taxTotalBase.toFixed(6),
          totalBase: totalBase.toFixed(6),
          lineItems: {
            create: computedLines.map((l) => ({
              description: l.description,
						costCenterId: l.costCenterId,
						productId: l.productId,
              quantity: l.quantity.toDecimalPlaces(6).toFixed(6),
              unitPrice: l.unitPrice.toDecimalPlaces(6).toFixed(6),
              discountType: l.discountType,
              discountValue: l.discountValue.toDecimalPlaces(6).toFixed(6),
              lineTotal: l.lineTotal.toDecimalPlaces(6).toFixed(6),
              taxRate: l.taxRate ? l.taxRate.toDecimalPlaces(6).toFixed(6) : null,
            })),
          },
        },
        select: { id: true },
      });

      // If the invoice was already posted (SENT), reverse old journal entry and create new one
      if (isPosted && existing.journalEntryId) {
        // Void the old journal entry
        const oldEntry = await tx.journalEntry.findUnique({
          where: { id: existing.journalEntryId },
          include: { lines: true },
        });

        if (oldEntry) {
          // Create reversal entry
          await createPostedJournalEntryTx(tx, {
            companyId: company.id,
						branchId: oldEntry.branchId ?? existing.branchId ?? undefined,
            entryDate: issueDate,
            description: `Reversal: Invoice ${existing.invoiceNumber} (edit)`,
            baseCurrencyCode,
            currencyCode: invoiceCurrency,
            exchangeRateId: exchangeRateId ?? undefined,
            referenceType: "INVOICE_REVERSAL",
            referenceId: inv.id,
            createdById: session.user.id,
            lines: oldEntry.lines.map((l) => ({
              accountId: l.accountId,
              dc: l.dc === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const),
              amount: l.amount.toFixed(6),
              amountBase: l.amountBase.toFixed(6),
              currencyCode: l.currencyCode,
            })),
          });
        }

        // Create new posting entry
        await ensureInvoicePostingAccounts(tx, company.id);
        const accountsByCode = await getInvoicePostingAccountsTx(tx, company.id);
        const mustGet = (code: string) => {
          const a = accountsByCode.get(code);
          if (!a) throw new Error(`Missing GL account code ${code}`);
          return a.id;
        };
        const arId = mustGet("1200");
        const salesId = mustGet("4100");
        const vatId = mustGet("2250");

        // Group revenue by product-level account (fallback to 4100)
        const revenueByAccount = await groupRevenueByProductAccount(tx, computedLines, salesId);
        const revenueCreditLines: { accountId: string; dc: "CREDIT"; amount: string; amountBase: string }[] = [];
        for (const [accountId, accountSubtotal] of revenueByAccount) {
          let adjustedAmount = accountSubtotal;
          if (discountAmount.gt(0) && subtotal.gt(0)) {
            const proportion = accountSubtotal.div(subtotal);
            adjustedAmount = accountSubtotal.minus(discountAmount.mul(proportion)).toDecimalPlaces(6);
          }
          revenueCreditLines.push({
            accountId,
            dc: "CREDIT" as const,
            amount: adjustedAmount.toFixed(6),
            amountBase: mulToBase(adjustedAmount).toDecimalPlaces(6).toFixed(6),
          });
        }

        const postingLines = [
          { accountId: arId, dc: "DEBIT" as const, amount: total.toFixed(6), amountBase: totalBase.toFixed(6) },
          ...revenueCreditLines,
          ...(taxTotal.gt(0)
            ? [{ accountId: vatId, dc: "CREDIT" as const, amount: taxTotal.toFixed(6), amountBase: taxTotalBase.toFixed(6) }]
            : []),
        ];

        const newEntry = await createPostedJournalEntryTx(tx, {
          companyId: company.id,
					branchId: nextBranchId ?? undefined,
          entryDate: issueDate,
          description: `Invoice ${body.invoiceNumber}`,
          baseCurrencyCode,
          currencyCode: invoiceCurrency,
          exchangeRateId: exchangeRateId ?? undefined,
          referenceType: "INVOICE",
          referenceId: inv.id,
          createdById: session.user.id,
          lines: postingLines.map((l) => ({
            accountId: l.accountId,
            dc: l.dc,
            amount: l.amount,
            amountBase: l.amountBase,
            currencyCode: invoiceCurrency,
          })),
        });

        await tx.invoice.update({ where: { id: inv.id }, data: { journalEntryId: newEntry.id } });
      }

      return inv;
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    return Response.json({ id: updated.id }, { status: 200 });
  } catch (e) {
    const message = readTransactionErrorMessage(e);
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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
    select: { id: true, status: true, journalEntryId: true },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });

  // Only allow deleting DRAFT invoices (no journal entry posted)
  if (invoice.status !== "DRAFT") {
    return Response.json({ error: "Only DRAFT invoices can be deleted. Void posted invoices instead." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Delete line items first
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      // Delete the invoice
      await tx.invoice.delete({ where: { id } });
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    return Response.json({ success: true });
  } catch (e) {
    const message = readTransactionErrorMessage(e);
    return Response.json({ error: message }, { status: 400 });
  }
}
