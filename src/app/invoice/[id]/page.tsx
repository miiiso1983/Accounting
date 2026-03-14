import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { prisma } from "@/lib/db/prisma";
import { buildPublicInvoiceUrl, hasValidPublicInvoiceAccess } from "@/lib/invoices/public-link";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const access = typeof sp.access === "string" ? sp.access : null;

  if (!hasValidPublicInvoiceAccess(id, access)) notFound();

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { company: true, customer: true, lineItems: true },
  });

  if (!invoice) notFound();

  const qrPayload = buildPublicInvoiceUrl(id);
  const [logoDataUrl, qrDataUrl] = await Promise.all([
    getLogoDataUrl(),
    QRCode.toDataURL(qrPayload, { width: 120, margin: 1 }).catch(() => ""),
  ]);

  const subtotal = Number(invoice.subtotal);
  const discountAmt = Number(invoice.discountAmount);
  const taxTotal = Number(invoice.taxTotal);
  const total = Number(invoice.total);

  return (
    <>
      <style>{`
        body { background: white !important; }
        @page { size: A4; margin: 15mm; }
      `}</style>

      <div className="mx-auto max-w-[210mm] rounded-2xl border bg-white p-8 shadow-sm" dir="ltr">
        <div className="flex items-start justify-between border-b pb-6">
          <div className="flex items-center gap-4">
            {logoDataUrl ? <img src={logoDataUrl} alt="Logo" width={72} height={72} className="rounded-lg object-contain" /> : null}
            <div>
              <h1 className="text-xl font-bold text-zinc-900">{invoice.company.name}</h1>
              <p className="mt-1 text-sm text-zinc-500">Invoice / فاتورة</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-sky-700">INVOICE</div>
            <div className="text-xl font-bold text-sky-700" dir="rtl">فاتورة</div>
            <div className="mt-2 font-mono text-lg text-zinc-900">{invoice.invoiceNumber}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-semibold uppercase text-zinc-400">Bill To / فاتورة إلى</div>
            <div className="mt-2 text-sm font-medium text-zinc-900">{invoice.customer.name}</div>
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
                <div><span className="text-zinc-400">Payment / الدفع:</span> <span className="inline-block rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  {invoice.paymentTerms === "MONTHLY" ? "Monthly / شهري" : invoice.paymentTerms === "QUARTERLY" ? "Quarterly / ربع سنوي" : "Yearly / سنوي"}
                </span></div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-zinc-200">
                <th className="py-3 text-left text-xs font-semibold uppercase text-zinc-400">#</th>
                <th className="py-3 text-left text-xs font-semibold uppercase text-zinc-400">Description / الوصف</th>
                <th className="py-3 text-right text-xs font-semibold uppercase text-zinc-400">Qty / الكمية</th>
                <th className="py-3 text-right text-xs font-semibold uppercase text-zinc-400">Price / السعر</th>
                <th className="py-3 text-right text-xs font-semibold uppercase text-zinc-400">Tax / ضريبة</th>
                <th className="py-3 text-right text-xs font-semibold uppercase text-zinc-400">Total / المجموع</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li, idx) => (
                <tr key={li.id} className="border-b border-zinc-100">
                  <td className="py-3 text-zinc-400">{idx + 1}</td>
                  <td className="py-3 text-zinc-900">{li.description}</td>
                  <td className="py-3 text-right font-mono text-zinc-700">{fmt(li.quantity)}</td>
                  <td className="py-3 text-right font-mono text-zinc-700">{fmt(li.unitPrice)}</td>
                  <td className="py-3 text-right font-mono text-zinc-700">{li.taxRate ? `${fmt(Number(li.taxRate) * 100)}%` : "-"}</td>
                  <td className="py-3 text-right font-mono font-medium text-zinc-900">{fmt(li.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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

        <div className="mt-8 flex items-end justify-between border-t pt-6">
          <div className="max-w-xs text-xs text-zinc-400">
            <p>Thank you for your business / شكراً لتعاملكم معنا</p>
            <p className="mt-1">This invoice was generated by {invoice.company.name}</p>
          </div>
          {qrDataUrl && (
            <div className="text-center">
              <img src={qrDataUrl} alt="QR Code" width={120} height={120} />
              <div className="mt-1 text-xs text-zinc-400">Scan to open invoice</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}