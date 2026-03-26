import { getServerSession } from "next-auth";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { ensurePaymentPostingAccounts, getPaymentPostingAccountsTx } from "@/lib/accounting/coa/payment-posting-accounts";
import { createPostedJournalEntryTx } from "@/lib/accounting/journal/create";
import { authOptions } from "@/lib/auth/options";
import { INTERACTIVE_TRANSACTION_OPTIONS, readTransactionErrorMessage } from "@/lib/db/interactive-transaction";
import { prisma } from "@/lib/db/prisma";
import { notifyPaymentReceipt } from "@/lib/payments/notify";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const BodySchema = z.object({
  paymentDate: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() ? v.trim() : undefined) : v),
    z.string().optional(),
  ), // yyyy-mm-dd
  amount: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1)),
  currencyCode: z.enum(["IQD", "USD"]).optional(),
  method: z.enum(["CASH", "BANK", "TRANSFER"]).optional(),
  note: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() ? v.trim() : undefined) : v),
    z.string().optional(),
  ),
  exchangeRate: z.preprocess(
    (v) => {
      if (!v || typeof v !== "object") return v;
      const rate = (v as { rate?: unknown }).rate;
      if (typeof rate !== "string") return v;
      const trimmed = rate.trim();
      if (!trimmed) return undefined;
      return { rate: trimmed };
    },
    z
      .object({
        rate: z.string().min(1),
      })
      .optional(),
  ),
  notify: z.boolean().optional(),
});

function mustGetPostingAccountIdByCode(args: { accountsByCode: Map<string, { id: string }>; code: string }) {
  const a = args.accountsByCode.get(args.code);
  if (!a) throw new Error(`Missing required GL account code ${args.code}. Seed Chart of Accounts for the company.`);
  return a.id;
}

function selectDepositAccountCode(method: string | undefined, currencyCode: "IQD" | "USD") {
  const m = (method ?? "CASH").toUpperCase();
  if (m === "BANK") return currencyCode === "USD" ? "1121" : "1120";
  // Default to cash for CASH/TRANSFER/unknown.
  return currencyCode === "USD" ? "1111" : "1110";
}

