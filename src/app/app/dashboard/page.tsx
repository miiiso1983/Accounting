import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ArrowUpRight, BookOpen, FileText, Landmark, NotebookPen, ReceiptText, Users } from "lucide-react";

import { authOptions } from "@/lib/auth/options";
import { formatDate } from "@/lib/format/date";
import { prisma } from "@/lib/db/prisma";
import { getCachedDashboardCounts } from "@/lib/db/cached-queries";

import { getMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";

import { TrendChartCard, type TrendPoint } from "./TrendChartCard";

function toNumberSafe(n: unknown): number {
  if (n == null) return 0;
  if (typeof n === "number") return Number.isFinite(n) ? n : 0;
  if (typeof n === "string") {
    const x = Number(n);
    return Number.isFinite(x) ? x : 0;
  }
  if (typeof n === "object" && n && "toNumber" in n && typeof (n as { toNumber?: unknown }).toNumber === "function") {
    try {
      const x = (n as unknown as { toNumber: () => number }).toNumber();
      return Number.isFinite(x) ? x : 0;
    } catch {
      return 0;
    }
  }
  const x = Number(String(n));
  return Number.isFinite(x) ? x : 0;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  const t = createTranslator(messages);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      companyId: true,
      company: { select: { name: true, baseCurrencyCode: true } },
    },
  });

  const companyId = user?.companyId;
  const companyName = user?.company?.name ?? "";
  const currencyCode = user?.company?.baseCurrencyCode;

  if (!companyId) {
    return (
			<div className="rounded-3xl border border-sky-200/60 bg-white/80 p-6 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
        <div className="text-sm font-semibold text-zinc-900">{t("dashboardPage.empty.noCompanyTitle")}</div>
        <p className="mt-2 text-sm text-zinc-600">{t("dashboardPage.empty.noCompanyDesc")}</p>
      </div>
    );
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const chartStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    dashboardCounts,
    salesThisMonthAgg,
    receivablesAgg,
    recentInvoices,
    recentEntries,
    invoicesForChart,
  ] = await Promise.all([
    getCachedDashboardCounts(companyId),
    prisma.invoice.aggregate({
      where: {
        companyId,
        issueDate: { gte: monthStart },
        status: { in: ["SENT", "PAID", "OVERDUE"] },
      },
      _sum: { totalBase: true },
    }),
    prisma.invoice.aggregate({
      where: {
        companyId,
        status: { in: ["SENT", "OVERDUE"] },
      },
      _sum: { totalBase: true },
    }),
    prisma.invoice.findMany({
      where: { companyId },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 6,
      include: { customer: { select: { name: true } } },
    }),
    prisma.journalEntry.findMany({
      where: { companyId },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: { id: true, status: true, entryDate: true, description: true },
    }),
    prisma.invoice.findMany({
      where: {
        companyId,
        issueDate: { gte: chartStart },
        status: { in: ["SENT", "PAID", "OVERDUE"] },
      },
      select: { issueDate: true, totalBase: true },
    }),
  ]);

  const [accountsCount, customersCount, invoicesCount, postedEntriesCount] = dashboardCounts;
  const salesThisMonth = toNumberSafe(salesThisMonthAgg._sum.totalBase);
  const receivables = toNumberSafe(receivablesAgg._sum.totalBase);

  const fmtCount = (n: number) => new Intl.NumberFormat(locale).format(n);
  const fmtMoney = (n: number) => {
    if (!currencyCode) return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
    return new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(n);
  };

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "short" });
  const buckets: TrendPoint[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { label: monthLabel.format(d), value: 0 };
  });
  const indexForMonth = (d: Date) => (d.getFullYear() - chartStart.getFullYear()) * 12 + (d.getMonth() - chartStart.getMonth());
  for (const inv of invoicesForChart) {
    const idx = indexForMonth(inv.issueDate);
    if (idx >= 0 && idx < buckets.length) {
      buckets[idx]!.value += toNumberSafe(inv.totalBase);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl">{t("dashboardPage.title")}</h1>
          <p className="mt-1 text-sm text-zinc-600">{t("dashboardPage.subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
			<div className="rounded-2xl bg-white/70 px-3 py-2 text-xs font-medium text-zinc-700 ring-1 ring-sky-200/70 shadow-sm">
            {t("dashboardPage.meta.company", { name: companyName || "-" })}
          </div>
			<div className="rounded-2xl bg-white/70 px-3 py-2 text-xs font-medium text-zinc-700 ring-1 ring-sky-200/70 shadow-sm">
            {t("dashboardPage.meta.periodThisMonth")}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <StatCard icon={<ReceiptText className="h-4 w-4" aria-hidden />} title={t("dashboardPage.stats.salesThisMonth")} value={fmtMoney(salesThisMonth)} desc={t("dashboardPage.stats.salesThisMonthDesc")} />
        <StatCard icon={<Landmark className="h-4 w-4" aria-hidden />} title={t("dashboardPage.stats.receivables")} value={fmtMoney(receivables)} desc={t("dashboardPage.stats.receivablesDesc")} />
        <StatCard icon={<NotebookPen className="h-4 w-4" aria-hidden />} title={t("dashboardPage.stats.postedEntries")} value={fmtCount(postedEntriesCount)} desc={t("dashboardPage.stats.postedEntriesDesc")} />
        <StatCard icon={<Users className="h-4 w-4" aria-hidden />} title={t("dashboardPage.stats.customers")} value={fmtCount(customersCount)} desc={t("dashboardPage.stats.customersDesc")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <TrendChartCard data={buckets} currencyCode={currencyCode ?? undefined} />

		<div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-zinc-900">{t("dashboardPage.quickActions")}</div>
          </div>

          <div className="mt-4 space-y-2">
            <QuickAction href="/app/coa" icon={<BookOpen className="h-4 w-4" aria-hidden />} label={t("dashboardPage.open.coa")} />
            <QuickAction href="/app/journal" icon={<NotebookPen className="h-4 w-4" aria-hidden />} label={t("dashboardPage.open.journal")} />
            <QuickAction href="/app/customers" icon={<Users className="h-4 w-4" aria-hidden />} label={t("dashboardPage.open.customers")} />
            <QuickAction href="/app/invoices" icon={<FileText className="h-4 w-4" aria-hidden />} label={t("dashboardPage.open.invoices")} />
          </div>

			<div className="mt-5 rounded-2xl bg-emerald-50/60 px-4 py-3 text-xs text-zinc-700 ring-1 ring-emerald-200/60">
            {t("dashboardPage.chartDesc")}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
	<div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">{t("dashboardPage.recentInvoices")}</div>
              <div className="mt-1 text-xs text-zinc-500">{t("dashboardPage.recentInvoicesDesc")}</div>
            </div>
			<Link href="/app/invoices" className="text-xs font-medium text-emerald-700 hover:text-emerald-800">
              {t("dashboardPage.viewAll")}
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            {recentInvoices.length ? (
              recentInvoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/app/invoices/${inv.id}`}
						className="group flex items-center justify-between gap-3 rounded-2xl border border-sky-200/60 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-sky-300/70 hover:bg-sky-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-medium text-zinc-900">{inv.invoiceNumber}</div>
                      <StatusPill status={inv.status} />
                    </div>
                    <div className="mt-1 truncate text-xs text-zinc-500">
                      {(inv.customer?.name ?? "-") + " · " + formatDate(inv.issueDate)}
                    </div>
                  </div>

                  <div className="shrink-0 text-end">
                    <div className="text-sm font-semibold text-zinc-900">{fmtMoney(toNumberSafe(inv.totalBase))}</div>
                    <div className="mt-1 text-xs text-zinc-500">{t("dashboardPage.total")}</div>
                  </div>
                </Link>
              ))
			) : (
				<div className="rounded-2xl border border-dashed border-sky-200/60 bg-white px-4 py-6 text-center text-sm text-zinc-600">
                {t("dashboardPage.empty.noInvoices")}
              </div>
            )}
          </div>
        </div>

	<div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">{t("dashboardPage.recentEntries")}</div>
              <div className="mt-1 text-xs text-zinc-500">{t("dashboardPage.recentEntriesDesc")}</div>
            </div>
			<Link href="/app/journal" className="text-xs font-medium text-emerald-700 hover:text-emerald-800">
              {t("dashboardPage.viewAll")}
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            {recentEntries.length ? (
              recentEntries.map((e) => (
                <Link
                  key={e.id}
                  href={`/app/journal`}
						className="group flex items-center justify-between gap-3 rounded-2xl border border-sky-200/60 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-sky-300/70 hover:bg-sky-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-medium text-zinc-900">{t("dashboardPage.journalEntry")}</div>
                      <StatusPill status={e.status} />
                    </div>
                    <div className="mt-1 truncate text-xs text-zinc-500">
                      {(e.description ?? t("dashboardPage.noDescription")) + " · " + formatDate(e.entryDate)}
                    </div>
                  </div>
					<ArrowUpRight className="h-4 w-4 text-emerald-600 transition group-hover:text-emerald-700" aria-hidden />
                </Link>
              ))
            ) : (
			<div className="rounded-2xl border border-dashed border-sky-200/60 bg-white px-4 py-6 text-center text-sm text-zinc-600">
                {t("dashboardPage.empty.noEntries")}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MiniCard title={t("dashboardPage.mini.accountsTitle")} value={fmtCount(accountsCount)} desc={t("dashboardPage.mini.accountsDesc")} />
        <MiniCard title={t("dashboardPage.mini.invoicesTitle")} value={fmtCount(invoicesCount)} desc={t("dashboardPage.mini.invoicesDesc")} />
      </div>
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  desc: string;
}) {
  return (
		<div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-zinc-500">{title}</div>
				<span className="grid h-9 w-9 place-items-center rounded-2xl bg-sky-50/70 text-sky-700 ring-1 ring-sky-200/70">
          {icon}
        </span>
      </div>
      <div className="mt-2 text-lg font-semibold tracking-tight text-zinc-900">{value}</div>
      <p className="mt-2 text-sm text-zinc-600">{desc}</p>
    </div>
  );
}

function MiniCard({ title, value, desc }: { title: string; value: string; desc: string }) {
  return (
		<div className="rounded-3xl border border-sky-200/60 bg-white/70 p-5 shadow-xl shadow-emerald-200/20 backdrop-blur ring-1 ring-sky-200/40">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{desc}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
		PAID: "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
		SENT: "bg-sky-100 text-sky-800 ring-sky-200/80",
		OVERDUE: "bg-amber-100 text-amber-900 ring-amber-200/80",
		CANCELLED: "bg-slate-100 text-slate-700 ring-slate-200/80",
		DRAFT: "bg-slate-100 text-slate-700 ring-slate-200/80",
		POSTED: "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
		VOID: "bg-slate-100 text-slate-700 ring-slate-200/80",
  };
	const cls = map[status] ?? "bg-slate-100 text-slate-700 ring-slate-200/80";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}>
      {status}
    </span>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
			className="group flex items-center justify-between gap-3 rounded-2xl border border-sky-200/60 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-sky-300/70 hover:bg-sky-50/70 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
    >
      <span className="flex items-center gap-3">
				<span className="grid h-9 w-9 place-items-center rounded-2xl bg-emerald-50/60 text-emerald-700 ring-1 ring-emerald-200/60 transition group-hover:bg-white group-hover:text-emerald-800">
          {icon}
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </span>
			<ArrowUpRight className="h-4 w-4 text-emerald-600 transition group-hover:text-emerald-700" aria-hidden />
    </Link>
  );
}

