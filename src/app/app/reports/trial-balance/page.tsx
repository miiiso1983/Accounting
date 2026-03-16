import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { ExportButtons } from "@/components/reports/ExportButtons";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
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

export default async function TrialBalancePage({
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
  const entryDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  const costCenters = await prisma.costCenter.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true },
  });

  const lineWhere = (dc: "DEBIT" | "CREDIT") => ({
    dc,
    ...(costCenterId ? { costCenterId } : {}),
    journalEntry: {
      companyId,
      status: "POSTED" as const,
      ...(entryDateWhere ? { entryDate: entryDateWhere } : {}),
    },
  });

  const [accounts, debitAgg, creditAgg] = await Promise.all([
    prisma.glAccount.findMany({
      where: { companyId, isPosting: true },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true, type: true },
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: lineWhere("DEBIT"),
      _sum: { amountBase: true },
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: lineWhere("CREDIT"),
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
    const balanceDebit = balance > 0 ? balance : 0;
    const balanceCredit = balance < 0 ? -balance : 0;
    return { ...a, debit, credit, balance, balanceDebit, balanceCredit };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.debit += r.balanceDebit;
      acc.credit += r.balanceCredit;
      return acc;
    },
    { debit: 0, credit: 0 },
  );

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
          <div className="mt-1 text-base font-medium text-zinc-900">{t("reports.trialBalance.title")}</div>
        </div>
        <ExportButtons
          excelHref={`/api/reports/trial-balance/export${from || to || costCenterId ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(costCenterId ? { costCenterId } : {}) }).toString()}` : ""}`}
          labels={{ excel: t("reports.export.excel"), print: t("reports.export.print") }}
        />
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-8" method="GET" action="/app/reports/trial-balance">
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
        <div className="md:col-span-2 flex items-end">
          <button
            type="submit"
            className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
          >
            {t("reports.filters.apply")}
          </button>
        </div>
      </form>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">{t("reports.columns.code")}</th>
              <th className="py-2 pr-3">{t("reports.columns.account")}</th>
              <th className="py-2 pr-3">{t("reports.columns.debitBase")}</th>
              <th className="py-2 pr-3">{t("reports.columns.creditBase")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3 font-mono text-zinc-700">
                  <Link href={glHref(r.id)} className="text-sky-700 hover:text-sky-900 hover:underline">{r.code}</Link>
                </td>
                <td className="py-2 pr-3 text-zinc-900">
                  <div className="font-medium">
                    <Link href={glHref(r.id)} className="text-sky-700 hover:text-sky-900 hover:underline">{r.name}</Link>
                  </div>
                  <div className="text-xs text-zinc-500">{r.type}</div>
                </td>
                <td className="py-2 pr-3 font-mono text-zinc-900">{r.balanceDebit ? fmt(r.balanceDebit) : "-"}</td>
                <td className="py-2 pr-3 font-mono text-zinc-900">{r.balanceCredit ? fmt(r.balanceCredit) : "-"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td className="py-2 pr-3 text-xs font-medium text-zinc-500" colSpan={2}>
                {t("common.total")}
              </td>
              <td className="py-2 pr-3 font-mono text-sm font-medium text-zinc-900">{fmt(totals.debit)}</td>
              <td className="py-2 pr-3 font-mono text-sm font-medium text-zinc-900">{fmt(totals.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
