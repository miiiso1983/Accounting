import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { prisma } from "@/lib/db/prisma";
import { buildPublicReceiptUrl, hasValidPublicReceiptAccess } from "@/lib/payments/public-link";
import { formatReceiptNumber } from "@/lib/payments/receipt-number";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
  } catch {
    return "";
  }
}

export default async function PublicReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const access = typeof sp.access === "string" ? sp.access : null;
  if (!hasValidPublicReceiptAccess(id, access)) notFound();

  const payment = await prisma.invoicePayment.findUnique({
    where: { id },
    include: { invoice: { include: { company: true, customer: true } } },
  });
  if (!payment) notFound();

  const qrPayload = buildPublicReceiptUrl(id);
  const [logoDataUrl, qrDataUrl] = await Promise.all([
    getLogoDataUrl(),
    QRCode.toDataURL(qrPayload, { width: 120, margin: 1 }).catch(() => ""),
  ]);

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
              <h1 className="text-xl font-bold text-zinc-900">{payment.invoice.company.name}</h1>
              <p className="mt-1 text-sm text-zinc-500">Payment Receipt / إيصال دفع</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-emerald-700">RECEIPT</div>
            <div className="text-xl font-bold text-emerald-700" dir="rtl">إيصال</div>
            <div className="mt-2 font-mono text-xs text-zinc-500">Receipt #</div>
            <div className="font-mono text-sm text-zinc-900">{formatReceiptNumber(payment.receiptNumber, payment.id)}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-semibold uppercase text-zinc-400">Received From / استلمنا من</div>
            <div className="mt-2 text-sm font-medium text-zinc-900">{payment.invoice.customer.name}</div>
            {payment.invoice.customer.email && <div className="text-sm text-zinc-600">{payment.invoice.customer.email}</div>}
            {payment.invoice.customer.phone && <div className="text-sm text-zinc-600">{payment.invoice.customer.phone}</div>}
          </div>
          <div className="text-right">
            <div className="grid gap-1 text-sm">
              <div><span className="text-zinc-400">Invoice # / رقم الفاتورة:</span> <span className="font-mono">{payment.invoice.invoiceNumber}</span></div>
              <div><span className="text-zinc-400">Date / التاريخ:</span> <span className="font-mono">{fmtDate(payment.paymentDate)}</span></div>
              <div><span className="text-zinc-400">Method / الطريقة:</span> <span className="font-mono">{payment.method ?? "-"}</span></div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs font-semibold uppercase text-emerald-800">Amount Paid / المبلغ المدفوع</div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-700">
            {fmt(payment.amount)} {payment.currencyCode}
          </div>
          <div className="mt-1 text-xs text-emerald-800">
            Base: {fmt(payment.amountBase)} {payment.baseCurrencyCode}
          </div>
        </div>

        {payment.note ? (
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase text-zinc-400">Note / ملاحظة</div>
            <div className="mt-2 text-sm text-zinc-800">{payment.note}</div>
          </div>
        ) : null}

        <div className="mt-8 flex items-end justify-between border-t pt-6">
          <div className="max-w-xs text-xs text-zinc-400">
            <p>Thank you / شكراً لكم</p>
            <p className="mt-1">This receipt was generated by {payment.invoice.company.name}</p>
          </div>
          {qrDataUrl && (
            <div className="text-center">
              <img src={qrDataUrl} alt="QR Code" width={120} height={120} />
              <div className="mt-1 text-xs text-zinc-400">Scan to open receipt</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
