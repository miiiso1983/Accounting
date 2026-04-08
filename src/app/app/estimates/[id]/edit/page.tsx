import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { getCachedBranches, getCachedCustomers, getCachedProducts, getCachedCostCenters } from "@/lib/db/cached-queries";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { EditEstimateForm } from "./ui";

type ProductOption = { id: string; name: string; description: string | null; unitPrice: string; currencyCode: string; costCenterId: string | null };

export default async function EditEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.ESTIMATE_WRITE)) return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { companyId: true, company: { select: { baseCurrencyCode: true } } },
  });
  if (!user?.companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company.</div>;
  const company = user.company!;

  const estimate = await prisma.estimate.findFirst({
    where: { id, companyId: user.companyId },
    include: { lineItems: true, exchangeRate: true },
  });
  if (!estimate) notFound();
  if (estimate.status !== "DRAFT") return <div className="rounded-2xl border bg-white p-5 text-sm">Only DRAFT estimates can be edited.</div>;

  const [customers, productsRaw, costCenters, branches] = await Promise.all([
    getCachedCustomers(user.companyId),
    getCachedProducts(user.companyId),
    getCachedCostCenters(user.companyId),
    getCachedBranches(user.companyId),
  ]);

  const products: ProductOption[] = productsRaw.map((p) => ({ ...p, unitPrice: String(p.unitPrice) }));

  const initialData = {
    estimateNumber: estimate.estimateNumber,
    customerId: estimate.customerId,
    branchId: estimate.branchId ?? "",
    issueDate: estimate.issueDate.toISOString().slice(0, 10),
    expiryDate: estimate.expiryDate ? estimate.expiryDate.toISOString().slice(0, 10) : "",
    currencyCode: estimate.currencyCode as "IQD" | "USD",
    exchangeRate: estimate.exchangeRate ? String(estimate.exchangeRate.rate) : "",
    discountType: (estimate.discountType ?? "") as "" | "PERCENTAGE" | "FIXED",
    discountValue: Number(estimate.discountValue) > 0 ? String(estimate.discountValue) : "",
    note: estimate.note ?? "",
    lines: estimate.lineItems.map((l) => ({
      description: l.description,
      costCenterId: l.costCenterId ?? "",
      productId: l.productId ?? "",
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      discountType: (l.discountType ?? "") as "" | "PERCENTAGE" | "FIXED",
      discountValue: Number(l.discountValue) > 0 ? String(l.discountValue) : "",
      taxRate: l.taxRate ? String(l.taxRate) : "",
    })),
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 md:p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-4">
        <div>
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Estimates / عروض الأسعار</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">Edit {estimate.estimateNumber}</div>
        </div>
        <Link className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-50" href={`/app/estimates/${id}`}>← Back</Link>
      </div>
      <div className="mt-5">
        <EditEstimateForm
          estimateId={id}
          customers={customers}
          products={products}
          costCenters={costCenters}
          branches={branches}
          baseCurrencyCode={company.baseCurrencyCode}
          initialData={initialData}
        />
      </div>
    </div>
  );
}