function parseDateOnly(dateStr: string | undefined) {
  if (!dateStr) return new Date();
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid paymentDate");
  return d;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: invoiceId } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_PAYMENT_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    return Response.json({ error: details ? `Invalid payload: ${details}` : "Invalid payload" }, { status: 400 });
  }

  const body = parsed.data;
  const notify = body.notify ?? true;

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId: user.companyId },
    select: {
      id: true,
      companyId: true,
			branchId: true,
      invoiceNumber: true,
      status: true,
      currencyCode: true,
      baseCurrencyCode: true,
      exchangeRateId: true,
      totalBase: true,
    },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  if (invoice.status === "CANCELLED") return Response.json({ error: "Cannot record payment for cancelled invoice" }, { status: 400 });
  if (invoice.status === "DRAFT") return Response.json({ error: "Send/post the invoice before recording payments" }, { status: 400 });

  const paymentCurrency = (body.currencyCode ?? invoice.currencyCode) as "IQD" | "USD";
  let paymentDate: Date;
  let amount: Prisma.Decimal;
  try {
    paymentDate = parseDateOnly(body.paymentDate);
    amount = new Prisma.Decimal(body.amount);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Invalid payment payload" }, { status: 400 });
  }
  if (amount.lte(0)) return Response.json({ error: "Amount must be > 0" }, { status: 400 });

	let created: { paymentId: string; journalEntryId: string; invoiceStatus: string };
	try {
		await ensurePaymentPostingAccounts(prisma, invoice.companyId);

		created = await prisma.$transaction(async (tx) => {
      const accountsByCode = await getPaymentPostingAccountsTx(tx, invoice.companyId);
      const arId = mustGetPostingAccountIdByCode({ accountsByCode, code: "1200" });
      const depositCode = selectDepositAccountCode(body.method, paymentCurrency);
      const depositId = mustGetPostingAccountIdByCode({ accountsByCode, code: depositCode });

      let exchangeRateId: string | undefined;
      if (paymentCurrency !== invoice.baseCurrencyCode) {
        if (body.exchangeRate?.rate) {
          const fx = await tx.exchangeRate.create({
            data: {
              companyId: invoice.companyId,
              baseCurrencyCode: paymentCurrency,
              quoteCurrencyCode: invoice.baseCurrencyCode,
              rate: body.exchangeRate.rate,
              effectiveAt: paymentDate,
              source: "manual",
            },
            select: { id: true },
          });
          exchangeRateId = fx.id;
        } else if (invoice.exchangeRateId && invoice.currencyCode === paymentCurrency) {
          exchangeRateId = invoice.exchangeRateId;
        } else {
          throw new Error("Exchange rate is required when payment currency != base currency");
        }
      }

      const fx = exchangeRateId
        ? await tx.exchangeRate.findUnique({ where: { id: exchangeRateId }, select: { baseCurrencyCode: true, quoteCurrencyCode: true, rate: true } })
        : null;
      const amountBase = paymentCurrency === invoice.baseCurrencyCode
        ? amount
        : (() => {
            if (!fx) throw new Error("Missing exchange rate");
            if (fx.baseCurrencyCode !== paymentCurrency || fx.quoteCurrencyCode !== invoice.baseCurrencyCode) {
              throw new Error("Exchange rate currency pair does not match payment/base currencies");
            }
            // 1 paymentCurrency = rate baseCurrency
            return amount.mul(fx.rate);
          })();

      const payment = await tx.invoicePayment.create({
        data: {
          companyId: invoice.companyId,
          invoiceId: invoice.id,
          paymentDate,
          method: body.method ?? "CASH",
          note: body.note ?? null,
          amount: amount.toFixed(6),
          currencyCode: paymentCurrency,
          baseCurrencyCode: invoice.baseCurrencyCode,
          exchangeRateId: exchangeRateId ?? null,
          amountBase: amountBase.toDecimalPlaces(6).toFixed(6),
          createdById: session.user.id,
        },
        select: { id: true },
      });

      const entry = await createPostedJournalEntryTx(tx, {
        companyId: invoice.companyId,
				branchId: invoice.branchId ?? undefined,
        entryDate: paymentDate,
        description: `Payment for Invoice ${invoice.invoiceNumber}`,
        baseCurrencyCode: invoice.baseCurrencyCode,
        currencyCode: paymentCurrency,
        exchangeRateId,
        referenceType: "INVOICE_PAYMENT",
        referenceId: payment.id,
        createdById: session.user.id,
        lines: [
          { accountId: depositId, dc: "DEBIT", amount: amount.toFixed(6), currencyCode: paymentCurrency },
          { accountId: arId, dc: "CREDIT", amount: amount.toFixed(6), currencyCode: paymentCurrency },
        ],
      });

      await tx.invoicePayment.update({ where: { id: payment.id }, data: { journalEntryId: entry.id } });

      const totals = await tx.invoicePayment.aggregate({
        where: { invoiceId: invoice.id, companyId: invoice.companyId },
        _sum: { amountBase: true },
      });

      const paidBase = totals._sum.amountBase ? new Prisma.Decimal(totals._sum.amountBase) : new Prisma.Decimal(0);
      const isPaid = paidBase.gte(invoice.totalBase);
      if (isPaid) {
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" }, select: { id: true } });
      }

			return { paymentId: payment.id, journalEntryId: entry.id, invoiceStatus: isPaid ? ("PAID" as const) : (invoice.status as string) };
    }, INTERACTIVE_TRANSACTION_OPTIONS);
  } catch (e) {
    const message = readTransactionErrorMessage(e);
    return Response.json({ error: message }, { status: 400 });
  }

	// Notifications should never fail payment creation.
	let notifications: Record<string, unknown> | undefined;
	if (notify) {
		const normalize = (res: PromiseSettledResult<unknown>) => {
			if (res.status === "fulfilled") return res.value;
			const reason = res.reason;
			const error = reason instanceof Error ? reason.message : "Notification failed";
			return { success: false, error };
		};

		const [emailRes, waRes] = await Promise.allSettled([
			notifyPaymentReceipt({ paymentId: created.paymentId, companyId: invoice.companyId, channel: "email" }),
			notifyPaymentReceipt({ paymentId: created.paymentId, companyId: invoice.companyId, channel: "whatsapp" }),
		]);
		notifications = { email: normalize(emailRes), whatsapp: normalize(waRes) };
	}

	return Response.json({ ...created, notifications }, { status: 201 });
}
