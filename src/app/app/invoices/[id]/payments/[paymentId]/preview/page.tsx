import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { formatReceiptNumber } from "@/lib/payments/receipt-number";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { PrintButton } from "../../../preview/print-button";

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

export default async function PaymentReceiptPreviewPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) {
    return <div className="p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="p-5 text-sm">No company assigned.</div>;

  const [payment, company] = await Promise.all([
    prisma.invoicePayment.findFirst({
      where: { id: paymentId, invoiceId: id, companyId },
      include: { invoice: { include: { customer: true } } },
    }),
    prisma.company.findUnique({ where: { id: companyId } }),
  ]);

  if (!payment || !company) return <div className="p-5 text-sm">Not found.</div>;

  const invoice = payment.invoice;
  const customer = invoice.customer;
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

      {/* Receipt */}
      <div className="print-page mx-auto max-w-[210mm] rounded-2xl border bg-white p-8 shadow-sm" dir="ltr">
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-6">
          <div className="flex items-center gap-4">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt="Logo" width={72} height={72} className="rounded-lg object-contain" />
            ) : null}
            <div>
              <h1 className="text-xl font-bold text-zinc-900">{company.name}</h1>
              <p className="mt-1 text-sm text-zinc-500">Payment Receipt / إيصال دفع</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-emerald-700">PAYMENT RECEIPT</div>
            <div className="text-xl font-bold text-emerald-700" dir="rtl">إيصال دفع</div>
          </div>
        </div>

        {/* Info grid */}
        <div className="mt-6 grid grid-cols-2 gap-6">
          {/* Left: Customer info */}
          <div>
            <div className="text-xs font-semibold uppercase text-zinc-400">Received From / استلمنا من</div>
            <div className="mt-2 text-sm font-medium text-zinc-900">{customer.name}</div>
            {customer.companyName && <div className="text-sm text-zinc-700">{customer.companyName}</div>}
            {customer.email && <div className="text-sm text-zinc-600">{customer.email}</div>}
            {customer.phone && <div className="text-sm text-zinc-600">{customer.phone}</div>}
            {customer.address1 && <div className="text-sm text-zinc-600">{customer.address1}</div>}
            {customer.city && (
              <div className="text-sm text-zinc-600">
                {customer.city}
                {customer.country ? `, ${customer.country}` : ""}
              </div>
            )}
          </div>
          {/* Right: Receipt details */}
          <div className="text-right">
            <div className="grid gap-1 text-sm">
              <div>
                <span className="text-zinc-400">Invoice # / رقم الفاتورة:</span>{" "}
                <span className="font-mono">{invoice.invoiceNumber}</span>
              </div>
              <div>
                <span className="text-zinc-400">Receipt # / رقم الإيصال:</span>{" "}
                <span className="font-mono">{formatReceiptNumber(payment.receiptNumber, payment.id)}</span>
              </div>
              <div>
                <span className="text-zinc-400">Date / التاريخ:</span>{" "}
                <span className="font-mono">{fmtDate(payment.paymentDate)}</span>
              </div>
              <div>
                <span className="text-zinc-400">Method / طريقة الدفع:</span>{" "}
                <span className="font-mono uppercase">{payment.method ?? "-"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Amount box */}
        <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="text-xs font-semibold uppercase text-emerald-600">Amount Paid / المبلغ المدفوع</div>
          <div className="mt-2 text-3xl font-bold text-emerald-800 font-mono">
            {fmt(payment.amount)} {payment.currencyCode}
          </div>
          {payment.currencyCode !== payment.baseCurrencyCode && (
            <div className="mt-1 text-sm text-emerald-600 font-mono">
              Base / الأساس: {fmt(payment.amountBase)} {payment.baseCurrencyCode}
            </div>
          )}
        </div>

        {/* Note */}
        {payment.note && payment.note.trim() && (
          <div className="mt-6 rounded-xl border p-4">
            <div className="text-xs font-semibold uppercase text-zinc-400">Note / ملاحظة</div>
            <div className="mt-2 text-sm text-zinc-700">{payment.note}</div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 border-t pt-6">
          <div className="text-xs text-zinc-400">
            <p>Thank you for your payment / شكراً لدفعكم</p>
            <p className="mt-1">This receipt was generated by {company.name}</p>
          </div>
        </div>
      </div>
    </>
  );
}

