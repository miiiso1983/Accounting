import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { formatJournalEntryNumber, getJournalEntryTypeLabel, getJournalSourceLabel } from "@/lib/accounting/journal/utils";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { JournalExportButtons } from "./export-buttons";
import { JournalListFilters } from "./filters";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function JournalIndexPage({
	searchParams,
}: {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
	const sp = (await searchParams) ?? {};
	const q = typeof sp.q === "string" ? sp.q.trim() : "";
	const referenceTypeParam = typeof sp.referenceType === "string" ? sp.referenceType.trim() : "";
	const from = typeof sp.from === "string" ? sp.from.trim() : "";
	const to = typeof sp.to === "string" ? sp.to.trim() : "";
	const accountCode = typeof sp.accountCode === "string" ? sp.accountCode.trim() : "";

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.JOURNAL_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

	const [refTypeRows, entries] = await Promise.all([
		prisma.journalEntry.findMany({
			where: { companyId },
			distinct: ["referenceType"],
			select: { referenceType: true },
		}),
		prisma.journalEntry.findMany({
			where: {
				companyId,
				...(q
					? {
						OR: [
							{ description: { contains: q, mode: "insensitive" } },
							{ referenceId: { contains: q, mode: "insensitive" } },
						],
					}
					: {}),
				...(referenceTypeParam
					? referenceTypeParam === "MANUAL"
						? { referenceType: null }
						: { referenceType: referenceTypeParam }
					: {}),
				...((from || to)
					? {
						entryDate: {
							...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
							...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
						},
					}
					: {}),
				...(accountCode
					? {
						lines: {
							some: {
								account: {
									code: { contains: accountCode, mode: "insensitive" as const },
								},
							},
						},
					}
					: {}),
			},
			orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
			include: {
				branch: { select: { code: true, name: true } },
				lines: {
					include: { costCenter: { select: { code: true, name: true } } },
				},
			},
			take: 50,
		}),
	]);

	const refTypeOptions = Array.from(
		new Set(refTypeRows.map((r) => (r.referenceType === null ? "MANUAL" : r.referenceType)).filter(Boolean)),
	).sort();

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Journal</div>
          <div className="mt-1 text-base font-medium text-zinc-900">Journal Entries</div>
        </div>
        <div className="flex items-center gap-2">
          <JournalExportButtons
            excelHref={`/api/journal-entries/export?${new URLSearchParams({ ...(q ? { q } : {}), ...(referenceTypeParam ? { referenceType: referenceTypeParam } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(accountCode ? { accountCode } : {}) }).toString()}`}
          />
          <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800" href="/app/journal/new">
	            New manual entry
          </Link>
        </div>
      </div>

			<div className="mt-4">
				<JournalListFilters
					initial={{ q, referenceType: referenceTypeParam, from, to, accountCode }}
					referenceTypeOptions={refTypeOptions}
				/>
			</div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Entry #</th>
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Description</th>
						<th className="py-2 pr-3">Source</th>
							<th className="py-2 pr-3">Cost Center</th>
								<th className="py-2 pr-3">Branch / الفرع</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Debit (base)</th>
              <th className="py-2 pr-3">Credit (base)</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
							const entryLabel = formatJournalEntryNumber(e.entryNumber, e.type, e.id);
							const refLabel = getJournalSourceLabel(e.referenceType);
							const refId = e.referenceId ?? "";

							const costCenterCodes = Array.from(
								new Set(e.lines.map((l) => l.costCenter?.code).filter(Boolean)),
							).join(", ");

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
                  <td className="py-2 pr-3 font-mono text-zinc-700">
                    <Link className="underline" href={`/app/journal/${e.id}`}>
	                      {entryLabel}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-zinc-700">
                    {e.entryDate.toISOString().slice(0, 10)}
                  </td>
	                  <td className="py-2 pr-3 text-zinc-700">
	                    <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
	                      {getJournalEntryTypeLabel(e.type)}
	                    </span>
	                  </td>
                  <td className="py-2 pr-3 text-zinc-900">{e.description ?? "-"}</td>
										<td className="py-2 pr-3 text-zinc-700">
											<div className="text-xs font-medium text-zinc-900">{refLabel}</div>
											<div className="font-mono text-xs text-zinc-600">{refId || "-"}</div>
										</td>
										<td className="py-2 pr-3 text-zinc-700">{costCenterCodes || "-"}</td>
										<td className="py-2 pr-3 text-zinc-700">{e.branch ? `${e.branch.code}` : "-"}</td>
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
