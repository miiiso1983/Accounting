import { Prisma, type CurrencyCode, type Dc, type PrismaClient } from "../../../generated/prisma/client";
import type { CreateJournalEntryInput, JournalLineInput } from "./types";

export async function createPostedJournalEntryTx(tx: Prisma.TransactionClient, input: CreateJournalEntryInput) {
  if (input.lines.length < 2) throw new Error("Journal entry must have at least 2 lines");

  const needsExchangeRate = input.lines.some((line) => !line.amountBase && line.currencyCode !== input.baseCurrencyCode);
  const exchangeRate = input.exchangeRateId && needsExchangeRate
    ? await tx.exchangeRate.findUnique({ where: { id: input.exchangeRateId } })
    : null;

  const normalizedLines = input.lines.map((l) => normalizeLine(l, input.baseCurrencyCode, exchangeRate));
  assertBalanced(normalizedLines);

  // Validate accounts exist and are posting accounts
  const accountIds = [...new Set(normalizedLines.map((l) => l.accountId))];
  const accounts = await tx.glAccount.findMany({
    where: { id: { in: accountIds }, companyId: input.companyId },
    select: { id: true, isPosting: true },
  });
  const map = new Map(accounts.map((a) => [a.id, a] as const));
  for (const id of accountIds) {
    const a = map.get(id);
    if (!a) throw new Error(`GL account not found for company: ${id}`);
    if (!a.isPosting) throw new Error(`Cannot post to non-posting account: ${id}`);
  }

  return tx.journalEntry.create({
    data: {
      companyId: input.companyId,
      status: "POSTED",
      entryDate: input.entryDate,
      description: input.description,
      baseCurrencyCode: input.baseCurrencyCode,
      currencyCode: input.currencyCode ?? null,
      exchangeRateId: input.exchangeRateId ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      createdById: input.createdById ?? null,
      lines: {
        create: normalizedLines.map((l) => ({
          accountId: l.accountId,
          dc: l.dc,
          amount: l.amount,
          currencyCode: l.currencyCode,
          amountBase: l.amountBase,
          description: l.description ?? null,
        })),
      },
    },
    include: { lines: true },
  });
}

export async function createPostedJournalEntry(prisma: PrismaClient, input: CreateJournalEntryInput) {
  return prisma.$transaction(async (tx) => createPostedJournalEntryTx(tx, input));
}

function normalizeLine(
  line: JournalLineInput,
  entryBaseCurrency: CurrencyCode,
  exchangeRate: { baseCurrencyCode: CurrencyCode; quoteCurrencyCode: CurrencyCode; rate: Prisma.Decimal } | null,
) {
  const amount = new Prisma.Decimal(line.amount);
  if (amount.lte(0)) throw new Error("Line amount must be > 0");

  const amountBase = line.amountBase
    ? new Prisma.Decimal(line.amountBase)
    : convertToBase({
        amount,
        amountCurrency: line.currencyCode,
        entryBaseCurrency,
        exchangeRate,
      });

  return {
    ...line,
    amount: amount.toDecimalPlaces(6),
    amountBase: amountBase.toDecimalPlaces(6),
  };
}

function convertToBase(args: {
  amount: Prisma.Decimal;
  amountCurrency: CurrencyCode;
  entryBaseCurrency: CurrencyCode;
  exchangeRate: { baseCurrencyCode: CurrencyCode; quoteCurrencyCode: CurrencyCode; rate: Prisma.Decimal } | null;
}) {
  const { amount, amountCurrency, entryBaseCurrency, exchangeRate } = args;

  if (amountCurrency === entryBaseCurrency) return amount;
  if (!exchangeRate) throw new Error("exchangeRateId is required when line currency != base currency");

  const { baseCurrencyCode, quoteCurrencyCode, rate } = exchangeRate;

  // rate meaning: 1 baseCurrencyCode = rate quoteCurrencyCode
  if (entryBaseCurrency === baseCurrencyCode && amountCurrency === quoteCurrencyCode) {
    // quote -> base
    return amount.div(rate);
  }
  if (entryBaseCurrency === quoteCurrencyCode && amountCurrency === baseCurrencyCode) {
    // base -> quote
    return amount.mul(rate);
  }

  throw new Error(
    `Exchange rate (${baseCurrencyCode}/${quoteCurrencyCode}) cannot convert ${amountCurrency} to base ${entryBaseCurrency}`,
  );
}

function assertBalanced(lines: Array<{ dc: Dc; amountBase: Prisma.Decimal }>) {
  const debit = new Prisma.Decimal(0);
  const credit = new Prisma.Decimal(0);

  const totals = lines.reduce(
    (acc, l) => {
      if (l.dc === "DEBIT") acc.debit = acc.debit.plus(l.amountBase);
      else acc.credit = acc.credit.plus(l.amountBase);
      return acc;
    },
    { debit, credit },
  );

  const d = totals.debit.toDecimalPlaces(6);
  const c = totals.credit.toDecimalPlaces(6);
  if (!d.eq(c)) throw new Error(`Unbalanced journal entry: debit=${d.toFixed()} credit=${c.toFixed()}`);
}
