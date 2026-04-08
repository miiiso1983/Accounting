import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/format/date";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { EstimateActions } from "./ui";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  SENT: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
  EXPIRED: "bg-amber-100 text-amber-700",
  CONVERTED: "bg-purple-100 text-purple-700",
};

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.ESTIMATE_READ)) return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company.</div>;

  const estimate = await prisma.estimate.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      customer: true,
      lineItems: true,
      exchangeRate: true,
      branch: { select: { code: true, name: true } },
      convertedInvoice: { select: { id: true, invoiceNumber: true } },
    },
  });

  if (!estimate) notFound();
  const canWrite = hasPermission(session, PERMISSIONS.ESTIMATE_WRITE);
  const canInvoice = hasPermission(session, PERMISSIONS.INVOICE_WRITE);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 md:p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
        <div>
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Estimates / عروض الأسعار</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900 flex items-center gap-3">
            {estimate.estimateNumber}
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[estimate.status] ?? ""}`}>{estimate.status}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-50" href="/app/estimates">← Back</Link>
          <Link className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-50" href={`/app/estimates/${id}/preview`}>Preview / معاينة</Link>
        </div>
      </div>

      <div className="mt-5 grid gap-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-sm">
          <div><span className="text-zinc-500">Customer / الزبون</span><div className="mt-1 font-medium text-zinc-900">{estimate.customer.name}</div></div>
          <div><span className="text-zinc-500">Issue Date</span><div className="mt-1 font-medium text-zinc-900">{formatDate(estimate.issueDate)}</div></div>
          <div><span className="text-zinc-500">Expiry Date</span><div className="mt-1 font-medium text-zinc-900">{estimate.expiryDate ? formatDate(estimate.expiryDate) : "-"}</div></div>
          <div><span className="text-zinc-500">Currency</span><div className="mt-1 font-medium text-zinc-900">{estimate.currencyCode}</div></div>
          {estimate.branch && <div><span className="text-zinc-500">Branch / الفرع</span><div className="mt-1 font-medium text-zinc-900">{estimate.branch.code} — {estimate.branch.name}</div></div>}
          {estimate.note && <div className="md:col-span-2"><span className="text-zinc-500">Note / ملاحظات</span><div className="mt-1 text-zinc-900">{estimate.note}</div></div>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr className="border-b"><th className="py-2 pr-3">Description</th><th className="py-2 pr-3">Qty</th><th className="py-2 pr-3">Price</th><th className="py-2 pr-3">Tax</th><th className="py-2 pr-3 text-right">Total</th></tr>
            </thead>
            <tbody>
              {estimate.lineItems.map((li) => (
                <tr key={li.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-3 text-zinc-900">{li.description}</td>
                  <td className="py-2 pr-3 font-mono">{fmt(li.quantity)}</td>
                  <td className="py-2 pr-3 font-mono">{fmt(li.unitPrice)}</td>
                  <td className="py-2 pr-3 font-mono">{li.taxRate ? `${Number(li.taxRate) * 100}%` : "-"}</td>
                  <td className="py-2 pr-3 font-mono text-right">{fmt(li.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 max-w-sm ml-auto">
          <div className="grid gap-1 text-sm">
            <div className="flex justify-between"><span className="text-zinc-600">Subtotal</span><span className="font-mono">{fmt(estimate.subtotal)} {estimate.currencyCode}</span></div>
            {Number(estimate.discountAmount) > 0 && <div className="flex justify-between text-amber-700"><span>Discount</span><span className="font-mono">-{fmt(estimate.discountAmount)}</span></div>}
            {Number(estimate.taxTotal) > 0 && <div className="flex justify-between"><span className="text-zinc-600">Tax</span><span className="font-mono">{fmt(estimate.taxTotal)}</span></div>}
            <div className="flex justify-between border-t border-sky-200 pt-1 font-bold"><span>Total</span><span className="font-mono">{fmt(estimate.total)} {estimate.currencyCode}</span></div>
          </div>
        </div>

        {estimate.convertedInvoice && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-sm">
            Converted to invoice: <Link className="underline text-purple-700 font-medium" href={`/app/invoices/${estimate.convertedInvoice.id}`}>{estimate.convertedInvoice.invoiceNumber}</Link>
          </div>
        )}

        {canWrite && <EstimateActions estimateId={id} status={estimate.status} canConvert={canInvoice} />}
      </div>
    </div>
  );
}
