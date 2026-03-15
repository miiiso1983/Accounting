import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { ExportButtons } from "@/components/reports/ExportButtons";

function fmt(n: number) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", timeZone: "UTC" });
}

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const months = Math.min(Math.max(Number(sp.months) || 6, 1), 24);
  const fromParam = typeof sp.from === "string" ? sp.from : undefined;
  const toParam = typeof sp.to === "string" ? sp.to : undefined;
  const costCenterId = typeof sp.costCenterId === "string" ? sp.costCenterId : undefined;

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  // Build month boundaries
  const now = new Date();
  let endDate: Date;
  if (toParam) {
    endDate = new Date(`${toParam}T23:59:59.999Z`);
    if (isNaN(endDate.getTime())) endDate = now;
  } else {
    endDate = now;
  }

  let startDate: Date;
  if (fromParam) {
    startDate = new Date(`${fromParam}T00:00:00.000Z`);
    if (isNaN(startDate.getTime())) {
      startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - months + 1, 1));
    }
  } else {
    startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - months + 1, 1));
  }

  // Generate month columns
  const monthCols: { key: string; label: string; from: Date; to: Date }[] = [];
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  while (cursor <= endDate) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    const from = new Date(Date.UTC(y, m, 1));
    const to = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
    monthCols.push({ key: `${y}-${String(m + 1).padStart(2, "0")}`, label: monthLabel(from), from, to });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const costCenters = await prisma.costCenter.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true },
  });

  // Fetch INCOME + EXPENSE accounts
  const accounts = await prisma.glAccount.findMany({
    where: { companyId, isPosting: true, type: { in: ["INCOME", "EXPENSE"] } },
    orderBy: [{ type: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, type: true },
  });

  // Fetch all journal lines for the date range
  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      ...(costCenterId ? { costCenterId } : {}),
      journalEntry: {
        companyId,
        status: "POSTED",
        entryDate: { gte: startDate, lte: endDate },
      },
    },
    select: { accountId: true, dc: true, amountBase: true, journalEntry: { select: { entryDate: true } } },
  });

  // Build balances: accountId → monthKey → balance
  const balances = new Map<string, Map<string, number>>();
  for (const l of lines) {
    const d = l.journalEntry.entryDate;
    const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!balances.has(l.accountId)) balances.set(l.accountId, new Map());
    const m = balances.get(l.accountId)!;
    const v = Number(l.amountBase);
    const sign = l.dc === "DEBIT" ? 1 : -1;
    m.set(mk, (m.get(mk) ?? 0) + v * sign);
  }

  const incomeAccounts = accounts.filter((a) => a.type === "INCOME");
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");

  function getBalance(accountId: string, mk: string) {
    return balances.get(accountId)?.get(mk) ?? 0;
  }
  function getYtd(accountId: string) {
    let s = 0;
    for (const mc of monthCols) s += getBalance(accountId, mc.key);
    return s;
  }
  function sectionMonthTotal(accs: typeof accounts, mk: string) {
    return accs.reduce((s, a) => s + getBalance(a.id, mk), 0);
  }
  function sectionYtd(accs: typeof accounts) {
    return accs.reduce((s, a) => s + getYtd(a.id), 0);
  }

  // Income has CREDIT normal balance → show as positive (negate debit-credit)
  // Expense has DEBIT normal balance → show as positive (debit-credit)
  function displayIncome(accountId: string, mk: string) { return -getBalance(accountId, mk); }
  function displayIncomeYtd(accountId: string) { return -getYtd(accountId); }
  function incomeMonthTotal(mk: string) { return -sectionMonthTotal(incomeAccounts, mk); }
  function incomeYtdTotal() { return -sectionYtd(incomeAccounts); }
  function expenseMonthTotal(mk: string) { return sectionMonthTotal(expenseAccounts, mk); }
  function expenseYtdTotal() { return sectionYtd(expenseAccounts); }

  const qs = new URLSearchParams({
    ...(fromParam ? { from: fromParam } : {}),
    ...(toParam ? { to: toParam } : {}),
    months: String(months),
    ...(costCenterId ? { costCenterId } : {}),
  }).toString();

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Reports / التقارير</div>
          <div className="mt-1 text-base font-semibold text-zinc-900">Profit & Loss / قائمة الأرباح والخسائر</div>
        </div>
        <ExportButtons
          excelHref={`/api/reports/profit-loss/export${qs ? `?${qs}` : ""}`}
          labels={{ excel: "Export Excel", print: "Print / PDF" }}
        />
      </div>

      {/* Filters */}
      <form className="mt-4 grid gap-3 md:grid-cols-10" method="GET" action="/app/reports/profit-loss">
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">From / من</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="from" defaultValue={fromParam ?? ""} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">To / إلى</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="to" defaultValue={toParam ?? ""} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">Months / أشهر</label>
          <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" name="months" defaultValue={months}>
            {[3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">Cost Center / مركز الكلفة</label>
          <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" name="costCenterId" defaultValue={costCenterId ?? ""}>
            <option value="">All / الكل</option>
            {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-2 flex items-end">
          <button type="submit" className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">Apply / تطبيق</button>
        </div>
      </form>
      {/* P&L Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3 sticky left-0 bg-white/90">Account / الحساب</th>
              {monthCols.map((mc) => <th key={mc.key} className="py-2 px-3 text-right whitespace-nowrap">{mc.label}</th>)}
              <th className="py-2 px-3 text-right font-semibold whitespace-nowrap">YTD / المجموع</th>
            </tr>
          </thead>
          <tbody>
            {/* INCOME SECTION */}
            <tr className="bg-emerald-50/60"><td colSpan={monthCols.length + 2} className="py-2 px-2 font-semibold text-emerald-800">Revenue / الإيرادات</td></tr>
            {incomeAccounts.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="py-1.5 pr-3 sticky left-0 bg-white/90">
                  <span className="font-mono text-xs text-zinc-500 mr-2">{a.code}</span>
                  <span className="text-zinc-800">{a.name}</span>
                </td>
                {monthCols.map((mc) => {
                  const v = displayIncome(a.id, mc.key);
                  return <td key={mc.key} className={`py-1.5 px-3 font-mono text-right ${v < 0 ? "text-rose-600" : "text-zinc-900"}`}>{v !== 0 ? fmt(v) : "-"}</td>;
                })}
                <td className={`py-1.5 px-3 font-mono text-right font-medium ${displayIncomeYtd(a.id) < 0 ? "text-rose-600" : "text-zinc-900"}`}>{displayIncomeYtd(a.id) !== 0 ? fmt(displayIncomeYtd(a.id)) : "-"}</td>
              </tr>
            ))}
            <tr className="border-y-2 border-emerald-200 bg-emerald-50/40 font-semibold">
              <td className="py-2 pr-3 text-emerald-800 sticky left-0 bg-emerald-50/80">Total Revenue / إجمالي الإيرادات</td>
              {monthCols.map((mc) => <td key={mc.key} className="py-2 px-3 font-mono text-right text-emerald-800">{fmt(incomeMonthTotal(mc.key))}</td>)}
              <td className="py-2 px-3 font-mono text-right text-emerald-900">{fmt(incomeYtdTotal())}</td>
            </tr>

            {/* EXPENSE SECTION */}
            <tr className="bg-orange-50/60"><td colSpan={monthCols.length + 2} className="py-2 px-2 font-semibold text-orange-800 pt-4">Expenses / المصروفات</td></tr>
            {expenseAccounts.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="py-1.5 pr-3 sticky left-0 bg-white/90">
                  <span className="font-mono text-xs text-zinc-500 mr-2">{a.code}</span>
                  <span className="text-zinc-800">{a.name}</span>
                </td>
                {monthCols.map((mc) => {
                  const v = getBalance(a.id, mc.key);
                  return <td key={mc.key} className={`py-1.5 px-3 font-mono text-right ${v < 0 ? "text-rose-600" : "text-zinc-900"}`}>{v !== 0 ? fmt(v) : "-"}</td>;
                })}
                <td className={`py-1.5 px-3 font-mono text-right font-medium ${getYtd(a.id) < 0 ? "text-rose-600" : "text-zinc-900"}`}>{getYtd(a.id) !== 0 ? fmt(getYtd(a.id)) : "-"}</td>
              </tr>
            ))}
            <tr className="border-y-2 border-orange-200 bg-orange-50/40 font-semibold">
              <td className="py-2 pr-3 text-orange-800 sticky left-0 bg-orange-50/80">Total Expenses / إجمالي المصروفات</td>
              {monthCols.map((mc) => <td key={mc.key} className="py-2 px-3 font-mono text-right text-orange-800">{fmt(expenseMonthTotal(mc.key))}</td>)}
              <td className="py-2 px-3 font-mono text-right text-orange-900">{fmt(expenseYtdTotal())}</td>
            </tr>

            {/* NET PROFIT */}
            <tr className="border-t-4 border-zinc-300 bg-zinc-50 font-bold text-base">
              <td className="py-3 pr-3 sticky left-0 bg-zinc-50">Net Profit / صافي الربح</td>
              {monthCols.map((mc) => {
                const net = incomeMonthTotal(mc.key) - expenseMonthTotal(mc.key);
                return <td key={mc.key} className={`py-3 px-3 font-mono text-right ${net < 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmt(net)}</td>;
              })}
              {(() => { const net = incomeYtdTotal() - expenseYtdTotal(); return <td className={`py-3 px-3 font-mono text-right ${net < 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmt(net)}</td>; })()}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

