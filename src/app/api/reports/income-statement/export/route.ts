import { getServerSession } from "next-auth";
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
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });
  const companyId = user.companyId;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const costCenterId = searchParams.get("costCenterId") ?? undefined;
  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  const entryDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  const accounts = await prisma.glAccount.findMany({
    where: { companyId, isPosting: true, type: { in: ["INCOME", "EXPENSE"] } },
    orderBy: [{ type: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, type: true },
  });

  const agg = accounts.length
    ? await prisma.journalLine.groupBy({
        by: ["accountId", "dc"],
        where: {
          accountId: { in: accounts.map((a) => a.id) },
          ...(costCenterId ? { costCenterId } : {}),
          journalEntry: { companyId, status: "POSTED", ...(entryDateWhere ? { entryDate: entryDateWhere } : {}) },
        },
        _sum: { amountBase: true },
      })
    : [];

  const debit = new Map<string, number>();
  const credit = new Map<string, number>();
  for (const r of agg) {
    const v = Number(r._sum.amountBase ?? 0);
    if (r.dc === "DEBIT") debit.set(r.accountId, (debit.get(r.accountId) ?? 0) + v);
    else credit.set(r.accountId, (credit.get(r.accountId) ?? 0) + v);
  }
  function rawBal(accountId: string) {
    return (debit.get(accountId) ?? 0) - (credit.get(accountId) ?? 0);
  }
  function displayAmount(a: (typeof accounts)[number]) {
    const b = rawBal(a.id);
    return a.type === "INCOME" ? -b : b;
  }

  const incomeRows = accounts
    .filter((a) => a.type === "INCOME")
    .map((a) => ({ Code: a.code, Account: a.name, Amount: displayAmount(a) }));
  const expenseRows = accounts
    .filter((a) => a.type === "EXPENSE")
    .map((a) => ({ Code: a.code, Account: a.name, Amount: displayAmount(a) }));
  const totalIncome = incomeRows.reduce((s, r) => s + r.Amount, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.Amount, 0);
  const netProfit = totalIncome - totalExpense;

  const rows: Record<string, string | number>[] = [];
  rows.push({ Section: "Revenue", Code: "", Account: "", Amount: "" });
  for (const r of incomeRows) rows.push({ Section: "", ...r });
  rows.push({ Section: "", Code: "", Account: "Total Revenue", Amount: totalIncome });
  rows.push({});
  rows.push({ Section: "Expenses", Code: "", Account: "", Amount: "" });
  for (const r of expenseRows) rows.push({ Section: "", ...r });
  rows.push({ Section: "", Code: "", Account: "Total Expenses", Amount: totalExpense });
  rows.push({});
  rows.push({ Section: "", Code: "", Account: "Net Profit", Amount: netProfit });

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Message: "(no data)" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Income Statement");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `income-statement${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
