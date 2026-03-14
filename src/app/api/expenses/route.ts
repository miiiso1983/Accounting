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

const BodySchema = z.object({
  expenseNumber: z.string().optional().or(z.literal("")),
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
  total: z.string().min(1),
  expenseAccountId: z.string().min(1),
  creditAccountId: z.string().min(1),
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
    const parsed = BodySchema.safeParse({
      expenseNumber: getFormString(formData, "expenseNumber"),
      expenseDate: getFormString(formData, "expenseDate"),
      vendorName: getFormString(formData, "vendorName"),
      description: getFormString(formData, "description"),
      productId: getFormString(formData, "productId"),
	      costCenterId: getFormString(formData, "costCenterId"),
      currencyCode: getFormString(formData, "currencyCode"),
      exchangeRate: exchangeRate ? { rate: exchangeRate } : undefined,
      total: getFormString(formData, "total"),
      expenseAccountId: getFormString(formData, "expenseAccountId"),
      creditAccountId: getFormString(formData, "creditAccountId"),
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
      const total = new Prisma.Decimal(body.total);
      if (total.lte(0)) throw new Error("Expense total must be > 0");

      const expenseAccount = await tx.glAccount.findFirst({
        where: { id: body.expenseAccountId, companyId: company.id },
        select: { id: true, isPosting: true },
      });
      if (!expenseAccount) throw new Error("Expense account not found");
      if (!expenseAccount.isPosting) throw new Error("Expense account must be a posting account");

      const creditAccount = await tx.glAccount.findFirst({
        where: { id: body.creditAccountId, companyId: company.id },
        select: { id: true, isPosting: true, code: true },
      });
      if (!creditAccount) throw new Error("Credit account not found");
      if (!creditAccount.isPosting) throw new Error("Credit account must be a posting account");

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

      const expense = await tx.expense.create({
        data: {
          companyId: company.id,
          expenseNumber: body.expenseNumber || null,
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
          expenseAccountId: expenseAccount.id,
        },
        select: { id: true, expenseNumber: true, exchangeRateId: true },
      });

      const entry = await createPostedJournalEntryTx(tx, {
        companyId: company.id,
        entryDate: expenseDate,
        description: `Expense ${expense.expenseNumber ?? expense.id.slice(0, 8)}`,
        baseCurrencyCode,
        currencyCode: expenseCurrency,
        exchangeRateId: expense.exchangeRateId ?? undefined,
        referenceType: "EXPENSE",
        referenceId: expense.id,
        createdById: session.user.id,
        lines: [
	        {
	          accountId: expenseAccount.id,
	          costCenterId: costCenterId ?? undefined,
	          dc: "DEBIT",
	          amount: total.toFixed(6),
	          currencyCode: expenseCurrency,
	        },
          { accountId: creditAccount.id, dc: "CREDIT", amount: total.toFixed(6), currencyCode: expenseCurrency },
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
