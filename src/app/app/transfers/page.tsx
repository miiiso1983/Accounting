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

export default async function TransfersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.JOURNAL_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const transfers = await prisma.journalEntry.findMany({
    where: { companyId, referenceType: "FUND_TRANSFER", status: "POSTED" },
    orderBy: { entryDate: "desc" },
    include: {
      lines: { include: { account: { select: { code: true, name: true } } } },
    },
    take: 200,
  });

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-medium text-zinc-900">Fund Transfers / التحويلات</h1>
          <p className="mt-1 text-xs text-zinc-500">Transfer funds between cash and bank accounts / تحويل الأموال بين حسابات النقد والبنك</p>
        </div>
        {hasPermission(session, PERMISSIONS.JOURNAL_WRITE) && (
          <Link
            href="/app/transfers/new"
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
          >
            + New Transfer / تحويل جديد
          </Link>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Date / التاريخ</th>
              <th className="py-2 pr-3">From / من</th>
              <th className="py-2 pr-3">To / إلى</th>
              <th className="py-2 pr-3">Amount / المبلغ</th>
              <th className="py-2 pr-3">Description / الوصف</th>
              <th className="py-2 pr-3">Journal / القيد</th>
            </tr>
          </thead>
          <tbody>
            {transfers.length === 0 ? (
              <tr>
                <td className="py-4 text-zinc-500" colSpan={6}>
                  No transfers recorded yet. / لا توجد تحويلات بعد.
                </td>
              </tr>
            ) : (
              transfers.map((t) => {
                const creditLine = t.lines.find((l) => l.dc === "CREDIT");
                const debitLine = t.lines.find((l) => l.dc === "DEBIT");
                const amount = debitLine ? Number(debitLine.amount) : 0;
                const currency = debitLine?.currencyCode ?? "IQD";
                return (
                  <tr key={t.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-mono text-zinc-700">
                      {t.entryDate.toISOString().slice(0, 10)}
                    </td>
                    <td className="py-2 pr-3 text-zinc-700">
                      {creditLine?.account ? `${creditLine.account.code} - ${creditLine.account.name}` : "-"}
                    </td>
                    <td className="py-2 pr-3 text-zinc-700">
                      {debitLine?.account ? `${debitLine.account.code} - ${debitLine.account.name}` : "-"}
                    </td>
                    <td className="py-2 pr-3 font-mono text-zinc-900">
                      {fmt(amount)} {currency}
                    </td>
                    <td className="py-2 pr-3 text-zinc-600 max-w-[200px] truncate">
                      {t.description || "-"}
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/app/journal/${t.id}`}
                        className="text-sm underline text-sky-700"
                      >
                        View / عرض
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

