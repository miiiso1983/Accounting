import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/format/date";
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
  const accountId = searchParams.get("accountId") ?? undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  if (!accountId) return Response.json({ error: "accountId is required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });
  const companyId = user.companyId;

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  const entryDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  const account = await prisma.glAccount.findUnique({ where: { id: accountId }, select: { code: true, name: true } });

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId,
      journalEntry: { companyId, status: "POSTED", ...(entryDateWhere ? { entryDate: entryDateWhere } : {}) },
    },
    include: {
      journalEntry: { select: { entryDate: true, description: true, referenceType: true, referenceId: true } },
    },
    orderBy: [{ journalEntry: { entryDate: "asc" } }, { id: "asc" }],
    take: 500,
  });

  let running = 0;
  const rows = lines.map((l) => {
    const v = Number(l.amountBase);
    running += l.dc === "DEBIT" ? v : -v;
    return {
      Date: formatDate(l.journalEntry.entryDate),
      Entry: l.journalEntry.description ?? "",
      "Ref Type": l.journalEntry.referenceType ?? "",
      "Ref ID": l.journalEntry.referenceId ?? "",
      DC: l.dc,
      "Debit (base)": l.dc === "DEBIT" ? v : "",
      "Credit (base)": l.dc === "CREDIT" ? v : "",
      "Balance (base)": running,
      Amount: Number(l.amount),
      Currency: l.currencyCode,
      Note: l.description ?? "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  const sheetName = account ? `${account.code} ${account.name}`.slice(0, 31) : "Ledger";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `general-ledger-${account?.code ?? accountId}${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

