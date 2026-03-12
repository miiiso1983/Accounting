import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { ExpenseForm } from "./ui";

type AccountOption = { id: string; code: string; name: string };

export default async function NewExpensePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.EXPENSE_WRITE)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { baseCurrencyCode: true } });
  if (!company) return <div className="rounded-2xl border bg-white p-5 text-sm">Company not found.</div>;

  const [expenseAccounts, paymentAccounts] = await Promise.all([
    prisma.glAccount.findMany({
      where: { companyId, type: "EXPENSE", isPosting: true },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true },
      take: 500,
    }),
    prisma.glAccount.findMany({
      where: {
        companyId,
        isPosting: true,
        code: { in: ["1110", "1111", "1120", "1121", "2100"] },
      },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true },
      take: 20,
    }),
  ]);

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Expenses</div>
          <div className="mt-1 text-base font-medium text-zinc-900">New expense</div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/expenses">
          Back
        </Link>
      </div>

      <div className="mt-4">
        <ExpenseForm
          expenseAccounts={expenseAccounts as AccountOption[]}
          paymentAccounts={paymentAccounts as AccountOption[]}
          baseCurrencyCode={company.baseCurrencyCode}
        />

        {expenseAccounts.length === 0 ? (
          <div className="mt-3 text-sm text-zinc-600">You have no expense accounts yet. Seed the Chart of Accounts first.</div>
        ) : null}
      </div>
    </div>
  );
}
