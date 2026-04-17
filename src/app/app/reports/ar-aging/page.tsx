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

type Bucket = { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number; total: number };

function emptyBucket(): Bucket {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
}

export default async function ArAgingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const asOfParam = typeof sp.asOf === "string" ? sp.asOf : undefined;

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const asOfDate = asOfParam ? new Date(`${asOfParam}T23:59:59.999Z`) : new Date();
  const asOfMs = asOfDate.getTime();

  // Fetch outstanding invoices (SENT or OVERDUE)
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      status: { in: ["SENT", "OVERDUE"] },
      issueDate: { lte: asOfDate },
    },
    select: {
      id: true,
      invoiceNumber: true,
      issueDate: true,
      dueDate: true,
      totalBase: true,
      customerId: true,
      customer: { select: { id: true, name: true } },
    },
    orderBy: { issueDate: "asc" },
  });

  // Get payments and credit notes per invoice
  const invIds = invoices.map((i) => i.id);
  const [payAgg, cnAgg] = await Promise.all([
    invIds.length ? prisma.invoicePayment.groupBy({ by: ["invoiceId"], where: { companyId, invoiceId: { in: invIds } }, _sum: { amountBase: true } }) : [],
    invIds.length ? prisma.creditNote.groupBy({ by: ["invoiceId"], where: { companyId, invoiceId: { in: invIds } }, _sum: { totalBase: true } }) : [],
  ]);
  const paidMap = new Map<string, number>();
  for (const r of payAgg) paidMap.set(r.invoiceId, Number(r._sum.amountBase ?? 0));
  const cnMap = new Map<string, number>();
  for (const r of cnAgg) cnMap.set(r.invoiceId, Number(r._sum.totalBase ?? 0));

  // Group by customer
  const customerBuckets = new Map<string, { name: string; bucket: Bucket; invoiceCount: number }>();
  const grandTotal = emptyBucket();

  for (const inv of invoices) {
    const totalBase = Number(inv.totalBase);
    const paid = paidMap.get(inv.id) ?? 0;
    const credited = cnMap.get(inv.id) ?? 0;
    const amt = Math.max(0, totalBase - paid - credited);
    if (amt <= 0) continue; // fully settled

    const dueMs = inv.dueDate ? inv.dueDate.getTime() : inv.issueDate.getTime();
    const daysOverdue = Math.max(0, Math.floor((asOfMs - dueMs) / (1000 * 60 * 60 * 24)));

    if (!customerBuckets.has(inv.customerId)) {
      customerBuckets.set(inv.customerId, { name: inv.customer.name, bucket: emptyBucket(), invoiceCount: 0 });
    }
    const entry = customerBuckets.get(inv.customerId)!;
    entry.invoiceCount++;

    if (daysOverdue <= 0) { entry.bucket.current += amt; grandTotal.current += amt; }
    else if (daysOverdue <= 30) { entry.bucket.d1_30 += amt; grandTotal.d1_30 += amt; }
    else if (daysOverdue <= 60) { entry.bucket.d31_60 += amt; grandTotal.d31_60 += amt; }
    else if (daysOverdue <= 90) { entry.bucket.d61_90 += amt; grandTotal.d61_90 += amt; }
    else { entry.bucket.d90plus += amt; grandTotal.d90plus += amt; }

    entry.bucket.total += amt;
    grandTotal.total += amt;
  }

  const customers = [...customerBuckets.entries()].sort((a, b) => b[1].bucket.total - a[1].bucket.total);
  const qs = asOfParam ? `?asOf=${asOfParam}` : "";

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Reports / التقارير</div>
          <div className="mt-1 text-base font-semibold text-zinc-900">AR Aging Summary / تقادم الذمم المدينة</div>
        </div>
        <ExportButtons excelHref={`/api/reports/ar-aging/export${qs}`} labels={{ excel: "Export Excel", print: "Print / PDF" }} />
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-6" method="GET" action="/app/reports/ar-aging">
        <div className="md:col-span-3">
          <label className="text-xs font-medium text-zinc-600">As of date / بتاريخ</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="asOf" defaultValue={asOfParam ?? ""} />
        </div>
        <div className="md:col-span-3 flex items-end">
          <button type="submit" className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">Apply / تطبيق</button>
        </div>
      </form>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Customer / العميل</th>
              <th className="py-2 px-3 text-right">Current / جارية</th>
              <th className="py-2 px-3 text-right">1-30</th>
              <th className="py-2 px-3 text-right">31-60</th>
              <th className="py-2 px-3 text-right">61-90</th>
              <th className="py-2 px-3 text-right">90+</th>
              <th className="py-2 px-3 text-right font-semibold">Total / الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(([id, { name, bucket, invoiceCount }]) => (
              <tr key={id} className="border-b last:border-0">
                <td className="py-2 pr-3 text-zinc-900 font-medium">{name} <span className="text-xs text-zinc-400">({invoiceCount})</span></td>
                <td className="py-2 px-3 text-right font-mono text-zinc-800">{bucket.current ? fmt(bucket.current) : "-"}</td>
                <td className="py-2 px-3 text-right font-mono text-zinc-800">{bucket.d1_30 ? fmt(bucket.d1_30) : "-"}</td>
                <td className="py-2 px-3 text-right font-mono text-zinc-800">{bucket.d31_60 ? fmt(bucket.d31_60) : "-"}</td>
                <td className="py-2 px-3 text-right font-mono text-rose-600">{bucket.d61_90 ? fmt(bucket.d61_90) : "-"}</td>
                <td className="py-2 px-3 text-right font-mono text-rose-700 font-medium">{bucket.d90plus ? fmt(bucket.d90plus) : "-"}</td>
                <td className="py-2 px-3 text-right font-mono text-zinc-900 font-semibold">{fmt(bucket.total)}</td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-zinc-400">No outstanding invoices / لا توجد ذمم مستحقة</td></tr>}
          </tbody>
          {customers.length > 0 && (
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td className="py-2 pr-3 text-zinc-800">Grand Total / المجموع الكلي</td>
                <td className="py-2 px-3 text-right font-mono">{fmt(grandTotal.current)}</td>
                <td className="py-2 px-3 text-right font-mono">{fmt(grandTotal.d1_30)}</td>
                <td className="py-2 px-3 text-right font-mono">{fmt(grandTotal.d31_60)}</td>
                <td className="py-2 px-3 text-right font-mono text-rose-600">{fmt(grandTotal.d61_90)}</td>
                <td className="py-2 px-3 text-right font-mono text-rose-700">{fmt(grandTotal.d90plus)}</td>
                <td className="py-2 px-3 text-right font-mono text-zinc-900">{fmt(grandTotal.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

