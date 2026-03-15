import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });
  const companyId = user.companyId;

  const { searchParams } = new URL(req.url);
  const months = Math.min(Math.max(Number(searchParams.get("months")) || 6, 1), 24);
  const fromParam = searchParams.get("from") ?? undefined;
  const toParam = searchParams.get("to") ?? undefined;
  const costCenterId = searchParams.get("costCenterId") ?? undefined;

  const now = new Date();
  let endDate = toParam ? new Date(`${toParam}T23:59:59.999Z`) : now;
  if (isNaN(endDate.getTime())) endDate = now;
  let startDate = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - months + 1, 1));
  if (isNaN(startDate.getTime())) startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - months + 1, 1));

  // Month columns
  const monthCols: { key: string; label: string }[] = [];
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  while (cursor <= endDate) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    monthCols.push({ key: `${y}-${String(m + 1).padStart(2, "0")}`, label: `${cursor.toLocaleDateString("en-US", { year: "numeric", month: "short", timeZone: "UTC" })}` });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const accounts = await prisma.glAccount.findMany({
    where: { companyId, isPosting: true, type: { in: ["INCOME", "EXPENSE"] } },
    orderBy: [{ type: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, type: true },
  });

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      ...(costCenterId ? { costCenterId } : {}),
      journalEntry: { companyId, status: "POSTED", entryDate: { gte: startDate, lte: endDate } },
    },
    select: { accountId: true, dc: true, amountBase: true, journalEntry: { select: { entryDate: true } } },
  });

  const balances = new Map<string, Map<string, number>>();
  for (const l of lines) {
    const d = l.journalEntry.entryDate;
    const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!balances.has(l.accountId)) balances.set(l.accountId, new Map());
    const mp = balances.get(l.accountId)!;
    const v = Number(l.amountBase);
    const sign = l.dc === "DEBIT" ? 1 : -1;
    mp.set(mk, (mp.get(mk) ?? 0) + v * sign);
  }

  function bal(aid: string, mk: string) { return balances.get(aid)?.get(mk) ?? 0; }

  // Build rows
  const sheetRows: Record<string, string | number>[] = [];
  const incomeAccts = accounts.filter((a) => a.type === "INCOME");
  const expenseAccts = accounts.filter((a) => a.type === "EXPENSE");

  sheetRows.push({ Account: "=== REVENUE ===" });
  for (const a of incomeAccts) {
    const row: Record<string, string | number> = { Account: `${a.code} - ${a.name}` };
    let ytd = 0;
    for (const mc of monthCols) { const v = -bal(a.id, mc.key); row[mc.label] = v; ytd += v; }
    row["YTD"] = ytd;
    sheetRows.push(row);
  }
  {
    const row: Record<string, string | number> = { Account: "Total Revenue" };
    let ytd = 0;
    for (const mc of monthCols) { const v = incomeAccts.reduce((s, a) => s - bal(a.id, mc.key), 0); row[mc.label] = v; ytd += v; }
    row["YTD"] = ytd;
    sheetRows.push(row);
  }

  sheetRows.push({ Account: "" });
  sheetRows.push({ Account: "=== EXPENSES ===" });
  for (const a of expenseAccts) {
    const row: Record<string, string | number> = { Account: `${a.code} - ${a.name}` };
    let ytd = 0;
    for (const mc of monthCols) { const v = bal(a.id, mc.key); row[mc.label] = v; ytd += v; }
    row["YTD"] = ytd;
    sheetRows.push(row);
  }
  {
    const row: Record<string, string | number> = { Account: "Total Expenses" };
    let ytd = 0;
    for (const mc of monthCols) { const v = expenseAccts.reduce((s, a) => s + bal(a.id, mc.key), 0); row[mc.label] = v; ytd += v; }
    row["YTD"] = ytd;
    sheetRows.push(row);
  }

  sheetRows.push({ Account: "" });
  {
    const row: Record<string, string | number> = { Account: "NET PROFIT" };
    let ytd = 0;
    for (const mc of monthCols) {
      const inc = incomeAccts.reduce((s, a) => s - bal(a.id, mc.key), 0);
      const exp = expenseAccts.reduce((s, a) => s + bal(a.id, mc.key), 0);
      const net = inc - exp;
      row[mc.label] = net;
      ytd += net;
    }
    row["YTD"] = ytd;
    sheetRows.push(row);
  }

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Profit & Loss");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `profit-loss-${months}mo.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

