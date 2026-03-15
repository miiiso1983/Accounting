import { getServerSession } from "next-auth";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { ensurePaymentPostingAccounts, getPaymentPostingAccountsTx } from "@/lib/accounting/coa/payment-posting-accounts";
import { createPostedJournalEntryTx } from "@/lib/accounting/journal/create";
import { authOptions } from "@/lib/auth/options";
import { INTERACTIVE_TRANSACTION_OPTIONS, readTransactionErrorMessage } from "@/lib/db/interactive-transaction";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const TRANSFER_ACCOUNTS = ["1110", "1111", "1120", "1121"] as const;

const BodySchema = z.object({
  transferDate: z.string().min(1),
  sourceAccountCode: z.enum(TRANSFER_ACCOUNTS),
  destinationAccountCode: z.enum(TRANSFER_ACCOUNTS),
  amount: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1)),
  currencyCode: z.enum(["IQD", "USD"]),
  exchangeRate: z
    .object({ rate: z.string().min(1) })
    .optional(),
  description: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() ? v.trim() : undefined) : v),
    z.string().optional(),
  ),
});

function parseDateOnly(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid transfer date");
  return d;
}

function mustGetAccountId(accountsByCode: Map<string, { id: string }>, code: string) {
  const a = accountsByCode.get(code);
  if (!a) throw new Error(`Missing required GL account code ${code}. Seed Chart of Accounts.`);
  return a.id;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.JOURNAL_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const raw = await req.json();
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const body = parsed.data;

  if (body.sourceAccountCode === body.destinationAccountCode) {
    return Response.json({ error: "Source and destination accounts must be different" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { baseCurrencyCode: true } });
  if (!company) return Response.json({ error: "Company not found" }, { status: 404 });

  let transferDate: Date;
  let amount: Prisma.Decimal;
  try {
    transferDate = parseDateOnly(body.transferDate);
    amount = new Prisma.Decimal(body.amount);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Invalid input" }, { status: 400 });
  }
  if (amount.lte(0)) return Response.json({ error: "Amount must be > 0" }, { status: 400 });

  const baseCurrencyCode = company.baseCurrencyCode;
  const txCurrency = body.currencyCode as "IQD" | "USD";

  try {
    await ensurePaymentPostingAccounts(prisma, companyId);

    const entry = await prisma.$transaction(async (tx) => {
      const accountsByCode = await getPaymentPostingAccountsTx(tx, companyId);
      const sourceId = mustGetAccountId(accountsByCode, body.sourceAccountCode);
      const destId = mustGetAccountId(accountsByCode, body.destinationAccountCode);

      let exchangeRateId: string | undefined;
      if (txCurrency !== baseCurrencyCode) {
        if (!body.exchangeRate?.rate) {
          throw new Error("Exchange rate is required when transfer currency differs from base currency");
        }
        const fx = await tx.exchangeRate.create({
          data: {
            companyId,
            baseCurrencyCode: txCurrency,
            quoteCurrencyCode: baseCurrencyCode,
            rate: body.exchangeRate.rate,
            effectiveAt: transferDate,
            source: "manual",
          },
          select: { id: true },
        });
        exchangeRateId = fx.id;
      }

      const desc = body.description || `Fund transfer: ${body.sourceAccountCode} → ${body.destinationAccountCode}`;

      return createPostedJournalEntryTx(tx, {
        companyId,
        entryDate: transferDate,
        description: desc,
        baseCurrencyCode,
        currencyCode: txCurrency,
        exchangeRateId,
        referenceType: "FUND_TRANSFER",
        createdById: session.user.id,
        lines: [
          { accountId: destId, dc: "DEBIT", amount: amount.toFixed(6), currencyCode: txCurrency },
          { accountId: sourceId, dc: "CREDIT", amount: amount.toFixed(6), currencyCode: txCurrency },
        ],
      });
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    return Response.json({ id: entry.id });
  } catch (e) {
    const message = readTransactionErrorMessage(e);
    return Response.json({ error: message }, { status: 400 });
  }
}

