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

export default async function JournalIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.JOURNAL_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const entries = await prisma.journalEntry.findMany({
    where: { companyId },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    include: { lines: true },
    take: 50,
  });

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Journal</div>
          <div className="mt-1 text-base font-medium text-zinc-900">Journal Entries</div>
        </div>
        <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800" href="/app/journal/new">
          New entry
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Description</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Debit (base)</th>
              <th className="py-2 pr-3">Credit (base)</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const totals = e.lines.reduce(
                (acc, l) => {
                  const v = l.amountBase;
                  if (l.dc === "DEBIT") acc.debit += Number(v);
                  else acc.credit += Number(v);
                  return acc;
                },
                { debit: 0, credit: 0 },
              );

              return (
                <tr key={e.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-3 text-zinc-700">
                    <Link className="underline" href={`/app/journal/${e.id}`}>
                      {e.entryDate.toISOString().slice(0, 10)}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-zinc-900">{e.description ?? "-"}</td>
                  <td className="py-2 pr-3 text-zinc-700">{e.status}</td>
                  <td className="py-2 pr-3 font-mono text-zinc-900">{fmt(totals.debit)}</td>
                  <td className="py-2 pr-3 font-mono text-zinc-900">{fmt(totals.credit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {entries.length === 0 ? <div className="mt-4 text-sm text-zinc-600">No journal entries yet.</div> : null}
      </div>
    </div>
  );
}
