import { getServerSession } from "next-auth";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth/options";
import { createPostedJournalEntryTx } from "@/lib/accounting/journal/create";
import { MAX_EXPENSE_ATTACHMENTS } from "@/lib/attachments/constants";
import { cleanupStoredAttachments, saveExpenseAttachmentFile } from "@/lib/attachments/storage";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";

const LineItemSchema = z.object({
  accountId: z.string().min(1),
  costCenterId: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  amount: z.string().min(1),
});

const BodySchema = z.object({
  expenseDate: z.string().min(1),
  vendorName: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  productId: z.string().optional().or(z.literal("")),
  costCenterId: z.string().optional().or(z.literal("")),
  currencyCode: z.enum(["IQD", "USD"]),
  exchangeRate: z
    .object({
      rate: z.string().min(1),
    })
    .optional(),
  creditAccountId: z.string().min(1),
  lineItems: z.array(LineItemSchema).min(1),
});

type ExpenseBody = z.infer<typeof BodySchema>;

function errorMessage(error: z.ZodError<ExpenseBody>) {
  return error.issues.map((issue) => issue.message).join(", ") || "Invalid expense payload";
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string";
}

async function parseRequest(req: Request): Promise<{ body: ExpenseBody; attachments: File[] }> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      throw new Error("Invalid form data");
    }

    const exchangeRate = getFormString(formData, "exchangeRate");
    const lineItemsJson = getFormString(formData, "lineItems");
    let lineItems: unknown[] = [];
    try { lineItems = JSON.parse(lineItemsJson || "[]"); } catch { /* ignore */ }

    const parsed = BodySchema.safeParse({
      expenseDate: getFormString(formData, "expenseDate"),
      vendorName: getFormString(formData, "vendorName"),
      description: getFormString(formData, "description"),
      productId: getFormString(formData, "productId"),
      costCenterId: getFormString(formData, "costCenterId"),
      currencyCode: getFormString(formData, "currencyCode"),
      exchangeRate: exchangeRate ? { rate: exchangeRate } : undefined,
      creditAccountId: getFormString(formData, "creditAccountId"),
      lineItems,
    });
    if (!parsed.success) throw new Error(errorMessage(parsed.error));

    const attachments = formData.getAll("attachments").filter(isUploadedFile).filter((file) => file.size > 0);
    if (attachments.length > MAX_EXPENSE_ATTACHMENTS) {
      throw new Error(`You can upload up to ${MAX_EXPENSE_ATTACHMENTS} attachments per expense`);
    }

    return { body: parsed.data, attachments };
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new Error("Invalid JSON");
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) throw new Error(errorMessage(parsed.error));
  return { body: parsed.data, attachments: [] };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.EXPENSE_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { id: true, baseCurrencyCode: true } });
  if (!company) return Response.json({ error: "Company not found" }, { status: 400 });

  let requestData: { body: ExpenseBody; attachments: File[] };
  try {
    requestData = await parseRequest(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid expense payload";
    return Response.json({ error: message }, { status: 400 });
  }

  const { body, attachments } = requestData;

  const expenseDate = new Date(`${body.expenseDate}T00:00:00.000Z`);
  const baseCurrencyCode = company.baseCurrencyCode;
  const expenseCurrency = body.currencyCode;
  const writtenStorageKeys: string[] = [];

  try {
    const created = await prisma.$transaction(async (tx) => {
      // --- Auto-generate expense number ---
      const lastExpense = await tx.expense.findFirst({
        where: { companyId: company.id, expenseNumber: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { expenseNumber: true },
      });
      let nextNum = 1;
      if (lastExpense?.expenseNumber) {
        const match = lastExpense.expenseNumber.match(/EXP-(\d+)/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      const expenseNumber = `EXP-${String(nextNum).padStart(4, "0")}`;

      // --- Validate line items ---
      const parsedLines = body.lineItems.map((li) => {
        const amount = new Prisma.Decimal(li.amount);
        if (amount.lte(0)) throw new Error("Line item amount must be > 0");
        return { ...li, amountDecimal: amount };
      });
      const total = parsedLines.reduce((s, l) => s.plus(l.amountDecimal), new Prisma.Decimal(0));

      // --- Validate credit account ---
      const creditAccount = await tx.glAccount.findFirst({
        where: { id: body.creditAccountId, companyId: company.id },
        select: { id: true, isPosting: true, code: true },
      });
      if (!creditAccount) throw new Error("Credit account not found");
      if (!creditAccount.isPosting) throw new Error("Credit account must be a posting account");

      // --- Validate all expense accounts ---
      const accountIds = [...new Set(parsedLines.map((l) => l.accountId))];
      const accounts = await tx.glAccount.findMany({
        where: { id: { in: accountIds }, companyId: company.id, isPosting: true },
        select: { id: true },
      });
      const accountSet = new Set(accounts.map((a) => a.id));
      for (const id of accountIds) {
        if (!accountSet.has(id)) throw new Error(`Expense account not found or not a posting account: ${id}`);
      }

      let productId: string | null = null;
      const requestedProductId = body.productId?.trim();
      if (requestedProductId) {
        const product = await tx.product.findFirst({
          where: { id: requestedProductId, companyId: company.id, isActive: true },
          select: { id: true },
        });
        if (!product) throw new Error("Product not found");
        productId = product.id;
      }

      let costCenterId: string | null = null;
      const requestedCostCenterId = body.costCenterId?.trim();
      if (requestedCostCenterId) {
        const cc = await tx.costCenter.findFirst({
          where: { id: requestedCostCenterId, companyId: company.id, isActive: true },
          select: { id: true },
        });
        if (!cc) throw new Error("Cost center not found");
        costCenterId = cc.id;
      }

      let exchangeRateId: string | null = null;
      let rateDecimal: Prisma.Decimal | null = null;
      if (expenseCurrency !== baseCurrencyCode) {
        const rateStr = body.exchangeRate?.rate;
        if (!rateStr) throw new Error("Exchange rate is required when expense currency != base currency");
        rateDecimal = new Prisma.Decimal(rateStr);
        if (rateDecimal.lte(0)) throw new Error("Exchange rate must be > 0");

        const fx = await tx.exchangeRate.create({
          data: {
            companyId: company.id,
            baseCurrencyCode: expenseCurrency,
            quoteCurrencyCode: baseCurrencyCode,
            rate: rateStr,
            effectiveAt: expenseDate,
            source: "expense-manual",
          },
          select: { id: true },
        });
        exchangeRateId = fx.id;
      }

      const totalBase = expenseCurrency === baseCurrencyCode ? total : total.mul(rateDecimal!).toDecimalPlaces(6);

      // Use first line's account as the primary expenseAccountId
      const primaryAccountId = parsedLines[0].accountId;

      const expense = await tx.expense.create({
        data: {
          companyId: company.id,
          expenseNumber,
          status: "DRAFT",
          expenseDate,
          vendorName: body.vendorName || null,
          description: body.description || null,
          productId,
          costCenterId,
          currencyCode: expenseCurrency,
          baseCurrencyCode,
          exchangeRateId,
          total: total.toDecimalPlaces(6).toFixed(6),
          totalBase: totalBase.toFixed(6),
          expenseAccountId: primaryAccountId,
          lineItems: {
            create: parsedLines.map((li) => ({
              accountId: li.accountId,
              costCenterId: li.costCenterId?.trim() || null,
              description: li.description?.trim() || null,
              amount: li.amountDecimal.toDecimalPlaces(6).toFixed(6),
            })),
          },
        },
        select: { id: true, expenseNumber: true, exchangeRateId: true },
      });

      // --- Create journal entry with debit lines per line item + one credit ---
      const debitLines = parsedLines.map((li) => ({
        accountId: li.accountId,
        costCenterId: li.costCenterId?.trim() || undefined,
        dc: "DEBIT" as const,
        amount: li.amountDecimal.toFixed(6),
        currencyCode: expenseCurrency,
      }));

      const entry = await createPostedJournalEntryTx(tx, {
        companyId: company.id,
        entryDate: expenseDate,
        description: `Expense ${expense.expenseNumber}`,
        baseCurrencyCode,
        currencyCode: expenseCurrency,
        exchangeRateId: expense.exchangeRateId ?? undefined,
        referenceType: "EXPENSE",
        referenceId: expense.id,
        createdById: session.user.id,
        lines: [
          ...debitLines,
          { accountId: creditAccount.id, dc: "CREDIT" as const, amount: total.toFixed(6), currencyCode: expenseCurrency },
        ],
      });

      const status = creditAccount.code === "2100" ? "SUBMITTED" : "PAID";
      await tx.expense.update({ where: { id: expense.id }, data: { journalEntryId: entry.id, status } });

      for (const file of attachments) {
        const stored = await saveExpenseAttachmentFile({ companyId: company.id, expenseId: expense.id, file });
        writtenStorageKeys.push(stored.storageKey);

        await tx.attachment.create({
          data: {
            companyId: company.id,
            ownerType: "EXPENSE",
            expenseId: expense.id,
            originalName: stored.originalName,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            storageKey: stored.storageKey,
            uploadedById: session.user.id,
          },
        });
      }

      return expense;
    });

    return Response.json({ id: created.id }, { status: 201 });
  } catch (e) {
    await cleanupStoredAttachments(writtenStorageKeys);
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
