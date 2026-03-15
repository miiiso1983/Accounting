import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { JournalExportButtons } from "../export-buttons";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtEntryNumber(n: number) {
  return `JE-${String(n).padStart(3, "0")}`;
}

export default async function JournalEntryDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.JOURNAL_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const entry = await prisma.journalEntry.findFirst({
    where: { id, companyId },
    include: {
      exchangeRate: true,
      lines: {
        orderBy: [{ dc: "asc" }],
        include: { account: { select: { code: true, name: true } } },
      },
    },
  });

  if (!entry) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;

  const totals = entry.lines.reduce(
    (acc, l) => {
      const v = l.amountBase;
      if (l.dc === "DEBIT") acc.debit += Number(v);
      else acc.credit += Number(v);
      return acc;
    },
    { debit: 0, credit: 0 },
  );

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Journal entry</div>
          <div className="mt-1 text-base font-medium text-zinc-900">
            {entry.entryNumber ? fmtEntryNumber(entry.entryNumber) : entry.id.slice(0, 8)}
            {entry.description ? ` — ${entry.description}` : ""}
          </div>
          <div className="mt-1 text-xs text-zinc-500">ID: {entry.id}</div>
        </div>
        <div className="flex items-center gap-2">
          <JournalExportButtons excelHref={`/api/journal-entries/${entry.id}/export`} />
	          {(entry.status === "DRAFT" || entry.status === "POSTED") && hasPermission(session, PERMISSIONS.JOURNAL_WRITE) ? (
            <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800" href={`/app/journal/${entry.id}/edit`}>
              Edit
            </Link>
          ) : null}
          <Link className="text-sm underline text-zinc-700" href="/app/journal">
            Back
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Date</div>
          <div className="text-sm font-medium text-zinc-900">{entry.entryDate.toISOString().slice(0, 10)}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Status</div>
          <div className="text-sm font-medium text-zinc-900">{entry.status}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Currency</div>
          <div className="text-sm font-medium text-zinc-900">
            {entry.currencyCode ?? entry.baseCurrencyCode} (base: {entry.baseCurrencyCode})
          </div>
        </div>
      </div>

      {entry.exchangeRate ? (
        <div className="mt-3 rounded-xl border p-3 text-sm">
          <div className="text-xs text-zinc-500">Exchange rate</div>
          <div className="mt-1 font-mono text-zinc-900">
            1 {entry.exchangeRate.baseCurrencyCode} = {String(entry.exchangeRate.rate)} {entry.exchangeRate.quoteCurrencyCode}
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Account</th>
              <th className="py-2 pr-3">Currency</th>
              <th className="py-2 pr-3">Debit</th>
              <th className="py-2 pr-3">Credit</th>
              <th className="py-2 pr-3">Debit (base)</th>
              <th className="py-2 pr-3">Credit (base)</th>
              <th className="py-2 pr-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((l) => (
              <tr key={l.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3 text-zinc-900">
                  <div className="font-mono text-zinc-500">{l.account.code}</div>
                  <div>{l.account.name}</div>
                </td>
                <td className="py-2 pr-3 text-zinc-700">{l.currencyCode}</td>
                <td className="py-2 pr-3 font-mono text-zinc-900">{l.dc === "DEBIT" ? fmt(l.amount) : ""}</td>
                <td className="py-2 pr-3 font-mono text-zinc-900">{l.dc === "CREDIT" ? fmt(l.amount) : ""}</td>
                <td className="py-2 pr-3 font-mono text-zinc-900">{l.dc === "DEBIT" ? fmt(l.amountBase) : ""}</td>
                <td className="py-2 pr-3 font-mono text-zinc-900">{l.dc === "CREDIT" ? fmt(l.amountBase) : ""}</td>
                <td className="py-2 pr-3 text-zinc-700">{l.description ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Total debit (base)</div>
          <div className="font-mono text-sm text-zinc-900">{fmt(totals.debit)}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Total credit (base)</div>
          <div className="font-mono text-sm text-zinc-900">{fmt(totals.credit)}</div>
        </div>
      </div>
    </div>
  );
}
