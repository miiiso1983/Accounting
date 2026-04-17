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

export default async function CreditNotesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.CREDIT_NOTE_READ)) {
    return <div className="rounded-2xl border bg-white dark:bg-zinc-950 dark:border-zinc-700 p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const creditNotes = await prisma.creditNote.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    include: {
      invoice: { select: { id: true, invoiceNumber: true, customer: { select: { name: true } } } },
      branch: { select: { code: true, name: true } },
    },
    take: 200,
  });

  return (
    <div className="rounded-2xl border bg-white dark:bg-zinc-950 dark:border-zinc-700 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Sales</div>
          <div className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">Credit Notes / إشعارات دائنة</div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500 dark:text-zinc-400">
            <tr className="border-b dark:border-zinc-700">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">CN #</th>
              <th className="py-2 pr-3">Invoice</th>
              <th className="py-2 pr-3">Customer</th>
              <th className="py-2 pr-3">Branch</th>
              <th className="py-2 pr-3">Total</th>
              <th className="py-2 pr-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {creditNotes.map((cn) => (
              <tr key={cn.id} className="border-b dark:border-zinc-700 last:border-b-0">
                <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-300">{formatDate(cn.issueDate)}</td>
                <td className="py-2 pr-3"><Link className="underline text-zinc-700 dark:text-zinc-300" href={`/app/credit-notes/${cn.id}`}>{cn.creditNoteNumber}</Link></td>
                <td className="py-2 pr-3"><Link className="underline text-zinc-700 dark:text-zinc-300" href={`/app/invoices/${cn.invoice.id}`}>{cn.invoice.invoiceNumber}</Link></td>
                <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">{cn.invoice.customer.name}</td>
                <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-300">{cn.branch?.code ?? "-"}</td>
                <td className="py-2 pr-3 font-mono text-zinc-900 dark:text-zinc-100">{fmt(cn.total)} {cn.currencyCode}</td>
                <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">{cn.reason ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {creditNotes.length === 0 && <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">No credit notes found.</div>}
      </div>
    </div>
  );
}
