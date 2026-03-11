import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { InvoiceActions } from "./ui";

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
      customer: true,
      exchangeRate: true,
      lineItems: true,
      journalEntry: { select: { id: true } },
    },
  });

  if (!invoice) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;
	  const canSend = hasPermission(session, PERMISSIONS.INVOICE_SEND);

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Invoice</div>
          <div className="mt-1 text-base font-medium text-zinc-900">{invoice.invoiceNumber}</div>
          <div className="mt-1 text-xs text-zinc-500">Customer: {invoice.customer.name}</div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/invoices">
          Back
        </Link>
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
