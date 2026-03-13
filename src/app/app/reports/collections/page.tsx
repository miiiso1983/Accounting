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

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;

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

  // Fetch PAID invoices (use updatedAt as payment date proxy)
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      status: "PAID",
      ...(fromDate || toDate ? { updatedAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}),
    },
    select: {
      id: true,
      invoiceNumber: true,
      issueDate: true,
      updatedAt: true,
      totalBase: true,
      currencyCode: true,
      customer: { select: { id: true, name: true } },
    },
    orderBy: [{ customer: { name: "asc" } }, { updatedAt: "desc" }],
  });

  // Calculate days to collect and group by customer
  type Row = { invoiceNumber: string; issueDate: string; paidDate: string; amount: number; currency: string; daysToCollect: number };
  const customerGroups = new Map<string, { name: string; rows: Row[]; totalAmount: number; totalDays: number }>();

  for (const inv of invoices) {
    const issueMs = inv.issueDate.getTime();
    const paidMs = inv.updatedAt.getTime();
    const daysToCollect = Math.max(0, Math.floor((paidMs - issueMs) / 86400000));
    const amount = Number(inv.totalBase);

    if (!customerGroups.has(inv.customer.id)) {
      customerGroups.set(inv.customer.id, { name: inv.customer.name, rows: [], totalAmount: 0, totalDays: 0 });
    }
    const g = customerGroups.get(inv.customer.id)!;
    g.rows.push({
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate.toISOString().slice(0, 10),
      paidDate: inv.updatedAt.toISOString().slice(0, 10),
      amount,
      currency: inv.currencyCode,
      daysToCollect,
    });
    g.totalAmount += amount;
    g.totalDays += daysToCollect;
  }

  const groups = [...customerGroups.entries()].sort((a, b) => b[1].totalAmount - a[1].totalAmount);
  const grandTotal = invoices.reduce((s, inv) => s + Number(inv.totalBase), 0);
  const avgDays = invoices.length > 0
    ? Math.round(groups.reduce((s, [, g]) => s + g.totalDays, 0) / invoices.length)
    : 0;

  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Reports / التقارير</div>
          <div className="mt-1 text-base font-semibold text-zinc-900">Collection Report / تقرير التحصيل</div>
        </div>
        <ExportButtons excelHref={`/api/reports/collections/export${qs ? `?${qs}` : ""}`} labels={{ excel: "Export Excel", print: "Print / PDF" }} />
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-6" method="GET" action="/app/reports/collections">
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">From / من</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">To / إلى</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <div className="md:col-span-2 flex items-end">
          <button type="submit" className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">Apply / تطبيق</button>
        </div>
      </form>

      {/* Summary cards */}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-emerald-50/60 px-4 py-3">
          <div className="text-xs text-zinc-500">Total Collected / إجمالي التحصيل</div>
          <div className="mt-1 font-mono text-lg font-bold text-emerald-800">{fmt(grandTotal)}</div>
        </div>
        <div className="rounded-xl border bg-sky-50/60 px-4 py-3">
          <div className="text-xs text-zinc-500">Invoices Paid / فواتير محصّلة</div>
          <div className="mt-1 text-lg font-bold text-sky-800">{invoices.length}</div>
        </div>
        <div className="rounded-xl border bg-orange-50/60 px-4 py-3">
          <div className="text-xs text-zinc-500">Avg Collection Period / متوسط التحصيل</div>
          <div className="mt-1 text-lg font-bold text-orange-800">{avgDays} days / أيام</div>
        </div>
      </div>
      {/* Detail table grouped by customer */}
      <div className="mt-4 overflow-x-auto">
        {groups.map(([custId, g]) => (
          <div key={custId} className="mb-4">
            <div className="rounded-t-xl bg-zinc-50 px-4 py-2 font-semibold text-sm text-zinc-800 flex justify-between">
              <span>{g.name}</span>
              <span className="font-mono">{fmt(g.totalAmount)} <span className="text-xs text-zinc-400">({g.rows.length} inv, avg {g.rows.length > 0 ? Math.round(g.totalDays / g.rows.length) : 0}d)</span></span>
            </div>
            <table className="w-full text-sm border-b">
              <thead className="text-xs text-zinc-500">
                <tr className="border-b">
                  <th className="py-1.5 px-3 text-left">Invoice # / رقم الفاتورة</th>
                  <th className="py-1.5 px-3 text-left">Issue Date / تاريخ الإصدار</th>
                  <th className="py-1.5 px-3 text-left">Paid Date / تاريخ الدفع</th>
                  <th className="py-1.5 px-3 text-right">Amount / المبلغ</th>
                  <th className="py-1.5 px-3 text-right">Days / أيام</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1.5 px-3 font-mono text-zinc-800">{r.invoiceNumber}</td>
                    <td className="py-1.5 px-3 text-zinc-700">{r.issueDate}</td>
                    <td className="py-1.5 px-3 text-zinc-700">{r.paidDate}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-zinc-900">{fmt(r.amount)}</td>
                    <td className={`py-1.5 px-3 text-right font-mono ${r.daysToCollect > 60 ? "text-rose-600 font-medium" : r.daysToCollect > 30 ? "text-orange-600" : "text-zinc-700"}`}>{r.daysToCollect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {groups.length === 0 && <div className="py-4 text-center text-zinc-400 text-sm">No paid invoices found / لا توجد فواتير محصّلة</div>}
      </div>
    </div>
  );
}

