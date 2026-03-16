import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ExportButtons } from "@/components/reports/ExportButtons";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";

function fmt(n: number) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

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

export default async function IncomeStatementPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const costCenterId = typeof sp.costCenterId === "string" ? sp.costCenterId : undefined;

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  const t = createTranslator(messages);

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);

  const costCenters = await prisma.costCenter.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true },
  });

  const accounts = await prisma.glAccount.findMany({
    where: { companyId, isPosting: true, type: { in: ["INCOME", "EXPENSE"] } },
    orderBy: [{ type: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, type: true },
  });

  const entryDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

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

  const incomeAccounts = accounts.filter((a) => a.type === "INCOME");
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");

  function displayAmount(a: (typeof accounts)[number]) {
    const b = rawBal(a.id);
    // Income is CREDIT-normal; Expense is DEBIT-normal
    return a.type === "INCOME" ? -b : b;
  }

  const incomeRows = incomeAccounts.map((a) => ({ ...a, amount: displayAmount(a) }));
  const expenseRows = expenseAccounts.map((a) => ({ ...a, amount: displayAmount(a) }));
  const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);
  const netProfit = totalIncome - totalExpense;

  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(costCenterId ? { costCenterId } : {}) }).toString();

  const glLinkParams = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
  function glHref(accountId: string) {
    const p = new URLSearchParams(glLinkParams);
    p.set("accountId", accountId);
    return `/app/reports/general-ledger?${p.toString()}`;
  }

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">{t("reports.title")}</div>
          <div className="mt-1 text-base font-semibold text-zinc-900">Income Statement / قائمة الدخل</div>
        </div>
        <ExportButtons
          excelHref={`/api/reports/income-statement/export${qs ? `?${qs}` : ""}`}
          labels={{ excel: t("reports.export.excel"), print: t("reports.export.print") }}
        />
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-8" method="GET" action="/app/reports/income-statement">
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">{t("reports.filters.from")}</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">{t("reports.filters.to")}</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">Cost Center / مركز الكلفة</label>
          <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" name="costCenterId" defaultValue={costCenterId ?? ""}>
            <option value="">All / الكل</option>
            {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-2 flex items-end gap-2">
          <button type="submit" className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            {t("reports.filters.apply")}
          </button>
          <Link href="/app/reports/income-statement" className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50">
            Reset / إعادة ضبط
          </Link>
        </div>
      </form>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Account / الحساب</th>
              <th className="py-2 pr-3 text-right">Amount (base) / المبلغ</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-emerald-50/60">
              <td colSpan={2} className="py-2 px-2 font-semibold text-emerald-800">
                Revenue / الإيرادات
              </td>
            </tr>
            {incomeRows.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="py-1.5 pr-3">
                  <Link href={glHref(a.id)} className="hover:underline">
                    <span className="font-mono text-xs text-sky-600 mr-2">{a.code}</span>
                    <span className="text-sky-700 hover:text-sky-900">{a.name}</span>
                  </Link>
                </td>
                <td className={`py-1.5 pr-3 text-right font-mono ${a.amount < 0 ? "text-rose-600" : "text-zinc-900"}`}>{a.amount !== 0 ? fmt(a.amount) : "-"}</td>
              </tr>
            ))}
            <tr className="bg-emerald-50">
              <td className="py-2 pr-3 font-semibold text-emerald-900">Total Revenue / إجمالي الإيرادات</td>
              <td className="py-2 pr-3 text-right font-mono font-semibold text-emerald-900">{fmt(totalIncome)}</td>
            </tr>

            <tr className="bg-orange-50/60">
              <td colSpan={2} className="py-2 px-2 font-semibold text-orange-800 pt-4">
                Expenses / المصروفات
              </td>
            </tr>
            {expenseRows.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="py-1.5 pr-3">
                  <Link href={glHref(a.id)} className="hover:underline">
                    <span className="font-mono text-xs text-sky-600 mr-2">{a.code}</span>
                    <span className="text-sky-700 hover:text-sky-900">{a.name}</span>
                  </Link>
                </td>
                <td className={`py-1.5 pr-3 text-right font-mono ${a.amount < 0 ? "text-rose-600" : "text-zinc-900"}`}>{a.amount !== 0 ? fmt(a.amount) : "-"}</td>
              </tr>
            ))}
            <tr className="bg-orange-50">
              <td className="py-2 pr-3 font-semibold text-orange-900">Total Expenses / إجمالي المصروفات</td>
              <td className="py-2 pr-3 text-right font-mono font-semibold text-orange-900">{fmt(totalExpense)}</td>
            </tr>

            <tr className="border-t-4 border-zinc-300 bg-zinc-50 font-bold text-base">
              <td className="py-3 pr-3">Net Profit / صافي الربح</td>
              <td className={`py-3 pr-3 text-right font-mono ${netProfit < 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmt(netProfit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
