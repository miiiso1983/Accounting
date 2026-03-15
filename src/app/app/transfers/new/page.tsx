import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { TransferForm } from "./ui";

const TRANSFER_ACCOUNT_CODES = ["1110", "1111", "1120", "1121"];

export default async function NewTransferPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.JOURNAL_WRITE)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrencyCode: true },
  });
  if (!company) return <div className="rounded-2xl border bg-white p-5 text-sm">Company not found.</div>;

  const accounts = await prisma.glAccount.findMany({
    where: { companyId, code: { in: TRANSFER_ACCOUNT_CODES }, isPosting: true },
    select: { id: true, code: true, name: true, currencyCode: true },
    orderBy: { code: "asc" },
  });

  return (
    <div className="rounded-2xl border bg-white p-5">
      <TransferForm
        accounts={accounts.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          currencyCode: a.currencyCode,
        }))}
        baseCurrencyCode={company.baseCurrencyCode}
      />
    </div>
  );
}

