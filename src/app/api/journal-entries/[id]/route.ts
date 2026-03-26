import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { normalizeJournalEntryLinesTx } from "@/lib/accounting/journal/create";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

function errorMessage(error: z.ZodError) {
  return error.issues.map((issue) => issue.message).join(", ") || "Invalid payload";
}

const BodySchema = z.object({
  entryDate: z.string().min(1),
  description: z.string().optional(),
  currencyCode: z.enum(["IQD", "USD"]).optional(),
  exchangeRate: z.object({ rate: z.string().min(1) }).optional(),
  lines: z
    .array(
      z.object({
        accountId: z.string().min(1),
        costCenterId: z.string().optional().or(z.literal("")),
        dc: z.enum(["DEBIT", "CREDIT"]),
        amount: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .min(2),
	branchId: z.string().optional().or(z.literal("")),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.JOURNAL_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { companyId: true },
  });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { id: true, baseCurrencyCode: true },
  });
  if (!company) return Response.json({ error: "Company not found" }, { status: 400 });

	  // Only DRAFT or POSTED entries can be edited
  const existing = await prisma.journalEntry.findFirst({
    where: { id, companyId: company.id },
	    select: { id: true, status: true, type: true, branchId: true },
  });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
	  if (existing.type === "SYSTEM") {
	    return Response.json({ error: "System journal entries can only be changed from the source document" }, { status: 400 });
	  }
	  if (existing.status !== "DRAFT" && existing.status !== "POSTED") {
	    return Response.json({ error: "Only DRAFT or POSTED entries can be edited" }, { status: 400 });
  }

  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: errorMessage(parsed.error) }, { status: 400 });
  }

  const body = parsed.data;
  const baseCurrencyCode = company.baseCurrencyCode;
  const entryCurrency = body.currencyCode;
  const entryDate = new Date(`${body.entryDate}T00:00:00.000Z`);

  // Validate cost centers
  const requestedCostCenterIds = Array.from(
    new Set(body.lines.map((l) => l.costCenterId).filter((cid): cid is string => !!cid && cid.trim().length > 0).map((cid) => cid.trim())),
  );
  if (requestedCostCenterIds.length > 0) {
    const rows = await prisma.costCenter.findMany({
      where: { companyId: company.id, isActive: true, id: { in: requestedCostCenterIds } },
      select: { id: true },
    });
    if (rows.length !== requestedCostCenterIds.length) {
      return Response.json({ error: "Invalid cost center" }, { status: 400 });
    }
  }

  let exchangeRateId: string | undefined;
  if (entryCurrency && entryCurrency !== baseCurrencyCode) {
    const rateStr = body.exchangeRate?.rate;
    if (!rateStr) {
      return Response.json({ error: "Exchange rate is required when entry currency != base currency" }, { status: 400 });
    }
    const fx = await prisma.exchangeRate.create({
      data: {
        companyId: company.id,
        baseCurrencyCode: entryCurrency,
        quoteCurrencyCode: baseCurrencyCode,
        rate: rateStr,
        effectiveAt: entryDate,
        source: "manual",
      },
      select: { id: true },
    });
    exchangeRateId = fx.id;
  }

	const requestedBranchId = body.branchId === undefined ? undefined : (body.branchId.trim() ? body.branchId.trim() : null);
	let nextBranchId: string | null | undefined;
	if (requestedBranchId === undefined) {
		nextBranchId = existing.branchId;
	} else if (requestedBranchId === null) {
		nextBranchId = null;
	} else {
		const row = await prisma.branch.findFirst({
			where: { id: requestedBranchId, companyId: company.id },
			select: { id: true },
		});
		if (!row) return Response.json({ error: "Invalid branch" }, { status: 400 });
		nextBranchId = requestedBranchId;
	}

  try {
    const updated = await prisma.$transaction(async (tx) => {
	      let nextExchangeRateId: string | undefined;
	      if (entryCurrency && entryCurrency !== baseCurrencyCode) {
	        const rateStr = body.exchangeRate?.rate;
	        if (!rateStr) {
	          throw new Error("Exchange rate is required when entry currency != base currency");
	        }
	        const fx = await tx.exchangeRate.create({
	          data: {
	            companyId: company.id,
	            baseCurrencyCode: entryCurrency,
	            quoteCurrencyCode: baseCurrencyCode,
	            rate: rateStr,
	            effectiveAt: entryDate,
	            source: "manual",
	          },
	          select: { id: true },
	        });
	        nextExchangeRateId = fx.id;
	      }

	      const normalizedLines = await normalizeJournalEntryLinesTx(tx, {
	        companyId: company.id,
	        baseCurrencyCode,
	        exchangeRateId: nextExchangeRateId,
	        lines: body.lines.map((l) => ({
	          accountId: l.accountId,
	          costCenterId: l.costCenterId?.trim() ? l.costCenterId.trim() : undefined,
	          dc: l.dc,
	          amount: l.amount,
	          currencyCode: entryCurrency ?? baseCurrencyCode,
	          description: l.description,
	        })),
	      });

      await tx.journalLine.deleteMany({ where: { journalEntryId: id } });

      return tx.journalEntry.update({
        where: { id },
        data: {
	        branchId: nextBranchId ?? null,
          entryDate,
          description: body.description ?? null,
          currencyCode: entryCurrency ?? null,
	          exchangeRateId: nextExchangeRateId ?? null,
          lines: {
	            create: normalizedLines.map((l) => ({
              accountId: l.accountId,
	              costCenterId: l.costCenterId ?? null,
              dc: l.dc,
	              amount: l.amount,
              currencyCode: entryCurrency ?? baseCurrencyCode,
	              amountBase: l.amountBase,
              description: l.description ?? null,
            })),
          },
        },
        include: { lines: true },
      });
    });

    return Response.json({ id: updated.id }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	const session = await getServerSession(authOptions);
	if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
	if (!hasPermission(session, PERMISSIONS.JOURNAL_WRITE)) {
	  return Response.json({ error: "Not authorized" }, { status: 403 });
	}

	const user = await prisma.user.findUnique({
	  where: { id: session.user.id },
	  select: { companyId: true },
	});
	if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

	const existing = await prisma.journalEntry.findFirst({
	  where: { id, companyId: user.companyId },
	  select: { id: true, type: true },
	});
	if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
	if (existing.type === "SYSTEM") {
	  return Response.json({ error: "System journal entries can only be deleted from the source document" }, { status: 400 });
	}

	await prisma.$transaction(async (tx) => {
	  await tx.journalLine.deleteMany({ where: { journalEntryId: id } });
	  await tx.journalEntry.delete({ where: { id } });
	});

	return Response.json({ id }, { status: 200 });
}
