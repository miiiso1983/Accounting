import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { getCachedCostCenters, getCachedGlAccounts } from "@/lib/db/cached-queries";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { ProductForm } from "./ui";

type CostCenterOption = { id: string; code: string; name: string };

export default async function NewProductPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { companyId: true, company: { select: { baseCurrencyCode: true } } },
  });
  const companyId = user?.companyId;
  const company = user?.company;
  if (!companyId || !company) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const [costCenters, revenueAccounts] = await Promise.all([
    getCachedCostCenters(companyId),
    getCachedGlAccounts(companyId, "INCOME"),
  ]);

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Products / المنتجات</div>
          <div className="mt-1 text-base font-medium text-zinc-900">New Product / منتج جديد</div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/products">
          Back / رجوع
        </Link>
      </div>

      <div className="mt-4">
        <ProductForm baseCurrencyCode={company.baseCurrencyCode} costCenters={costCenters} revenueAccounts={revenueAccounts} />
      </div>
    </div>
  );
}

