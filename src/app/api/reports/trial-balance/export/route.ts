import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import * as XLSX from "xlsx";

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

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.redirect("/login");
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const costCenterId = searchParams.get("costCenterId") ?? undefined;

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });
  const companyId = user.companyId;

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  const entryDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  const [accounts, debitAgg, creditAgg] = await Promise.all([
    prisma.glAccount.findMany({
      where: { companyId, isPosting: true },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true, type: true },
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { dc: "DEBIT", ...(costCenterId ? { costCenterId } : {}), journalEntry: { companyId, status: "POSTED", ...(entryDateWhere ? { entryDate: entryDateWhere } : {}) } },
      _sum: { amountBase: true },
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { dc: "CREDIT", ...(costCenterId ? { costCenterId } : {}), journalEntry: { companyId, status: "POSTED", ...(entryDateWhere ? { entryDate: entryDateWhere } : {}) } },
      _sum: { amountBase: true },
    }),
  ]);

  const debitByAccount = new Map<string, number>();
  for (const r of debitAgg) debitByAccount.set(r.accountId, Number(r._sum.amountBase ?? 0));
  const creditByAccount = new Map<string, number>();
  for (const r of creditAgg) creditByAccount.set(r.accountId, Number(r._sum.amountBase ?? 0));

  const rows = accounts.map((a) => {
    const debit = debitByAccount.get(a.id) ?? 0;
    const credit = creditByAccount.get(a.id) ?? 0;
    const balance = debit - credit;
    return {
      Code: a.code,
      Account: a.name,
      Type: a.type,
      "Debit (base)": balance > 0 ? balance : 0,
      "Credit (base)": balance < 0 ? -balance : 0,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Trial Balance");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `trial-balance${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}${costCenterId ? "-cc" : ""}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

