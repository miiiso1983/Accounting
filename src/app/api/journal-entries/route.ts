import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createPostedJournalEntry } from "@/lib/accounting/journal/create";

const BodySchema = z.object({
  entryDate: z.string().min(1), // yyyy-mm-dd
  description: z.string().optional(),
  currencyCode: z.enum(["IQD", "USD"]).optional(),
  // If currencyCode != baseCurrencyCode, user provides a rate in the common convention:
  // 1 {currencyCode} = rate {baseCurrencyCode}
  exchangeRate: z
    .object({
      rate: z.string().min(1),
    })
    .optional(),
  lines: z
    .array(
      z.object({
        accountId: z.string().min(1),
        dc: z.enum(["DEBIT", "CREDIT"]),
        amount: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .min(2),
});

export async function POST(req: Request) {
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

  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  const baseCurrencyCode = company.baseCurrencyCode;
  const entryCurrency = body.currencyCode;

  const entryDate = new Date(`${body.entryDate}T00:00:00.000Z`);

  let exchangeRateId: string | undefined;
  if (entryCurrency && entryCurrency !== baseCurrencyCode) {
    const rateStr = body.exchangeRate?.rate;
    if (!rateStr) {
      return Response.json(
        { error: "Exchange rate is required when entry currency != base currency" },
        { status: 400 },
      );
    }

    // Store rate as: 1 entryCurrency = rate baseCurrencyCode
    // Example when company base is IQD and entry currency is USD:
    // baseCurrencyCode=USD, quoteCurrencyCode=IQD, rate=1300  (1 USD = 1300 IQD)
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

  try {
    const entry = await createPostedJournalEntry(prisma, {
      companyId: company.id,
      entryDate,
      description: body.description,
      baseCurrencyCode,
      currencyCode: entryCurrency,
      exchangeRateId,
      createdById: session.user.id,
      lines: body.lines.map((l) => ({
        accountId: l.accountId,
        dc: l.dc,
        amount: l.amount,
        currencyCode: entryCurrency ?? baseCurrencyCode,
        description: l.description,
      })),
    });

    return Response.json({ id: entry.id }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
