import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { getCachedCustomers, getCachedProducts, getCachedCostCenters, getCachedSalesReps, getCachedBranches } from "@/lib/db/cached-queries";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { InvoiceEditForm } from "./ui";

type ProductOption = { id: string; name: string; description: string | null; unitPrice: string; currencyCode: string; costCenterId: string | null };
type CostCenterOption = { id: string; code: string; name: string };
type SalesRepOption = { id: string; name: string };
type BranchOption = { id: string; code: string; name: string; isActive?: boolean };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId },
    include: { customer: true, exchangeRate: true, lineItems: true },
  });

  if (!invoice) return <div className="rounded-2xl border bg-white p-5 text-sm">Invoice not found.</div>;
  if (invoice.status !== "DRAFT" && invoice.status !== "SENT") {
    return (
      <div className="rounded-2xl border bg-white p-5 text-sm">
        Only DRAFT or SENT invoices can be edited. PAID/CANCELLED invoices require other actions.{" "}
        <Link className="underline text-zinc-700" href={`/app/invoices/${id}`}>Back to invoice</Link>
      </div>
    );
  }

  const [customers, productsRaw, costCenters, salesReps, branchesActive] = await Promise.all([
    getCachedCustomers(companyId),
    getCachedProducts(companyId),
    getCachedCostCenters(companyId),
    getCachedSalesReps(companyId),
    getCachedBranches(companyId),
  ]);

  // Build branch options; include the invoice's current branch even if inactive
  const branches: BranchOption[] = branchesActive.map((b) => ({ ...b, isActive: true }));
  if (invoice.branchId && !branches.some((b) => b.id === invoice.branchId)) {
    const inactiveBranch = await prisma.branch.findFirst({ where: { id: invoice.branchId, companyId }, select: { id: true, code: true, name: true, isActive: true } });
    if (inactiveBranch) branches.push(inactiveBranch);
  }
  branches.sort((a, b) => a.code.localeCompare(b.code));

  const products: ProductOption[] = productsRaw.map((p) => ({
    ...p,
    unitPrice: String(p.unitPrice),
  }));

  const costCenterOptions: CostCenterOption[] = costCenters;
  const salesRepOptions: SalesRepOption[] = salesReps;

  const invoiceData = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    branchId: invoice.branchId ?? "",
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "",
    currencyCode: invoice.currencyCode as "IQD" | "USD",
    exchangeRate: invoice.exchangeRate ? String(invoice.exchangeRate.rate) : "",
    discountType: invoice.discountType ?? "",
    discountValue: invoice.discountValue ? String(invoice.discountValue) : "",
    paymentTerms: invoice.paymentTerms ?? "",
    salesRepresentativeId: invoice.salesRepresentativeId ?? "",
    lines: invoice.lineItems.map((li) => ({
      description: li.description,
      costCenterId: li.costCenterId ?? "",
      quantity: String(li.quantity),
      unitPrice: String(li.unitPrice),
      discountType: li.discountType ?? "",
      discountValue: li.discountValue ? String(li.discountValue) : "",
      taxRate: li.taxRate ? String(li.taxRate) : "",
    })),
  };

	  return (
	    <div className="rounded-2xl border border-zinc-200 bg-white p-5 md:p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-4">
        <div>
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Invoices / الفواتير</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">Edit invoice / تعديل — {invoice.invoiceNumber}</div>
        </div>
        <Link className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-50" href={`/app/invoices/${id}`}>
          ← Back
        </Link>
      </div>

      <div className="mt-5">
        <InvoiceEditForm
          invoiceId={id}
          initialData={invoiceData}
          customers={customers}
          products={products}
          costCenters={costCenterOptions}
          salesReps={salesRepOptions}
          branches={branches}
          baseCurrencyCode={company.baseCurrencyCode}
        />
      </div>
    </div>
  );
}

