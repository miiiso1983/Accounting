import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { ExportButtons } from "@/components/reports/ExportButtons";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function ExpensesIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.EXPENSE_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const expenses = await prisma.expense.findMany({
    where: { companyId },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    include: { expenseAccount: { select: { code: true, name: true } } },
    take: 50,
  });

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Purchases / المشتريات</div>
          <div className="mt-1 text-base font-medium text-zinc-900">Expenses / المصاريف</div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons excelHref="/api/reports/expenses/export" labels={{ excel: "Export Excel", print: "Print / طباعة" }} />
          <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800" href="/app/expenses/new">
            + New expense / مصروف جديد
          </Link>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Date / التاريخ</th>
              <th className="py-2 pr-3">Expense # / رقم المصروف</th>
              <th className="py-2 pr-3">Vendor / المورد</th>
              <th className="py-2 pr-3">Category / التصنيف</th>
              <th className="py-2 pr-3">Status / الحالة</th>
              <th className="py-2 pr-3 text-right">Total (base) / المجموع</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3 text-zinc-700">{e.expenseDate.toISOString().slice(0, 10)}</td>
                <td className="py-2 pr-3">
                  <Link className="underline text-zinc-700" href={`/app/expenses/${e.id}`}>
                    {e.expenseNumber || e.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-zinc-900">{e.vendorName || "-"}</td>
                <td className="py-2 pr-3 text-zinc-700">
                  {e.expenseAccount ? `${e.expenseAccount.code} · ${e.expenseAccount.name}` : "-"}
                </td>
                <td className="py-2 pr-3 text-zinc-700">{e.status}</td>
                <td className="py-2 pr-3 font-mono text-zinc-900">
                  {fmt(e.totalBase)} {e.baseCurrencyCode}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {expenses.length === 0 ? <div className="mt-4 text-sm text-zinc-600">No expenses yet.</div> : null}
      </div>
    </div>
  );
}
