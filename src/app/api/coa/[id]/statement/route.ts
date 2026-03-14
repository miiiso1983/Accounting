import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

function parseDateStart(ymd: string | undefined) {
  if (!ymd) return undefined;
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDateEnd(ymd: string | undefined) {
  if (!ymd) return undefined;
  const d = new Date(`${ymd}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;

  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });
  const companyId = user.companyId;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  const entryDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  const account = await prisma.glAccount.findFirst({
    where: { id: accountId, companyId },
    select: { id: true, code: true, name: true, type: true, isPosting: true },
  });
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });
  if (!account.isPosting) return Response.json({ error: "Account is not a posting account" }, { status: 400 });

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId,
      journalEntry: {
        companyId,
        status: "POSTED",
        ...(entryDateWhere ? { entryDate: entryDateWhere } : {}),
      },
    },
    include: {
      journalEntry: { select: { id: true, entryDate: true, description: true, referenceType: true, referenceId: true } },
    },
    orderBy: [{ journalEntry: { entryDate: "asc" } }, { id: "asc" }],
    take: 500,
  });

  let running = 0;
  const rows = lines.map((l) => {
    const v = Number(l.amountBase);
    running += l.dc === "DEBIT" ? v : -v;
    return {
      id: l.id,
      dc: l.dc,
      amountBase: l.amountBase,
      amount: l.amount,
      currencyCode: l.currencyCode,
      description: l.description,
      running,
      journalEntry: {
        id: l.journalEntry.id,
        entryDate: l.journalEntry.entryDate.toISOString(),
        description: l.journalEntry.description,
        referenceType: l.journalEntry.referenceType,
        referenceId: l.journalEntry.referenceId,
      },
    };
  });

  return Response.json({ account, from, to, lines: rows });
}
