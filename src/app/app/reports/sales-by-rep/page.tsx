import { getServerSession } from "next-auth";
import Link from "next/link";
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

export default async function SalesByRepPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const status = typeof sp.status === "string" ? sp.status : undefined;

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  const issueDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { companyId, salesRepresentativeId: { not: null } };
  if (issueDateWhere) where.issueDate = issueDateWhere;
  if (status) where.status = status;

  const invoices = await prisma.invoice.findMany({
    where,
    include: { salesRepresentative: { select: { id: true, name: true } }, customer: { select: { name: true } } },
    orderBy: [{ issueDate: "desc" }],
  });

  // Group by rep
  const repMap = new Map<string, { name: string; invoiceCount: number; totalUSD: number; totalIQD: number; totalBaseUSD: number; totalBaseIQD: number; invoices: typeof invoices }>();
  for (const inv of invoices) {
    const repId = inv.salesRepresentativeId!;
    const repName = inv.salesRepresentative?.name ?? "Unknown";
    if (!repMap.has(repId)) repMap.set(repId, { name: repName, invoiceCount: 0, totalUSD: 0, totalIQD: 0, totalBaseUSD: 0, totalBaseIQD: 0, invoices: [] });
    const r = repMap.get(repId)!;
    r.invoiceCount++;
    const total = Number(inv.total) || 0;
    const totalBase = Number(inv.totalBase) || 0;
    if (inv.currencyCode === "USD") r.totalUSD += total;
    else r.totalIQD += total;
    if (inv.baseCurrencyCode === "USD") r.totalBaseUSD += totalBase;
    else r.totalBaseIQD += totalBase;
    r.invoices.push(inv);
  }

  const reps = Array.from(repMap.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (status) qs.set("status", status);

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Reports / التقارير</div>
          <div className="mt-1 text-base font-medium text-zinc-900">Sales by Representative / المبيعات حسب المندوب</div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/reports">Back / رجوع</Link>
      </div>

      {/* Filters */}
      <form className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-zinc-500">From / من</label>
          <input type="date" name="from" defaultValue={from ?? ""} className="mt-1 block w-40 rounded-xl border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-zinc-500">To / إلى</label>
          <input type="date" name="to" defaultValue={to ?? ""} className="mt-1 block w-40 rounded-xl border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-zinc-500">Status / الحالة</label>
          <select name="status" defaultValue={status ?? ""} className="mt-1 block w-36 rounded-xl border px-3 py-2 text-sm">
            <option value="">All / الكل</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
          </select>
        </div>
        <button type="submit" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800">Filter / تصفية</button>
      </form>

      <div className="mt-2">
        <ExportButtons excelHref={`/api/reports/sales-by-rep/export?${qs.toString()}`} labels={{ excel: "Export Excel", print: "Print / PDF" }} />
      </div>

      {/* Summary table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Rep / المندوب</th>
              <th className="py-2 pr-3 text-right"># Invoices / الفواتير</th>
              <th className="py-2 pr-3 text-right">Total USD</th>
              <th className="py-2 pr-3 text-right">Total IQD</th>
            </tr>
          </thead>
          <tbody>
            {reps.map(([repId, r]) => (
              <tr key={repId} className="border-b last:border-b-0">
                <td className="py-2 pr-3 text-zinc-900 font-medium">{r.name}</td>
                <td className="py-2 pr-3 text-right font-mono text-zinc-700">{r.invoiceCount}</td>
                <td className="py-2 pr-3 text-right font-mono text-zinc-700">{r.totalUSD > 0 ? fmt(r.totalUSD) : "-"}</td>
                <td className="py-2 pr-3 text-right font-mono text-zinc-700">{r.totalIQD > 0 ? fmt(r.totalIQD) : "-"}</td>
              </tr>
            ))}
            {reps.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-zinc-500">No data / لا توجد بيانات</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Drill-down per rep */}
      {reps.map(([repId, r]) => (
        <details key={repId} className="mt-4 rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium text-zinc-900">{r.name} — {r.invoiceCount} invoices</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr className="border-b">
                  <th className="py-1 pr-3">Invoice # / رقم الفاتورة</th>
                  <th className="py-1 pr-3">Customer / الزبون</th>
                  <th className="py-1 pr-3">Date / التاريخ</th>
                  <th className="py-1 pr-3 text-right">Amount / المبلغ</th>
                  <th className="py-1 pr-3">Status / الحالة</th>
                </tr>
              </thead>
              <tbody>
                {r.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-b-0">
                    <td className="py-1 pr-3">
                      <Link className="underline text-zinc-700" href={`/app/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
                    </td>
                    <td className="py-1 pr-3 text-zinc-700">{inv.customer.name}</td>
                    <td className="py-1 pr-3 text-zinc-700">{inv.issueDate.toISOString().slice(0, 10)}</td>
                    <td className="py-1 pr-3 text-right font-mono text-zinc-700">{fmt(Number(inv.total))} {inv.currencyCode}</td>
                    <td className="py-1 pr-3">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-700">{inv.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}

