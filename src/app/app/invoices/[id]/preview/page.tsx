import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import QRCode from "qrcode";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { buildPublicInvoiceUrl } from "@/lib/invoices/public-link";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { PrintButton } from "./print-button";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function getLogoDataUrl() {
  try {
    const logoBuffer = await readFile(join(process.cwd(), "public", "logo.PNG"));
    return `data:image/png;base64,${logoBuffer.toString("base64")}`;
  } catch {
    return "";
  }
}

export default async function InvoicePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) {
    return <div className="p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="p-5 text-sm">No company assigned.</div>;

  const [invoice, company] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id, companyId },
      include: { customer: true, lineItems: true },
    }),
    prisma.company.findUnique({ where: { id: companyId } }),
  ]);

  if (!invoice || !company) return <div className="p-5 text-sm">Not found.</div>;

  // Generate QR code — use a public signed URL so scanning opens the invoice without login
  const qrPayload = buildPublicInvoiceUrl(id);

  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 120, margin: 1 });
    // Update qrPayload in DB
    await prisma.invoice.update({ where: { id }, data: { qrPayload } });
  } catch {
    // QR generation failed, continue without it
  }

  const subtotal = Number(invoice.subtotal);
  const discountAmt = Number(invoice.discountAmount);
  const taxTotal = Number(invoice.taxTotal);
  const total = Number(invoice.total);
  const logoDataUrl = await getLogoDataUrl();

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>

      {/* Action bar */}
      <div className="no-print mb-4 flex items-center gap-3 px-4">
        <a href={`/app/invoices/${id}`} className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50">
          ← Back
        </a>
        <PrintButton />
      </div>

      {/* Invoice */}
      <div className="print-page mx-auto max-w-[210mm] rounded-2xl border bg-white p-8 shadow-sm" dir="ltr">
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-6">
          <div className="flex items-center gap-4">
            {logoDataUrl ? <img src={logoDataUrl} alt="Logo" width={72} height={72} className="rounded-lg object-contain" /> : null}
            <div>
              <h1 className="text-xl font-bold text-zinc-900">{company.name}</h1>
              <p className="mt-1 text-sm text-zinc-500">Invoice / فاتورة</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-sky-700">INVOICE</div>
            <div className="text-xl font-bold text-sky-700" dir="rtl">فاتورة</div>
            <div className="mt-2 font-mono text-lg text-zinc-900">{invoice.invoiceNumber}</div>
          </div>
        </div>

        {/* Info grid */}
        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-semibold uppercase text-zinc-400">Bill To / فاتورة إلى</div>
            <div className="mt-2 text-sm text-zinc-900 font-medium">{invoice.customer.name}</div>
            {invoice.customer.companyName && <div className="text-sm text-zinc-700">{invoice.customer.companyName}</div>}
            {invoice.customer.email && <div className="text-sm text-zinc-600">{invoice.customer.email}</div>}
            {invoice.customer.phone && <div className="text-sm text-zinc-600">{invoice.customer.phone}</div>}
            {invoice.customer.address1 && <div className="text-sm text-zinc-600">{invoice.customer.address1}</div>}
            {invoice.customer.city && <div className="text-sm text-zinc-600">{invoice.customer.city}{invoice.customer.country ? `, ${invoice.customer.country}` : ""}</div>}
          </div>
          <div className="text-right">
            <div className="grid gap-1 text-sm">
              <div><span className="text-zinc-400">Date / التاريخ:</span> <span className="font-mono">{fmtDate(invoice.issueDate)}</span></div>
              {invoice.dueDate && <div><span className="text-zinc-400">Due / الاستحقاق:</span> <span className="font-mono">{fmtDate(invoice.dueDate)}</span></div>}
              <div><span className="text-zinc-400">Status / الحالة:</span> <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${invoice.status === "PAID" ? "bg-emerald-100 text-emerald-700" : invoice.status === "SENT" ? "bg-sky-100 text-sky-700" : "bg-zinc-100 text-zinc-700"}`}>{invoice.status}</span></div>
              <div><span className="text-zinc-400">Currency / العملة:</span> <span className="font-mono">{invoice.currencyCode}</span></div>
              {invoice.paymentTerms && (
                <div><span className="text-zinc-400">Payment / الدفع:</span> <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700`}>
                  {invoice.paymentTerms === "MONTHLY" ? "Monthly / شهري" : invoice.paymentTerms === "QUARTERLY" ? "Quarterly / ربع سنوي" : "Yearly / سنوي"}
                </span></div>
              )}
            </div>
          </div>
        </div>

        {/* Line items table */}
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
              {invoice.lineItems.map((li, idx) => {
                const hasLineDiscount = li.discountType && Number(li.discountValue) > 0;
                const discountLabel = hasLineDiscount
                  ? li.discountType === "PERCENTAGE"
                    ? `${fmt(li.discountValue)}%`
                    : fmt(li.discountValue)
                  : "-";
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
            <div className="flex justify-between border-b py-2 text-sm">
              <span className="text-zinc-500">Subtotal / المجموع الفرعي</span>
              <span className="font-mono font-medium">{fmt(subtotal)} {invoice.currencyCode}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between border-b py-2 text-sm text-amber-700">
                <span>Discount / خصم {invoice.discountType === "PERCENTAGE" ? `(${fmt(invoice.discountValue)}%)` : ""}</span>
                <span className="font-mono font-medium">-{fmt(discountAmt)} {invoice.currencyCode}</span>
              </div>
            )}
            {taxTotal > 0 && (
              <div className="flex justify-between border-b py-2 text-sm">
                <span className="text-zinc-500">Tax / ضريبة</span>
                <span className="font-mono font-medium">{fmt(taxTotal)} {invoice.currencyCode}</span>
              </div>
            )}
            <div className="flex justify-between py-3 text-base font-bold">
              <span>Total / الإجمالي</span>
              <span className="font-mono text-sky-700">{fmt(total)} {invoice.currencyCode}</span>
            </div>
          </div>
        </div>

        {/* QR Code & Footer */}
        <div className="mt-8 flex items-end justify-between border-t pt-6">
          <div className="text-xs text-zinc-400 max-w-xs">
            <p>Thank you for your business / شكراً لتعاملكم معنا</p>
            <p className="mt-1">This invoice was generated by {company.name}</p>
          </div>
          {qrDataUrl && (
            <div className="text-center">
              <img src={qrDataUrl} alt="QR Code" width={120} height={120} />
              <div className="mt-1 text-xs text-zinc-400">Scan for details</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

