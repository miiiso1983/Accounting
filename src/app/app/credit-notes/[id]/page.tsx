import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/format/date";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function CreditNoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.CREDIT_NOTE_READ)) return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company.</div>;

  const cn = await prisma.creditNote.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      invoice: { select: { id: true, invoiceNumber: true, customer: { select: { id: true, name: true, companyName: true } } } },
      lineItems: true,
      journalEntry: { select: { id: true, entryNumber: true } },
      branch: { select: { code: true, name: true } },
    },
  });

  if (!cn) notFound();

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 md:p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
        <div>
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Credit Note / إشعار دائن</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">{cn.creditNoteNumber}</div>
        </div>
        <Link className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-50" href="/app/credit-notes">← Back</Link>
      </div>

      <div className="mt-5 grid gap-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-sm">
          <div><span className="text-zinc-500">Invoice / الفاتورة</span><div className="mt-1"><Link className="underline font-medium text-zinc-900" href={`/app/invoices/${cn.invoice.id}`}>{cn.invoice.invoiceNumber}</Link></div></div>
          <div><span className="text-zinc-500">Customer / الزبون</span><div className="mt-1 font-medium text-zinc-900">{cn.invoice.customer.name}</div></div>
          <div><span className="text-zinc-500">Date / التاريخ</span><div className="mt-1 font-medium text-zinc-900">{formatDate(cn.issueDate)}</div></div>
          <div><span className="text-zinc-500">Currency / العملة</span><div className="mt-1 font-medium text-zinc-900">{cn.currencyCode}</div></div>
          {cn.branch && <div><span className="text-zinc-500">Branch / الفرع</span><div className="mt-1 font-medium text-zinc-900">{cn.branch.code} — {cn.branch.name}</div></div>}
          {cn.reason && <div className="md:col-span-2"><span className="text-zinc-500">Reason / السبب</span><div className="mt-1 text-zinc-900">{cn.reason}</div></div>}
          {cn.journalEntry && <div><span className="text-zinc-500">Journal Entry / قيد محاسبي</span><div className="mt-1"><Link className="underline text-zinc-900" href={`/app/journal/${cn.journalEntry.id}`}>{cn.journalEntry.entryNumber}</Link></div></div>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr className="border-b"><th className="py-2 pr-3">Description</th><th className="py-2 pr-3">Qty</th><th className="py-2 pr-3">Price</th><th className="py-2 pr-3">Tax</th><th className="py-2 pr-3 text-right">Total</th></tr>
            </thead>
            <tbody>
              {cn.lineItems.map((li) => (
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

        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 max-w-sm ml-auto">
          <div className="grid gap-1 text-sm">
            <div className="flex justify-between"><span className="text-zinc-600">Subtotal / الفرعي</span><span className="font-mono">{fmt(cn.subtotal)} {cn.currencyCode}</span></div>
            {Number(cn.taxTotal) > 0 && <div className="flex justify-between"><span className="text-zinc-600">Tax / ضريبة</span><span className="font-mono">{fmt(cn.taxTotal)} {cn.currencyCode}</span></div>}
            <div className="flex justify-between border-t border-rose-200 pt-1 font-bold"><span>Total / الإجمالي</span><span className="font-mono">{fmt(cn.total)} {cn.currencyCode}</span></div>
            {cn.currencyCode !== cn.baseCurrencyCode && (
              <div className="flex justify-between text-xs text-zinc-500 pt-1"><span>Total (base)</span><span className="font-mono">{fmt(cn.totalBase)} {cn.baseCurrencyCode}</span></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
