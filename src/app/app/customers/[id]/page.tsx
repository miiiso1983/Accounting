import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

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

export default async function CustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const customer = await prisma.customer.findFirst({
    where: { id, companyId },
    include: {
      invoices: {
        orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
        take: 20,
        include: {
          payments: { select: { amountBase: true, amount: true } },
          creditNotes: { select: { totalBase: true, total: true } },
        },
      },
    },
  });

  if (!customer) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;
  const canWrite = hasPermission(session, PERMISSIONS.INVOICE_WRITE);

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Customer</div>
          <div className="mt-1 text-base font-medium text-zinc-900">{customer.name}</div>
          {customer.companyName ? <div className="mt-1 text-sm text-zinc-600">{customer.companyName}</div> : null}
          <div className="mt-1 text-xs text-zinc-500">{customer.email ?? ""}</div>
        </div>
        <div className="flex items-center gap-3">
          {canWrite ? (
            <Link className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50" href={`/app/customers/${customer.id}/edit`}>
              Edit customer
            </Link>
          ) : null}
          <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800" href={`/app/invoices/new?customerId=${customer.id}`}>
            New invoice
          </Link>
          <Link className="text-sm underline text-zinc-700" href="/app/customers">
            Back
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border p-3 text-sm">
          <div className="text-xs text-zinc-500">Company name</div>
          <div className="mt-1 text-zinc-900">{customer.companyName ?? "-"}</div>
        </div>
        <div className="rounded-xl border p-3 text-sm">
          <div className="text-xs text-zinc-500">Phone</div>
          <div className="mt-1 text-zinc-900">{customer.phone ?? "-"}</div>
        </div>
        <div className="rounded-xl border p-3 text-sm">
          <div className="text-xs text-zinc-500">City / Country</div>
          <div className="mt-1 text-zinc-900">
            {customer.city ?? "-"} / {customer.country ?? "-"}
          </div>
        </div>
        <div className="rounded-xl border p-3 text-sm md:col-span-2">
          <div className="text-xs text-zinc-500">Address</div>
          <div className="mt-1 text-zinc-900">
            {[customer.address1, customer.address2].filter(Boolean).join(" — ") || "-"}
          </div>
        </div>
      </div>

      {/* Outstanding balance summary */}
      {(() => {
        const outstandingInvoices = customer.invoices.filter((inv) => inv.status === "SENT" || inv.status === "OVERDUE");
        const totalOutstanding = outstandingInvoices.reduce((s, inv) => {
          const paid = inv.payments.reduce((ps, p) => ps + Number(p.amountBase), 0);
          const credited = inv.creditNotes.reduce((cs, cn) => cs + Number(cn.totalBase), 0);
          return s + Math.max(0, Number(inv.totalBase) - paid - credited);
        }, 0);
        return totalOutstanding > 0 ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm font-medium text-amber-900">Outstanding Balance / الرصيد المستحق</div>
            <div className="mt-1 font-mono text-lg font-bold text-amber-800">{fmt(totalOutstanding)} {customer.invoices[0]?.baseCurrencyCode ?? ""}</div>
            <div className="mt-1 text-xs text-amber-600">{outstandingInvoices.length} outstanding invoice(s)</div>
          </div>
        ) : null;
      })()}

      <div className="mt-6">
        <div className="text-sm font-medium text-zinc-900">Recent invoices / الفواتير الأخيرة</div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr className="border-b">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Invoice #</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">Paid / مسدد</th>
                <th className="py-2 pr-3">Returns / مردود</th>
                <th className="py-2 pr-3">Remaining / متبقي</th>
              </tr>
            </thead>
            <tbody>
              {customer.invoices.map((inv) => {
                const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
                const credited = inv.creditNotes.reduce((s, cn) => s + Number(cn.total), 0);
                const remaining = Math.max(0, Number(inv.total) - paid - credited);
                return (
                  <tr key={inv.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 text-zinc-700">{formatDate(inv.issueDate)}</td>
                    <td className="py-2 pr-3">
                      <Link className="underline text-zinc-700" href={`/app/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
                    </td>
                    <td className="py-2 pr-3 text-zinc-700">{inv.status}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-900">{fmt(inv.total)} {inv.currencyCode}</td>
                    <td className="py-2 pr-3 font-mono text-emerald-700">{paid > 0 ? fmt(paid) : "-"}</td>
                    <td className="py-2 pr-3 font-mono text-rose-700">{credited > 0 ? fmt(credited) : "-"}</td>
                    <td className="py-2 pr-3 font-mono font-medium text-zinc-900">{fmt(remaining)} {inv.currencyCode}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {customer.invoices.length === 0 ? <div className="mt-3 text-sm text-zinc-600">No invoices for this customer yet.</div> : null}
        </div>
      </div>
    </div>
  );
}
