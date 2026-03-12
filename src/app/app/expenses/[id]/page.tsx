import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function ExpenseDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.EXPENSE_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const expense = await prisma.expense.findFirst({
    where: { id, companyId },
    include: {
      exchangeRate: true,
      expenseAccount: { select: { code: true, name: true } },
      journalEntry: { select: { id: true } },
    },
  });

  if (!expense) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Expense</div>
          <div className="mt-1 text-base font-medium text-zinc-900">{expense.expenseNumber || expense.id}</div>
          <div className="mt-1 text-xs text-zinc-500">Vendor: {expense.vendorName || "-"}</div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/expenses">
          Back
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Status</div>
          <div className="mt-1 text-sm text-zinc-900">{expense.status}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Total</div>
          <div className="mt-1 font-mono text-sm text-zinc-900">
            {fmt(expense.total)} {expense.currencyCode}
          </div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Total (base)</div>
          <div className="mt-1 font-mono text-sm text-zinc-900">
            {fmt(expense.totalBase)} {expense.baseCurrencyCode}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border p-3 text-sm">
          <div className="text-xs text-zinc-500">Expense date</div>
          <div className="mt-1 text-zinc-900">{expense.expenseDate.toISOString().slice(0, 10)}</div>
        </div>
        <div className="rounded-xl border p-3 text-sm">
          <div className="text-xs text-zinc-500">Category</div>
          <div className="mt-1 text-zinc-900">
            {expense.expenseAccount ? `${expense.expenseAccount.code} · ${expense.expenseAccount.name}` : "-"}
          </div>
        </div>
      </div>

      {expense.description ? (
        <div className="mt-3 rounded-xl border p-3 text-sm">
          <div className="text-xs text-zinc-500">Description</div>
          <div className="mt-1 text-zinc-900">{expense.description}</div>
        </div>
      ) : null}

      {expense.exchangeRate ? (
        <div className="mt-3 rounded-xl border p-3 text-sm">
          <div className="text-xs text-zinc-500">Exchange rate</div>
          <div className="mt-1 font-mono text-zinc-900">
            1 {expense.exchangeRate.baseCurrencyCode} = {String(expense.exchangeRate.rate)} {expense.exchangeRate.quoteCurrencyCode}
          </div>
        </div>
      ) : null}

      {expense.journalEntryId ? (
        <div className="mt-3 rounded-xl border p-3 text-sm">
          <div className="text-xs text-zinc-500">Posted journal entry</div>
          <Link className="mt-1 inline-flex font-mono text-sm underline text-zinc-700" href={`/app/journal/${expense.journalEntryId}`}>
            {expense.journalEntryId}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
