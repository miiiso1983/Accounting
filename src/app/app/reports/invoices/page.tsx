import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { formatDate } from "@/lib/format/date";
import { prisma } from "@/lib/db/prisma";
import { getCachedCustomers, getCachedCostCenters } from "@/lib/db/cached-queries";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { InvoicesReportTable } from "./InvoicesReportTable";

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
        currencyCode: true,
        customer: { select: { id: true, name: true } },
        lineItems: { select: { costCenter: { select: { id: true, name: true } } } },
        payments: { select: { amountBase: true } },
        creditNotes: { select: { totalBase: true } },
      },
    }),
    getCachedCustomers(companyId),
    getCachedCostCenters(companyId),
  ]);

  const rows = invoices.map((inv) => {
    const total = Number(inv.totalBase);
    const paid = inv.payments.reduce((s, p) => s + Number(p.amountBase), 0);
    const credited = inv.creditNotes.reduce((s, cn) => s + Number(cn.totalBase), 0);
    const remaining = total - paid - credited;
    const ccNames = [...new Set(inv.lineItems.map((li) => li.costCenter?.name).filter(Boolean))];
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customer.name,
      status: inv.status,
      issueDate: formatDate(inv.issueDate),
      dueDate: inv.dueDate ? formatDate(inv.dueDate) : null,
      currencyCode: inv.currencyCode,
      total,
      paid,
      remaining,
      costCenterNames: ccNames.join(", "),
    };
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

      {/* Table with column selector and drill-down links */}
      <InvoicesReportTable
        rows={rows}
        grandTotal={grandTotal}
        grandPaid={grandPaid}
        grandRemaining={grandRemaining}
        excelBaseHref={`/api/reports/invoices/export${qs ? `?${qs}` : ""}`}
      />
    </div>
  );
}

