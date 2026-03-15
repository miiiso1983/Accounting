import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { InvoiceForm } from "./ui";

type ProductOption = { id: string; name: string; description: string | null; unitPrice: string; currencyCode: string; costCenterId: string | null };
type CostCenterOption = { id: string; code: string; name: string };
type SalesRepOption = { id: string; name: string };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const defaultCustomerId = typeof sp.customerId === "string" ? sp.customerId : undefined;
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
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;
  const company = user.company;
  if (!company) return <div className="rounded-2xl border bg-white p-5 text-sm">Company not found.</div>;

  const [customers, productsRaw, costCenters, salesReps] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, companyName: true },
      take: 500,
    }),
    prisma.product.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, description: true, unitPrice: true, currencyCode: true, costCenterId: true },
      take: 500,
    }),
    prisma.costCenter.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true },
      take: 500,
    }),
    prisma.salesRepresentative.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true },
      take: 500,
    }),
  ]);

  const products: ProductOption[] = productsRaw.map((p) => ({
    ...p,
    unitPrice: String(p.unitPrice),
  }));

  const costCenterOptions: CostCenterOption[] = costCenters;
  const salesRepOptions: SalesRepOption[] = salesReps;

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Invoices</div>
          <div className="mt-1 text-base font-medium text-zinc-900">New invoice</div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/invoices">
          Back
        </Link>
      </div>

      <div className="mt-4">
        <InvoiceForm
          customers={customers}
          products={products}
          costCenters={costCenterOptions}
          salesReps={salesRepOptions}
          baseCurrencyCode={company.baseCurrencyCode}
          defaultCustomerId={defaultCustomerId}
        />
        {customers.length === 0 ? (
          <div className="mt-3 text-sm text-zinc-600">
            You have no customers yet. <Link className="underline" href="/app/customers/new">Create a customer</Link> first.
          </div>
        ) : null}
      </div>
    </div>
  );
}
