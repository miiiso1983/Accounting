import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";

export default async function ReportsIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  const t = createTranslator(messages);

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="text-sm text-zinc-500">{t("reports.title")}</div>
      <div className="mt-1 text-base font-medium text-zinc-900">{t("reports.title")}</div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/app/reports/trial-balance"
          className="rounded-2xl border border-sky-200/60 bg-white px-4 py-4 text-sm shadow-sm transition hover:bg-sky-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          <div className="font-medium text-zinc-900">{t("reports.trialBalance.title")}</div>
          <div className="mt-1 text-xs text-zinc-500">{t("reports.columns.debitBase")} / {t("reports.columns.creditBase")}</div>
        </Link>

        <Link
          href="/app/reports/general-ledger"
          className="rounded-2xl border border-sky-200/60 bg-white px-4 py-4 text-sm shadow-sm transition hover:bg-sky-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          <div className="font-medium text-zinc-900">{t("reports.generalLedger.title")}</div>
          <div className="mt-1 text-xs text-zinc-500">{t("reports.filters.account")} + {t("reports.filters.from")} / {t("reports.filters.to")}</div>
        </Link>

        <Link
          href="/app/reports/profit-loss"
          className="rounded-2xl border border-emerald-200/60 bg-white px-4 py-4 text-sm shadow-sm transition hover:bg-emerald-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          <div className="font-medium text-zinc-900">Profit & Loss / قائمة الأرباح والخسائر</div>
          <div className="mt-1 text-xs text-zinc-500">Revenue vs Expenses by month / الإيرادات مقابل المصروفات شهرياً</div>
        </Link>

        <Link
          href="/app/reports/income-statement"
          className="rounded-2xl border border-emerald-200/60 bg-white px-4 py-4 text-sm shadow-sm transition hover:bg-emerald-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          <div className="font-medium text-zinc-900">Income Statement / قائمة الدخل</div>
          <div className="mt-1 text-xs text-zinc-500">Revenues, expenses, and net profit / الإيرادات والمصروفات وصافي الربح</div>
        </Link>

        <Link
          href="/app/reports/balance-sheet"
          className="rounded-2xl border border-purple-200/60 bg-white px-4 py-4 text-sm shadow-sm transition hover:bg-purple-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          <div className="font-medium text-zinc-900">Balance Sheet / الميزانية العمومية</div>
          <div className="mt-1 text-xs text-zinc-500">Assets = Liabilities + Equity / الأصول = الالتزامات + حقوق الملكية</div>
        </Link>

        <Link
          href="/app/reports/cash-flow"
          className="rounded-2xl border border-sky-200/60 bg-white px-4 py-4 text-sm shadow-sm transition hover:bg-sky-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          <div className="font-medium text-zinc-900">Cash Flow Statement / قائمة التدفقات النقدية</div>
          <div className="mt-1 text-xs text-zinc-500">Operating / Investing / Financing / تشغيلية / استثمارية / تمويلية</div>
        </Link>

        <Link
          href="/app/reports/ar-aging"
          className="rounded-2xl border border-orange-200/60 bg-white px-4 py-4 text-sm shadow-sm transition hover:bg-orange-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          <div className="font-medium text-zinc-900">AR Aging Summary / تقادم الذمم المدينة</div>
          <div className="mt-1 text-xs text-zinc-500">Outstanding invoices by age / الفواتير المستحقة حسب العمر</div>
        </Link>

        <Link
          href="/app/reports/collections"
          className="rounded-2xl border border-sky-200/60 bg-white px-4 py-4 text-sm shadow-sm transition hover:bg-sky-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          <div className="font-medium text-zinc-900">Collection Report / تقرير التحصيل</div>
          <div className="mt-1 text-xs text-zinc-500">Paid invoices & collection period / الفواتير المحصّلة ومدة التحصيل</div>
        </Link>

        <Link
          href="/app/reports/invoices"
          className="rounded-2xl border border-sky-200/60 bg-white px-4 py-4 text-sm shadow-sm transition hover:bg-sky-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          <div className="font-medium text-zinc-900">Invoices Report / تقرير الفواتير</div>
          <div className="mt-1 text-xs text-zinc-500">Totals, paid, remaining by customer & cost center / الإجماليات والمسدد والمتبقي</div>
        </Link>

        <Link
          href="/app/reports/installment-sales"
          className="rounded-2xl border border-indigo-200/60 bg-white px-4 py-4 text-sm shadow-sm transition hover:bg-indigo-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          <div className="font-medium text-zinc-900">Installment Sales / مبيعات التقسيط</div>
          <div className="mt-1 text-xs text-zinc-500">Contracts, monthly sales, and due installments / العقود والمبيعات الشهرية والأقساط المستحقة</div>
        </Link>
      </div>
    </div>
  );
}
