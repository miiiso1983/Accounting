import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment } from "react";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { CustomerAutocompleteField } from "@/components/fields/CustomerAutocompleteField";

import { getMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";

import {
  buildDueDates,
  buildMonthColumns,
  fmtAmount,
  monthKey,
  type CurrencyCode,
  type InstallmentFrequency,
} from "@/lib/reports/installment-sales";

function toNum(d: unknown) {
  const n = Number(String(d));
  return Number.isFinite(n) ? n : 0;
}

type Cur = "ALL" | CurrencyCode;

export default async function InstallmentSalesReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const customerId = typeof sp.customerId === "string" ? sp.customerId : undefined;
  const currency = (typeof sp.currency === "string" ? sp.currency : "ALL") as Cur;
  const activeOnly = typeof sp.activeOnly === "string" ? sp.activeOnly === "1" : false;

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  const t = createTranslator(messages);

  const monthCols = buildMonthColumns(from, to, 6);
  const monthKeys = new Set(monthCols.map((m) => m.key));
  const startDate = monthCols.length ? monthCols[0]!.from : new Date(0);
  const endDate = monthCols.length ? monthCols[monthCols.length - 1]!.to : new Date();
  const queryStart = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() - 120, 1));

  const customers = await prisma.customer.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    take: 500,
    select: { id: true, name: true },
  });

  const contracts = await prisma.installmentContract.findMany({
    where: {
      companyId,
      ...(customerId ? { customerId } : {}),
      ...(activeOnly ? { status: "ACTIVE" } : {}),
      ...(currency !== "ALL" ? { currencyCode: currency } : {}),
      invoiceDate: { gte: queryStart, lte: endDate },
    },
    select: {
      invoiceDate: true,
      totalAmount: true,
      currencyCode: true,
      installmentFrequency: true,
      numberOfInstallments: true,
      amountPerInstallment: true,
      status: true,
      customer: { select: { id: true, name: true } },
    },
    orderBy: [{ customer: { name: "asc" } }, { invoiceDate: "asc" }],
    take: 10000,
  });

  type Cell = { USD: number; IQD: number };
  const zeroCell = (): Cell => ({ USD: 0, IQD: 0 });

  const byCustomer = new Map<
    string,
    { name: string; sales: Record<string, Cell>; due: Record<string, Cell>; dueActive: Record<string, Cell> }
  >();

  for (const c of contracts) {
    const cid = c.customer.id;
    if (!byCustomer.has(cid)) {
      byCustomer.set(cid, { name: c.customer.name, sales: {}, due: {}, dueActive: {} });
    }
    const entry = byCustomer.get(cid)!;
    const cur = c.currencyCode as CurrencyCode;

    const mkSales = monthKey(c.invoiceDate);
    if (monthKeys.has(mkSales)) {
      entry.sales[mkSales] ||= zeroCell();
      entry.sales[mkSales][cur] += toNum(c.totalAmount);
    }

    const dueDates = buildDueDates(c.invoiceDate, c.numberOfInstallments, c.installmentFrequency as InstallmentFrequency);
    for (const dd of dueDates) {
      const mk = monthKey(dd);
      if (!monthKeys.has(mk)) continue;
      entry.due[mk] ||= zeroCell();
      entry.due[mk][cur] += toNum(c.amountPerInstallment);
      if (c.status === "ACTIVE") {
        entry.dueActive[mk] ||= zeroCell();
        entry.dueActive[mk][cur] += toNum(c.amountPerInstallment);
      }
    }
  }

  const rows = [...byCustomer.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

  const qs = new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(customerId ? { customerId } : {}),
    ...(currency ? { currency } : {}),
    ...(activeOnly ? { activeOnly: "1" } : {}),
  }).toString();

  const nowMk = monthKey(new Date());

  const labelSales = t("reports.installmentSales.sales");
  const labelDue = t("reports.installmentSales.installmentsDue");

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Reports / التقارير</div>
          <div className="mt-1 text-base font-semibold text-zinc-900">{t("reports.installmentSales.reportTitle")}</div>
          <div className="mt-1 text-xs text-zinc-500">{t("reports.installmentSales.overdueHint")}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app/reports/installment-sales/new"
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800 hover:bg-indigo-100 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
          >
            + {t("reports.installmentSales.openNew")}
          </Link>
          <ExportButtons
            excelHref={`/api/reports/installment-sales/export${qs ? `?${qs}` : ""}`}
            labels={{ excel: t("reports.export.excel"), print: t("reports.export.print") }}
          />
        </div>
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-10" method="GET" action="/app/reports/installment-sales">
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">{t("reports.filters.from")}</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">{t("reports.filters.to")}</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <div className="md:col-span-3">
          <label className="text-xs font-medium text-zinc-600">{t("reports.filters.customer")}</label>
		          <CustomerAutocompleteField
		            key={customerId ?? ""}
	            customers={customers}
	            name="customerId"
	            defaultCustomerId={customerId ?? ""}
	            placeholder="Search customer / ابحث عن زبون"
	            noResultsLabel="No customers found / لا يوجد زبائن"
	            clearLabel="Clear"
	          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">{t("reports.filters.currency")}</label>
          <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" name="currency" defaultValue={currency}>
            <option value="ALL">{t("reports.installmentSales.allCurrencies")}</option>
            <option value="USD">USD</option>
            <option value="IQD">IQD</option>
          </select>
        </div>
        <div className="md:col-span-1 flex items-end">
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
            <input type="checkbox" name="activeOnly" value="1" defaultChecked={activeOnly} />
            {t("reports.installmentSales.activeOnly")}
          </label>
        </div>
        <div className="md:col-span-10">
          <button type="submit" className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            {t("reports.filters.apply")}
          </button>
        </div>
      </form>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th rowSpan={2} className="py-2 pr-3 sticky left-0 bg-white/90">{t("reports.installmentSales.customer")}</th>
              {monthCols.map((mc) => (
                <th key={mc.key} colSpan={2} className="py-2 px-3 text-center whitespace-nowrap">{mc.label}</th>
              ))}
              <th colSpan={2} className="py-2 px-3 text-center whitespace-nowrap font-semibold">{t("reports.installmentSales.total")}</th>
            </tr>
            <tr className="border-b">
              {monthCols.map((mc) => (
                <Fragment key={mc.key}>
                  <th className="py-2 px-2 text-right whitespace-nowrap">{labelSales}</th>
                  <th className="py-2 px-2 text-right whitespace-nowrap">{labelDue}</th>
                </Fragment>
              ))}
              <th className="py-2 px-2 text-right whitespace-nowrap font-semibold">{labelSales}</th>
              <th className="py-2 px-2 text-right whitespace-nowrap font-semibold">{labelDue}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, g]) => {
              const totals = monthCols.reduce(
                (acc, mc) => {
                  const s = g.sales[mc.key] ?? { USD: 0, IQD: 0 };
                  const d = g.due[mc.key] ?? { USD: 0, IQD: 0 };
                  acc.salesUSD += s.USD; acc.salesIQD += s.IQD;
                  acc.dueUSD += d.USD; acc.dueIQD += d.IQD;
                  return acc;
                },
                { salesUSD: 0, salesIQD: 0, dueUSD: 0, dueIQD: 0 },
              );

              const fmtCell = (cell: { USD: number; IQD: number }) => {
                if (currency === "USD") return cell.USD ? `USD ${fmtAmount(cell.USD)}` : "-";
                if (currency === "IQD") return cell.IQD ? `IQD ${fmtAmount(cell.IQD)}` : "-";
                const hasUSD = cell.USD !== 0;
                const hasIQD = cell.IQD !== 0;
                if (!hasUSD && !hasIQD) return "-";
                return `${hasUSD ? `USD ${fmtAmount(cell.USD)}` : ""}${hasUSD && hasIQD ? "\n" : ""}${hasIQD ? `IQD ${fmtAmount(cell.IQD)}` : ""}`;
              };

              return (
                <tr key={id} className="border-b last:border-0">
                  <td className="py-2 pr-3 sticky left-0 bg-white/90 font-medium text-zinc-900 whitespace-nowrap">{g.name}</td>
                  {monthCols.map((mc) => {
                    const s = g.sales[mc.key] ?? { USD: 0, IQD: 0 };
                    const d = g.due[mc.key] ?? { USD: 0, IQD: 0 };
                    const dActive = g.dueActive[mc.key] ?? { USD: 0, IQD: 0 };
                    const isPast = mc.key < nowMk;

                    const dueActiveAmt = currency === "USD" ? dActive.USD : currency === "IQD" ? dActive.IQD : (dActive.USD + dActive.IQD);
                    const overdue = isPast && dueActiveAmt > 0;
                    const overdueClass = overdue ? "bg-rose-50/70" : "";

                    return (
                      <Fragment key={mc.key}>
                        <td className={`py-2 px-2 text-right font-mono whitespace-pre-line ${overdueClass}`}>{fmtCell(s)}</td>
                        <td className={`py-2 px-2 text-right font-mono whitespace-pre-line ${overdueClass}`}>{fmtCell(d)}</td>
                      </Fragment>
                    );
                  })}
                  <td className="py-2 px-2 text-right font-mono whitespace-pre-line font-semibold">
                    {currency === "ALL"
                      ? `${totals.salesUSD ? `USD ${fmtAmount(totals.salesUSD)}` : ""}${totals.salesUSD && totals.salesIQD ? "\n" : ""}${totals.salesIQD ? `IQD ${fmtAmount(totals.salesIQD)}` : ""}` || "-"
                      : currency === "USD" ? (totals.salesUSD ? fmtAmount(totals.salesUSD) : "-") : (totals.salesIQD ? fmtAmount(totals.salesIQD) : "-")}
                  </td>
                  <td className="py-2 px-2 text-right font-mono whitespace-pre-line font-semibold">
                    {currency === "ALL"
                      ? `${totals.dueUSD ? `USD ${fmtAmount(totals.dueUSD)}` : ""}${totals.dueUSD && totals.dueIQD ? "\n" : ""}${totals.dueIQD ? `IQD ${fmtAmount(totals.dueIQD)}` : ""}` || "-"
                      : currency === "USD" ? (totals.dueUSD ? fmtAmount(totals.dueUSD) : "-") : (totals.dueIQD ? fmtAmount(totals.dueIQD) : "-")}
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={monthCols.length * 2 + 3} className="py-6 text-center text-zinc-400 text-sm">
                  {t("reports.installmentSales.noData")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
