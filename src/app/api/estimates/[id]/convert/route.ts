import { getServerSession } from "next-auth";

import { Prisma } from "@/generated/prisma/client";
import { ensureInvoicePostingAccounts, getInvoicePostingAccountsTx, groupRevenueByProductAccount } from "@/lib/accounting/coa/invoice-posting-accounts";
import { createPostedJournalEntryTx } from "@/lib/accounting/journal/create";
import { authOptions } from "@/lib/auth/options";
import { INTERACTIVE_TRANSACTION_OPTIONS, readTransactionErrorMessage } from "@/lib/db/interactive-transaction";
import { prisma } from "@/lib/db/prisma";
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
  if (!hasPermission(session, PERMISSIONS.ESTIMATE_WRITE)) return Response.json({ error: "Not authorized" }, { status: 403 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) return Response.json({ error: "Not authorized to create invoices" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { id: true, baseCurrencyCode: true } });
  if (!company) return Response.json({ error: "Company not found" }, { status: 400 });

  try {
    await ensureInvoicePostingAccounts(prisma, company.id);

    const result = await prisma.$transaction(async (tx) => {
      const estimate = await tx.estimate.findFirst({
        where: { id, companyId: company.id },
        include: { lineItems: true, exchangeRate: true },
      });
      if (!estimate) throw new Error("Estimate not found");
      if (estimate.status === "CONVERTED") throw new Error("Estimate already converted");
      if (estimate.status === "REJECTED" || estimate.status === "EXPIRED") throw new Error("Cannot convert a rejected or expired estimate");

      // Generate next invoice number
      const latestInvoice = await tx.invoice.findFirst({
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        select: { invoiceNumber: true },
      });
      let invoiceNumber = "INV-0001";
      if (latestInvoice?.invoiceNumber) {
        const match = latestInvoice.invoiceNumber.match(/([0-9]+)$/);
        if (match) {
          const num = parseInt(match[1], 10) + 1;
          invoiceNumber = latestInvoice.invoiceNumber.slice(0, -match[1].length) + String(num).padStart(match[1].length, "0");
        }
      }

      // Create invoice with same data
      const invoice = await tx.invoice.create({
        data: {
          companyId: company.id,
          branchId: estimate.branchId,
          customerId: estimate.customerId,
          invoiceNumber,
          status: "SENT",
          issueDate: new Date(),
          currencyCode: estimate.currencyCode,
          baseCurrencyCode: estimate.baseCurrencyCode,
          exchangeRateId: estimate.exchangeRateId,
          subtotal: estimate.subtotal,
          discountType: estimate.discountType,
          discountValue: estimate.discountValue,
          discountAmount: estimate.discountAmount,
          taxTotal: estimate.taxTotal,
          total: estimate.total,
          subtotalBase: estimate.subtotalBase,
          discountAmountBase: estimate.discountAmountBase,
          taxTotalBase: estimate.taxTotalBase,
          totalBase: estimate.totalBase,
          lineItems: {
            create: estimate.lineItems.map((l) => ({
              description: l.description,
              costCenterId: l.costCenterId,
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountType: l.discountType,
              discountValue: l.discountValue,
              lineTotal: l.lineTotal,
              taxRate: l.taxRate,
            })),
          },
        },
        select: { id: true, invoiceNumber: true, issueDate: true, exchangeRateId: true, branchId: true },
      });

      // Post journal entry for the invoice
      const accountsByCode = await getInvoicePostingAccountsTx(tx, company.id);
      const arId = mustGetPostingAccountIdByCode({ accountsByCode, code: "1200" });
      const salesId = mustGetPostingAccountIdByCode({ accountsByCode, code: "4100" });
      const vatId = mustGetPostingAccountIdByCode({ accountsByCode, code: "2250" });

      const zero = new Prisma.Decimal(0);
      const total = new Prisma.Decimal(String(estimate.total));
      const totalBase = new Prisma.Decimal(String(estimate.totalBase));
      const taxTotal = new Prisma.Decimal(String(estimate.taxTotal));
      const taxTotalBase = new Prisma.Decimal(String(estimate.taxTotalBase));
      const subtotal = new Prisma.Decimal(String(estimate.subtotal));
      const discountAmount = new Prisma.Decimal(String(estimate.discountAmount));

      const computedLines = estimate.lineItems.map((l) => ({
        productId: l.productId,
        lineTotal: new Prisma.Decimal(String(l.lineTotal)),
      }));
      const revenueByAccount = await groupRevenueByProductAccount(tx, computedLines, salesId);

      const rateDecimal = estimate.exchangeRate ? new Prisma.Decimal(String(estimate.exchangeRate.rate)) : null;
      const mulToBase = (amt: Prisma.Decimal) => {
        if (estimate.currencyCode === estimate.baseCurrencyCode) return amt;
        if (!rateDecimal) throw new Error("Missing exchange rate");
        return amt.mul(rateDecimal);
      };

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
        ...(taxTotal.gt(zero)
          ? [{ accountId: vatId, dc: "CREDIT" as const, amount: taxTotal.toFixed(6), amountBase: taxTotalBase.toFixed(6) }]
          : []),
      ];

      const entry = await createPostedJournalEntryTx(tx, {
        companyId: company.id,
        branchId: invoice.branchId ?? undefined,
        entryDate: invoice.issueDate,
        description: `Invoice ${invoice.invoiceNumber} (from Estimate)`,
        baseCurrencyCode: estimate.baseCurrencyCode,
        currencyCode: estimate.currencyCode,
        exchangeRateId: invoice.exchangeRateId ?? undefined,
        referenceType: "INVOICE",
        referenceId: invoice.id,
        createdById: session.user.id,
        lines: postingLines.map((l) => ({
          accountId: l.accountId,
          dc: l.dc,
          amount: l.amount,
          amountBase: l.amountBase,
          currencyCode: estimate.currencyCode,
        })),
      });

      await tx.invoice.update({ where: { id: invoice.id }, data: { journalEntryId: entry.id } });

      // Mark estimate as converted
      await tx.estimate.update({ where: { id }, data: { status: "CONVERTED", convertedInvoiceId: invoice.id } });

      return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    return Response.json(result, { status: 201 });
  } catch (e) {
    const message = readTransactionErrorMessage(e);
    return Response.json({ error: message }, { status: 400 });
  }
}
