import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { InvoiceListActions } from "./InvoiceListActions";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function InvoicesIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const invoices = await prisma.invoice.findMany({
    where: { companyId },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    include: { customer: { select: { name: true } } },
    take: 50,
  });
  const canWrite = hasPermission(session, PERMISSIONS.INVOICE_WRITE);

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Sales</div>
          <div className="mt-1 text-base font-medium text-zinc-900">Invoices</div>
        </div>
        <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800" href="/app/invoices/new">
          New invoice
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Invoice #</th>
              <th className="py-2 pr-3">Customer</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Total (base)</th>
              <th className="py-2 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3 text-zinc-700">{inv.issueDate.toISOString().slice(0, 10)}</td>
                <td className="py-2 pr-3">
                  <Link className="underline text-zinc-700" href={`/app/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
                </td>
                <td className="py-2 pr-3 text-zinc-900">{inv.customer.name}</td>
                <td className="py-2 pr-3 text-zinc-700">{inv.status}</td>
                <td className="py-2 pr-3 font-mono text-zinc-900">{fmt(inv.totalBase)}</td>
                <td className="py-2 pr-3">
                  <InvoiceListActions invoiceId={inv.id} status={inv.status} canWrite={canWrite} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {invoices.length === 0 ? <div className="mt-4 text-sm text-zinc-600">No invoices yet.</div> : null}
      </div>
    </div>
  );
}
