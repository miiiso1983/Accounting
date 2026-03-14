import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";

import { InstallmentSalesNewClient } from "./ui";

export default async function NewInstallmentContractPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { baseCurrencyCode: true } });
  if (!company) return <div className="rounded-2xl border bg-white p-5 text-sm">Company not found.</div>;

  const customers = await prisma.customer.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    take: 500,
    select: { id: true, name: true },
  });

  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  const t = createTranslator(messages);

  const labels = {
    title: t("reports.installmentSales.formTitle"),
    subtitle: t("reports.installmentSales.formSubtitle"),
    productName: t("reports.installmentSales.productName"),
    customerName: t("reports.installmentSales.customerName"),
    invoiceNumber: t("reports.installmentSales.invoiceNumber"),
    invoiceDate: t("reports.installmentSales.invoiceDate"),
    contractDuration: t("reports.installmentSales.contractDuration"),
    totalInvoiceAmount: t("reports.installmentSales.totalInvoiceAmount"),
    currency: t("reports.installmentSales.currency"),
    installmentFrequency: t("reports.installmentSales.installmentFrequency"),
    monthly: t("reports.installmentSales.monthly"),
    quarterly: t("reports.installmentSales.quarterly"),
    annually: t("reports.installmentSales.annually"),
    numberOfInstallments: t("reports.installmentSales.numberOfInstallments"),
    amountPerInstallment: t("reports.installmentSales.amountPerInstallment"),
    create: t("reports.installmentSales.create"),
    creating: t("reports.installmentSales.creating"),
    created: t("reports.installmentSales.created"),
    failedCreate: t("reports.installmentSales.failedCreate"),
    bulkTitle: t("reports.installmentSales.bulkTitle"),
    bulkSubtitle: t("reports.installmentSales.bulkSubtitle"),
    downloadTemplate: t("reports.installmentSales.downloadTemplate"),
    importing: t("reports.installmentSales.importing"),
    imported: t("reports.installmentSales.imported"),
    errorRows: t("reports.installmentSales.errorRows"),
    dropzone: t("reports.installmentSales.dropzone"),
    backToReport: t("reports.installmentSales.backToReport"),
  };

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Reports / التقارير</div>
          <div className="mt-1 text-base font-semibold text-zinc-900">{labels.title}</div>
          <div className="mt-1 text-xs text-zinc-500">{labels.subtitle}</div>
        </div>
        <Link
          href="/app/reports/installment-sales"
          className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          ← {labels.backToReport}
        </Link>
      </div>

      <div className="mt-4">
        <InstallmentSalesNewClient
          labels={labels}
          customers={customers}
          baseCurrencyCode={company.baseCurrencyCode}
        />
      </div>
    </div>
  );
}
