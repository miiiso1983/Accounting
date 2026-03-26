import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { buildPublicReceiptUrl } from "@/lib/payments/public-link";
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
      journalEntry: { select: { id: true } },
      salesRepresentative: { select: { id: true, name: true } },
      branch: { select: { id: true, code: true, name: true } },
    },
  });

  if (!invoice) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;
		  const canSend = hasPermission(session, PERMISSIONS.INVOICE_SEND);
		  const canEdit = hasPermission(session, PERMISSIONS.INVOICE_WRITE) && invoice.status === "DRAFT";
		  const canPaymentRead = hasPermission(session, PERMISSIONS.INVOICE_PAYMENT_READ);
		  const canPaymentWrite = hasPermission(session, PERMISSIONS.INVOICE_PAYMENT_WRITE);

		  const payments = invoice.payments.map((p) => ({
		    id: p.id,
		    paymentDate: p.paymentDate.toISOString().slice(0, 10),
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
	          customerEmail={invoice.customer?.email}
	          customerPhone={invoice.customer?.phone}
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
