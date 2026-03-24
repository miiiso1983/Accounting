import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { JournalEntryEditForm } from "./ui";

export default async function EditJournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.JOURNAL_WRITE)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { companyId: true },
  });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrencyCode: true },
  });
  if (!company) return <div className="rounded-2xl border bg-white p-5 text-sm">Company not found.</div>;

  const entry = await prisma.journalEntry.findFirst({
    where: { id, companyId },
    include: {
      lines: {
        orderBy: [{ dc: "asc" }],
        include: { account: { select: { code: true, name: true } } },
      },
    },
  });

  if (!entry) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;
	  if (entry.type !== "MANUAL") {
	    return <div className="rounded-2xl border bg-white p-5 text-sm">System journal entries can only be edited from the source document.</div>;
	  }
	  if (entry.status !== "DRAFT" && entry.status !== "POSTED") {
	    return <div className="rounded-2xl border bg-white p-5 text-sm">Only DRAFT or POSTED entries can be edited.</div>;
  }

  const accounts = await prisma.glAccount.findMany({
    where: { companyId, isPosting: true },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true },
  });

  const costCenters = await prisma.costCenter.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true },
  });

  const entryData = {
    id: entry.id,
    entryDate: entry.entryDate.toISOString().slice(0, 10),
    description: entry.description ?? "",
    currencyCode: (entry.currencyCode ?? entry.baseCurrencyCode) as "IQD" | "USD",
    lines: entry.lines.map((l) => ({
      accountId: l.accountId,
      costCenterId: l.costCenterId ?? "",
      debitAmount: l.dc === "DEBIT" ? String(l.amount) : "",
      creditAmount: l.dc === "CREDIT" ? String(l.amount) : "",
      description: l.description ?? "",
    })),
  };

	  return (
	    <div className="rounded-2xl border border-zinc-200 bg-white p-5 md:p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-4">
        <div>
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Journal / القيود</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">Edit journal entry / تعديل القيد</div>
        </div>
        <Link className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-50" href={`/app/journal/${id}`}>
          ← Back
        </Link>
      </div>

      <div className="mt-5">
        <JournalEntryEditForm
          entryId={id}
          initialData={entryData}
          accounts={accounts}
          costCenters={costCenters}
          baseCurrencyCode={company.baseCurrencyCode}
        />
      </div>
    </div>
  );
}

