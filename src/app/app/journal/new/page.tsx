import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { JournalEntryForm } from "./ui";

export default async function NewJournalEntryPage() {
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

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Journal</div>
          <div className="mt-1 text-base font-medium text-zinc-900">New journal entry</div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/journal">
          Back to journal
        </Link>
      </div>

      <div className="mt-4">
		<JournalEntryForm accounts={accounts} costCenters={costCenters} baseCurrencyCode={company.baseCurrencyCode} />
      </div>
    </div>
  );
}
