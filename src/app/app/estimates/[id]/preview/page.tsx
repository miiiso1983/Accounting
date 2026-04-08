import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { PrintButton } from "@/app/app/invoices/[id]/preview/print-button";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtDate(d: Date) {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

async function getLogoDataUrl() {
  try {
    const logoBuffer = await readFile(join(process.cwd(), "public", "logo.PNG"));
    return `data:image/png;base64,${logoBuffer.toString("base64")}`;
  } catch { return ""; }
}

export default async function EstimatePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.ESTIMATE_READ)) return <div className="p-5 text-sm">Not authorized.</div>;

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true, company: true } });
  const companyId = user?.companyId;
  const company = user?.company;
  if (!companyId || !company) return <div className="p-5 text-sm">No company assigned.</div>;

  const estimate = await prisma.estimate.findFirst({
    where: { id, companyId },
    include: { customer: true, lineItems: true },
  });
  if (!estimate) return <div className="p-5 text-sm">Not found.</div>;

  const subtotal = Number(estimate.subtotal);
  const discountAmt = Number(estimate.discountAmount);
  const taxTotal = Number(estimate.taxTotal);
  const total = Number(estimate.total);
  const logoDataUrl = await getLogoDataUrl();

  return (
    <>
      <style>{`
        @media print { body { background: white !important; } .no-print { display: none !important; } .print-page { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; } }
        @page { size: A4; margin: 15mm; }
      `}</style>

      <div className="no-print mb-4 flex items-center gap-3 px-4">
        <a href={`/app/estimates/${id}`} className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50">← Back</a>
        <PrintButton />
      </div>

      <div className="print-page mx-auto max-w-[210mm] rounded-2xl border bg-white p-8 shadow-sm" dir="ltr">
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-6">
          <div className="flex items-center gap-4">
            {logoDataUrl ? <img src={logoDataUrl} alt="Logo" width={72} height={72} className="rounded-lg object-contain" /> : null}
            <div>
              <h1 className="text-xl font-bold text-zinc-900">{company.name}</h1>
              <p className="mt-1 text-sm text-zinc-500">Estimate / عرض سعر</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-sky-700">ESTIMATE</div>
            <div className="text-xl font-bold text-sky-700" dir="rtl">عرض سعر</div>
            <div className="mt-2 font-mono text-lg text-zinc-900">{estimate.estimateNumber}</div>
          </div>
        </div>

        {/* Info grid */}
        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-semibold uppercase text-zinc-400">To / إلى</div>
            <div className="mt-2 text-sm text-zinc-900 font-medium">{estimate.customer.name}</div>
            {estimate.customer.companyName && <div className="text-sm text-zinc-700">{estimate.customer.companyName}</div>}
            {estimate.customer.email && <div className="text-sm text-zinc-600">{estimate.customer.email}</div>}
            {estimate.customer.phone && <div className="text-sm text-zinc-600">{estimate.customer.phone}</div>}
          </div>
          <div className="text-right">
            <div className="grid gap-1 text-sm">
              <div><span className="text-zinc-400">Date / التاريخ:</span> <span className="font-mono">{fmtDate(estimate.issueDate)}</span></div>
              {estimate.expiryDate && <div><span className="text-zinc-400">Valid until / صالح حتى:</span> <span className="font-mono">{fmtDate(estimate.expiryDate)}</span></div>}
              <div><span className="text-zinc-400">Status / الحالة:</span> <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-700`}>{estimate.status}</span></div>
              <div><span className="text-zinc-400">Currency / العملة:</span> <span className="font-mono">{estimate.currencyCode}</span></div>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="mt-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-zinc-200">
                <th className="py-3 text-left text-xs font-semibold uppercase text-zinc-400">#</th>
                <th className="py-3 text-left text-xs font-semibold uppercase text-zinc-400">Description / الوصف</th>
                <th className="py-3 text-right text-xs font-semibold uppercase text-zinc-400">Qty / الكمية</th>
                <th className="py-3 text-right text-xs font-semibold uppercase text-zinc-400">Price / السعر</th>
                <th className="py-3 text-right text-xs font-semibold uppercase text-zinc-400">Discount / خصم</th>
                <th className="py-3 text-right text-xs font-semibold uppercase text-zinc-400">Tax / ضريبة</th>
                <th className="py-3 text-right text-xs font-semibold uppercase text-zinc-400">Total / المجموع</th>
              </tr>
            </thead>
            <tbody>
              {estimate.lineItems.map((li, idx) => {
                const hasLineDiscount = li.discountType && Number(li.discountValue) > 0;
                const discountLabel = hasLineDiscount ? (li.discountType === "PERCENTAGE" ? `${fmt(li.discountValue)}%` : fmt(li.discountValue)) : "-";
                return (
                  <tr key={li.id} className="border-b border-zinc-100">
                    <td className="py-3 text-zinc-400">{idx + 1}</td>
                    <td className="py-3 text-zinc-900">{li.description}</td>
                    <td className="py-3 text-right font-mono text-zinc-700">{fmt(li.quantity)}</td>
                    <td className="py-3 text-right font-mono text-zinc-700">{fmt(li.unitPrice)}</td>
                    <td className="py-3 text-right font-mono text-amber-700">{discountLabel}</td>
                    <td className="py-3 text-right font-mono text-zinc-700">{li.taxRate ? `${fmt(Number(li.taxRate) * 100)}%` : "-"}</td>
                    <td className="py-3 text-right font-mono text-zinc-900 font-medium">{fmt(li.lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-6 flex justify-end">
          <div className="w-72">
            <div className="flex justify-between border-b py-2 text-sm"><span className="text-zinc-500">Subtotal / المجموع الفرعي</span><span className="font-mono font-medium">{fmt(subtotal)} {estimate.currencyCode}</span></div>
            {discountAmt > 0 && <div className="flex justify-between border-b py-2 text-sm text-amber-700"><span>Discount / خصم {estimate.discountType === "PERCENTAGE" ? `(${fmt(estimate.discountValue)}%)` : ""}</span><span className="font-mono font-medium">-{fmt(discountAmt)} {estimate.currencyCode}</span></div>}
            {taxTotal > 0 && <div className="flex justify-between border-b py-2 text-sm"><span className="text-zinc-500">Tax / ضريبة</span><span className="font-mono font-medium">{fmt(taxTotal)} {estimate.currencyCode}</span></div>}
            <div className="flex justify-between py-3 text-base font-bold"><span>Total / الإجمالي</span><span className="font-mono text-sky-700">{fmt(total)} {estimate.currencyCode}</span></div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t pt-6 text-xs text-zinc-400">
          {estimate.note && <p className="mb-2 text-sm text-zinc-600">{estimate.note}</p>}
          <p>Thank you for your interest / شكراً لاهتمامكم</p>
          <p className="mt-1">This estimate was generated by {company.name}</p>
        </div>
      </div>
    </>
  );
}
