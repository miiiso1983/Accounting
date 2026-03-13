import { getServerSession } from "next-auth";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth/options";
import { ensureInvoicePostingAccountsTx } from "@/lib/accounting/coa/invoice-posting-accounts";
import { prisma } from "@/lib/db/prisma";
import { createPostedJournalEntryTx } from "@/lib/accounting/journal/create";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const BodySchema = z.object({
  invoiceNumber: z.string().min(1),
  customerId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().or(z.literal("")),
  currencyCode: z.enum(["IQD", "USD"]),
  exchangeRate: z
    .object({
      rate: z.string().min(1),
    })
    .optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  discountValue: z.string().optional().or(z.literal("")),
  paymentTerms: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).optional(),
  mode: z.enum(["DRAFT", "SEND"]),
  lines: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.string().min(1),
        unitPrice: z.string().min(1),
        taxRate: z.string().optional().or(z.literal("")),
      }),
    )
    .min(1),
});

function mustGetPostingAccountIdByCode(args: { accountsByCode: Map<string, { id: string }>; code: string }) {
  const a = args.accountsByCode.get(args.code);
  if (!a) throw new Error(`Missing required GL account code ${args.code}. Seed Chart of Accounts for the company.`);
  return a.id;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { id: true, baseCurrencyCode: true } });
  if (!company) return Response.json({ error: "Company not found" }, { status: 400 });

  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  const issueDate = new Date(`${body.issueDate}T00:00:00.000Z`);
  const dueDate = body.dueDate ? new Date(`${body.dueDate}T00:00:00.000Z`) : null;
  const baseCurrencyCode = company.baseCurrencyCode;
  const invoiceCurrency = body.currencyCode;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: body.customerId, companyId: company.id }, select: { id: true } });
      if (!customer) throw new Error("Customer not found");

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

        const lineTotal = qty.mul(price);
        const taxRate = l.taxRate ? new Prisma.Decimal(l.taxRate) : null;
        if (taxRate && taxRate.lt(0)) throw new Error("Tax rate must be >= 0");
        const lineTax = taxRate ? lineTotal.mul(taxRate) : zero;

        return {
          description: l.description,
          quantity: qty,
          unitPrice: price,
          lineTotal,
          taxRate,
          lineTax,
        };
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

      const invoice = await tx.invoice.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          invoiceNumber: body.invoiceNumber,
          status: body.mode === "SEND" ? "SENT" : "DRAFT",
          issueDate,
          dueDate,
          currencyCode: invoiceCurrency,
          baseCurrencyCode,
          exchangeRateId,
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
              quantity: l.quantity.toDecimalPlaces(6).toFixed(6),
              unitPrice: l.unitPrice.toDecimalPlaces(6).toFixed(6),
              lineTotal: l.lineTotal.toDecimalPlaces(6).toFixed(6),
              taxRate: l.taxRate ? l.taxRate.toDecimalPlaces(6).toFixed(6) : null,
            })),
          },
        },
        select: { id: true, invoiceNumber: true, issueDate: true, exchangeRateId: true, journalEntryId: true },
      });

      if (body.mode === "SEND") {
        const accountsByCode = await ensureInvoicePostingAccountsTx(tx, company.id);
        const arId = mustGetPostingAccountIdByCode({ accountsByCode, code: "1200" });
        const salesId = mustGetPostingAccountIdByCode({ accountsByCode, code: "4100" });
        const vatId = mustGetPostingAccountIdByCode({ accountsByCode, code: "2250" });

        const postingLines = [
          { accountId: arId, dc: "DEBIT" as const, amount: total.toFixed(6) },
          { accountId: salesId, dc: "CREDIT" as const, amount: afterDiscount.toFixed(6) },
          ...(taxTotal.gt(0)
            ? [{ accountId: vatId, dc: "CREDIT" as const, amount: taxTotal.toFixed(6) }]
            : []),
        ];

        const entry = await createPostedJournalEntryTx(tx, {
          companyId: company.id,
          entryDate: issueDate,
          description: `Invoice ${invoice.invoiceNumber}`,
          baseCurrencyCode,
          currencyCode: invoiceCurrency,
          exchangeRateId: invoice.exchangeRateId ?? undefined,
          referenceType: "INVOICE",
          referenceId: invoice.id,
          createdById: session.user.id,
          lines: postingLines.map((l) => ({
            accountId: l.accountId,
            dc: l.dc,
            amount: l.amount,
            currencyCode: invoiceCurrency,
          })),
        });

        await tx.invoice.update({ where: { id: invoice.id }, data: { journalEntryId: entry.id } });
      }

      return invoice;
    });

    return Response.json({ id: created.id }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
