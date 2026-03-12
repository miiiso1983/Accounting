import Link from "next/link";

import { ArrowUpRight, BookOpen, FileText, NotebookPen, Users } from "lucide-react";

import { getMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";

import { TrendChartCard } from "./TrendChartCard";

export default async function DashboardPage() {
  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  const t = createTranslator(messages);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl">{t("dashboardPage.title")}</h1>
          <p className="mt-1 text-sm text-zinc-600">{t("dashboardPage.subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <KpiCard
          title={t("dashboardPage.kpis.statusTitle")}
          value={t("dashboardPage.kpis.statusValue")}
          desc={t("dashboardPage.kpis.statusDesc")}
        />
        <KpiCard
          title={t("dashboardPage.kpis.currenciesTitle")}
          value={t("dashboardPage.kpis.currenciesValue")}
          desc={t("dashboardPage.kpis.currenciesDesc")}
        />
        <KpiCard
          title={t("dashboardPage.kpis.activityTitle")}
          value={t("dashboardPage.kpis.activityValue")}
          desc={t("dashboardPage.kpis.activityDesc")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <TrendChartCard />

        <div className="rounded-3xl border border-zinc-200/70 bg-white/75 p-5 shadow-xl shadow-sky-100/50 backdrop-blur ring-1 ring-zinc-200/40">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-zinc-900">{t("dashboardPage.quickActions")}</div>
          </div>

          <div className="mt-4 space-y-2">
            <QuickAction href="/app/coa" icon={<BookOpen className="h-4 w-4" aria-hidden />} label={t("dashboardPage.open.coa")} />
            <QuickAction href="/app/journal" icon={<NotebookPen className="h-4 w-4" aria-hidden />} label={t("dashboardPage.open.journal")} />
            <QuickAction href="/app/customers" icon={<Users className="h-4 w-4" aria-hidden />} label={t("dashboardPage.open.customers")} />
            <QuickAction href="/app/invoices" icon={<FileText className="h-4 w-4" aria-hidden />} label={t("dashboardPage.open.invoices")} />
          </div>

          <div className="mt-5 rounded-2xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600 ring-1 ring-zinc-200/70">
            {t("dashboardPage.chartDesc")}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, desc }: { title: string; value: string; desc: string }) {
  return (
    <div className="rounded-3xl border border-zinc-200/70 bg-white/75 p-5 shadow-xl shadow-sky-100/50 backdrop-blur ring-1 ring-zinc-200/40">
      <div className="text-sm text-zinc-500">{title}</div>
      <div className="mt-1 text-base font-semibold text-zinc-900">{value}</div>
      <p className="mt-2 text-sm text-zinc-600">{desc}</p>
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/70 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus:ring-4 focus:ring-sky-100"
    >
      <span className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200/70 transition group-hover:bg-white group-hover:text-zinc-700">
          {icon}
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 text-zinc-400 transition group-hover:text-zinc-600" aria-hidden />
    </Link>
  );
}

