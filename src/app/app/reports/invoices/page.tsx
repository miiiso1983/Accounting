import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { getCachedCustomers, getCachedCostCenters } from "@/lib/db/cached-queries";
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

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  SENT: "bg-sky-100 text-sky-700",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-orange-100 text-orange-700",
};

export default async function InvoicesReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const customerId = typeof sp.customerId === "string" ? sp.customerId : undefined;
  const costCenterId = typeof sp.costCenterId === "string" ? sp.costCenterId : undefined;

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

  // Build invoice where clause
  const invoiceWhere: Record<string, unknown> = { companyId };
  if (issueDateWhere) invoiceWhere.issueDate = issueDateWhere;
  if (status && ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"].includes(status)) invoiceWhere.status = status;
  if (customerId) invoiceWhere.customerId = customerId;
  if (costCenterId) invoiceWhere.lineItems = { some: { costCenterId } };

  const [invoices, customers, costCenters] = await Promise.all([
    prisma.invoice.findMany({
      where: invoiceWhere,
      orderBy: [{ issueDate: "desc" }],
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        issueDate: true,
        dueDate: true,
        totalBase: true,
        customer: { select: { id: true, name: true } },
        lineItems: { select: { costCenter: { select: { id: true, name: true } } } },
        payments: { select: { amountBase: true } },
      },
    }),
    getCachedCustomers(companyId),
    getCachedCostCenters(companyId),
  ]);

  const rows = invoices.map((inv) => {
    const total = Number(inv.totalBase);
    const paid = inv.payments.reduce((s, p) => s + Number(p.amountBase), 0);
    const remaining = total - paid;
    const ccNames = [...new Set(inv.lineItems.map((li) => li.costCenter?.name).filter(Boolean))];
    return { ...inv, total, paid, remaining, costCenterNames: ccNames.join(", ") };
  });

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandPaid = rows.reduce((s, r) => s + r.paid, 0);
  const grandRemaining = rows.reduce((s, r) => s + r.remaining, 0);

  const qs = new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(status ? { status } : {}),
    ...(customerId ? { customerId } : {}),
    ...(costCenterId ? { costCenterId } : {}),
  }).toString();

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Reports / التقارير</div>
          <div className="mt-1 text-base font-semibold text-zinc-900">Invoices Report / تقرير الفواتير</div>
        </div>
        <ExportButtons excelHref={`/api/reports/invoices/export${qs ? `?${qs}` : ""}`} labels={{ excel: "Export Excel", print: "Print / PDF" }} />
      </div>

      {/* Filters */}
      <form className="mt-4 grid gap-3 md:grid-cols-12" method="GET" action="/app/reports/invoices">
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">From / من</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">To / إلى</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">Status / الحالة</label>
          <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" name="status" defaultValue={status ?? ""}>
            <option value="">All / الكل</option>
            <option value="DRAFT">Draft / مسودة</option>
            <option value="SENT">Sent / مرسلة</option>
            <option value="PAID">Paid / مدفوعة</option>
            <option value="OVERDUE">Overdue / متأخرة</option>
            <option value="CANCELLED">Cancelled / ملغاة</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">Customer / الزبون</label>
          <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" name="customerId" defaultValue={customerId ?? ""}>
            <option value="">All / الكل</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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

      {/* Summary */}
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-sky-50 px-4 py-3">
          <div className="text-xs text-sky-600">Invoices / عدد الفواتير</div>
          <div className="mt-1 text-lg font-bold text-sky-900">{rows.length}</div>
        </div>
        <div className="rounded-xl bg-zinc-50 px-4 py-3">
          <div className="text-xs text-zinc-600">Total / الإجمالي</div>
          <div className="mt-1 text-lg font-bold text-zinc-900">{fmt(grandTotal)}</div>
        </div>
        <div className="rounded-xl bg-emerald-50 px-4 py-3">
          <div className="text-xs text-emerald-600">Paid / المسدد</div>
          <div className="mt-1 text-lg font-bold text-emerald-900">{fmt(grandPaid)}</div>
        </div>
        <div className="rounded-xl bg-rose-50 px-4 py-3">
          <div className="text-xs text-rose-600">Remaining / المتبقي</div>
          <div className="mt-1 text-lg font-bold text-rose-900">{fmt(grandRemaining)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Invoice # / رقم الفاتورة</th>
              <th className="py-2 pr-3">Customer / الزبون</th>
              <th className="py-2 pr-3">Status / الحالة</th>
              <th className="py-2 pr-3">Issue Date / تاريخ الإصدار</th>
              <th className="py-2 pr-3">Due Date / تاريخ الاستحقاق</th>
              <th className="py-2 pr-3 text-right">Total / الإجمالي</th>
              <th className="py-2 pr-3 text-right">Paid / المسدد</th>
              <th className="py-2 pr-3 text-right">Remaining / المتبقي</th>
              <th className="py-2 pr-3">Cost Center / مركز الكلفة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3 font-mono text-zinc-700">{r.invoiceNumber}</td>
                <td className="py-2 pr-3 text-zinc-900">{r.customer.name}</td>
                <td className="py-2 pr-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-zinc-100 text-zinc-700"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="py-2 pr-3 text-zinc-700">{r.issueDate.toISOString().slice(0, 10)}</td>
                <td className="py-2 pr-3 text-zinc-700">{r.dueDate ? r.dueDate.toISOString().slice(0, 10) : "-"}</td>
                <td className="py-2 pr-3 text-right font-mono text-zinc-900">{fmt(r.total)}</td>
                <td className="py-2 pr-3 text-right font-mono text-emerald-700">{fmt(r.paid)}</td>
                <td className={`py-2 pr-3 text-right font-mono ${r.remaining > 0 ? "text-rose-600" : "text-zinc-500"}`}>{fmt(r.remaining)}</td>
                <td className="py-2 pr-3 text-xs text-zinc-500">{r.costCenterNames || "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="py-6 text-center text-zinc-400">No invoices found / لا توجد فواتير</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td colSpan={5} className="py-2 pr-3 text-zinc-700">Total / المجموع</td>
                <td className="py-2 pr-3 text-right font-mono text-zinc-900">{fmt(grandTotal)}</td>
                <td className="py-2 pr-3 text-right font-mono text-emerald-700">{fmt(grandPaid)}</td>
                <td className="py-2 pr-3 text-right font-mono text-rose-600">{fmt(grandRemaining)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

