import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { formatDate } from "@/lib/format/date";
import { prisma } from "@/lib/db/prisma";
import { buildPublicReceiptUrl } from "@/lib/payments/public-link";
import { formatReceiptNumber } from "@/lib/payments/receipt-number";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { InvoiceActions, InvoicePaymentsPanel } from "./ui";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function InvoiceDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId },
    include: {
      customer: { select: { id: true, name: true, companyName: true, email: true, phone: true } },
      exchangeRate: true,
      lineItems: true,
      payments: { orderBy: { paymentDate: "desc" } },
      creditNotes: { orderBy: { createdAt: "desc" }, include: { lineItems: true } },
      journalEntry: { select: { id: true } },
      salesRepresentative: { select: { id: true, name: true } },
      branch: { select: { id: true, code: true, name: true } },
    },
  });

  if (!invoice) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;

  // Compute remaining balance = total - payments - credit notes
  const isClosed = invoice.status === "CLOSED" || invoice.status === "WRITTEN_OFF" || invoice.status === "CANCELLED";
  const paidBase = invoice.payments.reduce((s, p) => s + Number(p.amountBase), 0);
  const creditedBase = invoice.creditNotes.reduce((s, cn) => s + Number(cn.totalBase), 0);
  const paidInCurrency = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const creditedInCurrency = invoice.creditNotes.reduce((s, cn) => s + Number(cn.total), 0);
  const remainingBase = isClosed ? 0 : Math.max(0, Number(invoice.totalBase) - paidBase - creditedBase);
  const remainingInCurrency = isClosed ? 0 : Math.max(0, Number(invoice.total) - paidInCurrency - creditedInCurrency);
  const hasCreditNotes = invoice.creditNotes.length > 0;
  const hasPayments = invoice.payments.length > 0;

		  const canSend = hasPermission(session, PERMISSIONS.INVOICE_SEND);
		  const canEdit = hasPermission(session, PERMISSIONS.INVOICE_WRITE) && invoice.status === "DRAFT";
		  const canPaymentRead = hasPermission(session, PERMISSIONS.INVOICE_PAYMENT_READ);
		  const canPaymentWrite = hasPermission(session, PERMISSIONS.INVOICE_PAYMENT_WRITE);

		  const payments = invoice.payments.map((p) => ({
		    id: p.id,
		    receiptLabel: formatReceiptNumber(p.receiptNumber, p.id),
		    paymentDate: formatDate(p.paymentDate),
		    amount: fmt(p.amount),
		    currencyCode: p.currencyCode,
		    amountBase: fmt(p.amountBase),
		    baseCurrencyCode: p.baseCurrencyCode,
		    method: p.method ?? "-",
		    note: p.note ?? "",
		    receiptUrl: buildPublicReceiptUrl(p.id),
		  }));

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Invoice</div>
          <div className="mt-1 text-base font-medium text-zinc-900">{invoice.invoiceNumber}</div>
          <div className="mt-1 text-xs text-zinc-500">Customer: {invoice.customer.name}</div>
          {invoice.salesRepresentative ? (
            <div className="mt-0.5 text-xs text-zinc-500">Sales Rep / المندوب: {invoice.salesRepresentative.name}</div>
          ) : null}
          {invoice.branch ? (
            <div className="mt-0.5 text-xs text-zinc-500">Branch / الفرع: {invoice.branch.code} — {invoice.branch.name}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Link className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50" href={`/app/invoices/${invoice.id}/preview`}>
            🖨 Preview
          </Link>
          {canEdit ? (
            <Link className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50" href={`/app/invoices/${invoice.id}/edit`}>
              ✏️ Edit
            </Link>
          ) : null}
          <Link className="text-sm underline text-zinc-700" href="/app/invoices">
            Back
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Status</div>
          <div className="mt-1 text-sm text-zinc-900">{invoice.status}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Total</div>
          <div className="mt-1 font-mono text-sm text-zinc-900">
            {fmt(invoice.total)} {invoice.currencyCode}
          </div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Total (base)</div>
          <div className="mt-1 font-mono text-sm text-zinc-900">
            {fmt(invoice.totalBase)} {invoice.baseCurrencyCode}
          </div>
        </div>
        {(hasPayments || hasCreditNotes) && (
          <>
            {hasPayments && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-xs text-emerald-600">Paid / المسدد</div>
                <div className="mt-1 font-mono text-sm text-emerald-800">{fmt(paidInCurrency)} {invoice.currencyCode}</div>
              </div>
            )}
            {hasCreditNotes && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <div className="text-xs text-rose-600">Credit Notes / مردودات</div>
                <div className="mt-1 font-mono text-sm text-rose-800">{fmt(creditedInCurrency)} {invoice.currencyCode}</div>
              </div>
            )}
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <div className="text-xs text-sky-600">Remaining / المتبقي</div>
              <div className="mt-1 font-mono text-sm font-bold text-sky-800">{fmt(remainingInCurrency)} {invoice.currencyCode}</div>
              {invoice.currencyCode !== invoice.baseCurrencyCode && (
                <div className="mt-0.5 font-mono text-xs text-sky-600">{fmt(remainingBase)} {invoice.baseCurrencyCode}</div>
              )}
            </div>
          </>
        )}
      </div>

      {Number(invoice.discountAmount) > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="text-xs text-amber-700">Discount / خصم</div>
          <div className="mt-1 font-mono text-amber-900">
            {invoice.discountType === "PERCENTAGE"
              ? `${fmt(invoice.discountValue)}% = ${fmt(invoice.discountAmount)} ${invoice.currencyCode}`
              : `${fmt(invoice.discountAmount)} ${invoice.currencyCode}`}
          </div>
        </div>
      ) : null}

      {invoice.exchangeRate ? (
        <div className="mt-3 rounded-xl border p-3 text-sm">
          <div className="text-xs text-zinc-500">Exchange rate</div>
          <div className="mt-1 font-mono text-zinc-900">
            1 {invoice.exchangeRate.baseCurrencyCode} = {String(invoice.exchangeRate.rate)} {invoice.exchangeRate.quoteCurrencyCode}
          </div>
        </div>
      ) : null}

      {invoice.journalEntryId ? (
        <div className="mt-3 rounded-xl border p-3 text-sm">
          <div className="text-xs text-zinc-500">Posted journal entry</div>
          <Link className="mt-1 inline-flex font-mono text-sm underline text-zinc-700" href={`/app/journal/${invoice.journalEntryId}`}>
            {invoice.journalEntryId}
          </Link>
        </div>
      ) : null}

      <div className="mt-4">
	        <InvoiceActions
	          invoiceId={invoice.id}
	          status={invoice.status}
	          hasJournalEntry={Boolean(invoice.journalEntryId)}
	          canSendPermission={canSend}
	          canDeletePermission={hasPermission(session, PERMISSIONS.INVOICE_WRITE)}
	          canReturnPermission={hasPermission(session, PERMISSIONS.CREDIT_NOTE_WRITE)}
	          customerEmail={invoice.customer?.email}
	          customerPhone={invoice.customer?.phone}
	          invoiceLines={invoice.lineItems.map((l) => ({
	            description: l.description,
	            quantity: String(l.quantity),
	            unitPrice: String(l.unitPrice),
	            taxRate: l.taxRate ? String(l.taxRate) : null,
	          }))}
	        />
      </div>

	    <div className="mt-4">
	      <InvoicePaymentsPanel
	        invoiceId={invoice.id}
	        invoiceStatus={invoice.status}
	        invoiceCurrencyCode={invoice.currencyCode}
	        baseCurrencyCode={invoice.baseCurrencyCode}
	        customerEmail={invoice.customer?.email}
	        customerPhone={invoice.customer?.phone}
	        canRead={canPaymentRead}
	        canWrite={canPaymentWrite}
	        payments={payments}
	      />
	    </div>

      {/* Credit Notes / المردودات */}
      {invoice.creditNotes.length > 0 && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-sm font-medium text-rose-900 mb-2">Credit Notes / إشعارات دائنة ({invoice.creditNotes.length})</div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-rose-700">
              <tr className="border-b border-rose-200"><th className="py-1 pr-3">CN #</th><th className="py-1 pr-3">Date</th><th className="py-1 pr-3">Total</th><th className="py-1 pr-3">Total (base)</th><th className="py-1 pr-3">Reason</th></tr>
            </thead>
            <tbody>
              {invoice.creditNotes.map((cn) => (
                <tr key={cn.id} className="border-b border-rose-100 last:border-b-0">
                  <td className="py-1 pr-3"><Link className="underline text-rose-700" href={`/app/credit-notes/${cn.id}`}>{cn.creditNoteNumber}</Link></td>
                  <td className="py-1 pr-3 text-zinc-700">{formatDate(cn.issueDate)}</td>
                  <td className="py-1 pr-3 font-mono text-zinc-900">{fmt(cn.total)} {cn.currencyCode}</td>
                  <td className="py-1 pr-3 font-mono text-zinc-900">{fmt(cn.totalBase)} {cn.baseCurrencyCode}</td>
                  <td className="py-1 pr-3 text-zinc-600">{cn.reason ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Description</th>
              <th className="py-2 pr-3">Qty</th>
              <th className="py-2 pr-3">Unit price</th>
              <th className="py-2 pr-3">Tax rate</th>
              <th className="py-2 pr-3">Line total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li) => (
              <tr key={li.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3 text-zinc-900">{li.description}</td>
                <td className="py-2 pr-3 font-mono text-zinc-700">{fmt(li.quantity)}</td>
                <td className="py-2 pr-3 font-mono text-zinc-700">{fmt(li.unitPrice)}</td>
                <td className="py-2 pr-3 font-mono text-zinc-700">{li.taxRate ? fmt(li.taxRate) : "-"}</td>
                <td className="py-2 pr-3 font-mono text-zinc-900">{fmt(li.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
