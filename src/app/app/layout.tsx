import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";

import {
  BookOpen,
  BarChart3,
  Building2,
  ClipboardList,
  FileDown,
  FileText,
  LayoutDashboard,
  NotebookPen,
  Package,
  ArrowLeftRight,
  ReceiptText,
  Settings,
  Users,
  UserCheck,
  ShieldCheck,
} from "lucide-react";

import { LocaleToggle } from "@/components/i18n/LocaleToggle";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { getRequestLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n/messages";
import { createTranslator } from "@/lib/i18n/translate";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!session.user.isActive) redirect("/login");

  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  const t = createTranslator(messages);
  const email = session.user.email ?? "";
  const canSeeSettings =
    hasPermission(session, PERMISSIONS.COST_CENTERS_READ) ||
    hasPermission(session, PERMISSIONS.BRANCHES_READ) ||
    hasPermission(session, PERMISSIONS.SETTINGS_WRITE);

  return (
    <div className="min-h-dvh bg-linear-to-br from-sky-100 via-white to-emerald-100">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          <aside className="hidden md:block">
	          <div className="sticky top-6 rounded-3xl border border-sky-200/60 bg-white/75 p-4 shadow-xl shadow-emerald-200/30 backdrop-blur ring-1 ring-sky-200/40">
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-br from-sky-700 to-emerald-600 text-white shadow-sm">
                  <LayoutDashboard className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-900">{t("common.appName")}</div>
                  <div className="truncate text-xs text-zinc-500">{t("common.dashboard")}</div>
                </div>
              </div>

              <nav className="mt-3 space-y-1">
                <NavItem href="/app/dashboard" icon={<LayoutDashboard className="h-4 w-4" aria-hidden />} label={t("nav.overview")} />
                <NavItem href="/app/coa" icon={<BookOpen className="h-4 w-4" aria-hidden />} label={t("nav.coa")} />
                <NavItem href="/app/journal" icon={<NotebookPen className="h-4 w-4" aria-hidden />} label={t("nav.journal")} />
	                <NavItem href="/app/reports" icon={<BarChart3 className="h-4 w-4" aria-hidden />} label={t("nav.reports")} />
                <NavItem href="/app/customers" icon={<Users className="h-4 w-4" aria-hidden />} label={t("nav.customers")} />
                <NavItem href="/app/products" icon={<Package className="h-4 w-4" aria-hidden />} label={t("nav.products")} />
                <NavItem href="/app/invoices" icon={<FileText className="h-4 w-4" aria-hidden />} label={t("nav.invoices")} />
                <NavItem href="/app/estimates" icon={<ClipboardList className="h-4 w-4" aria-hidden />} label={t("nav.estimates")} />
                <NavItem href="/app/credit-notes" icon={<FileDown className="h-4 w-4" aria-hidden />} label={t("nav.creditNotes")} />
	                <NavItem href="/app/expenses" icon={<ReceiptText className="h-4 w-4" aria-hidden />} label={t("nav.expenses")} />
                <NavItem href="/app/transfers" icon={<ArrowLeftRight className="h-4 w-4" aria-hidden />} label={t("nav.transfers")} />
                <NavItem href="/app/sales-reps" icon={<UserCheck className="h-4 w-4" aria-hidden />} label={t("nav.salesReps")} />
                <NavItem href="/app/admin/users" icon={<ShieldCheck className="h-4 w-4" aria-hidden />} label={t("nav.users")} />

	                {canSeeSettings ? (
	                  <div className="mt-4 border-t border-sky-200/60 pt-4">
	                    <NavItem href="/app/settings" icon={<Settings className="h-4 w-4" aria-hidden />} label={t("nav.settings")} />
	                    <div className="mt-1 space-y-1 pl-12">
	                      {hasPermission(session, PERMISSIONS.COST_CENTERS_READ) ? (
	                        <NavSubItem href="/app/settings/cost-centers" label={t("nav.costCenters")} />
	                      ) : null}
	                      {hasPermission(session, PERMISSIONS.BRANCHES_READ) ? (
	                        <NavSubItem href="/app/settings/branches" label={t("nav.branches")} />
	                      ) : null}
	                      {hasPermission(session, PERMISSIONS.SETTINGS_WRITE) ? (
	                        <NavSubItem href="/app/settings/print-templates" label={t("nav.printTemplates")} />
	                      ) : null}
	                    </div>
	                  </div>
	                ) : null}
              </nav>

	            <div className="mt-4 flex flex-col gap-2 border-t border-sky-200/60 pt-4">
                <div className="px-2 text-xs text-zinc-600">
                  {t("common.signedInAs", { email: email || "-" })}
                </div>
                <div className="flex items-center justify-between gap-2 px-2">
                  <LocaleToggle locale={locale} />
                  <ThemeToggle />
                  <SignOutButton />
                </div>
              </div>
            </div>
          </aside>

	          <div className="min-w-0">
	        <header className="sticky top-0 z-10 rounded-3xl border border-sky-200/60 bg-white/70 px-4 py-4 backdrop-blur ring-1 ring-sky-200/40 md:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-500">{t("common.appName")}</div>
                  <div className="truncate text-lg font-semibold tracking-tight text-zinc-900">{t("common.dashboard")}</div>
                </div>

                <div className="flex items-center gap-2">
                  <LocaleToggle locale={locale} />
                  <ThemeToggle />
	              <SignOutButton className="inline-flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-2 text-xs font-medium text-zinc-700 ring-1 ring-sky-200/70 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-200/70" />
                </div>
              </div>

              <nav className="mt-4 flex gap-2 overflow-x-auto text-sm md:hidden">
                <MobileNavChip href="/app/dashboard" label={t("nav.overview")} />
                <MobileNavChip href="/app/coa" label={t("nav.coa")} />
                <MobileNavChip href="/app/journal" label={t("nav.journal")} />
	                <MobileNavChip href="/app/reports" label={t("nav.reports")} />
                <MobileNavChip href="/app/customers" label={t("nav.customers")} />
                <MobileNavChip href="/app/products" label={t("nav.products")} />
                <MobileNavChip href="/app/invoices" label={t("nav.invoices")} />
                <MobileNavChip href="/app/estimates" label={t("nav.estimates")} />
                <MobileNavChip href="/app/credit-notes" label={t("nav.creditNotes")} />
	                <MobileNavChip href="/app/expenses" label={t("nav.expenses")} />
                <MobileNavChip href="/app/transfers" label={t("nav.transfers")} />
                <MobileNavChip href="/app/sales-reps" label={t("nav.salesReps")} />
                <MobileNavChip href="/app/admin/users" label={t("nav.users")} />
	                {canSeeSettings ? <MobileNavChip href="/app/settings" label={t("nav.settings")} /> : null}
              </nav>
            </header>

            <main className="mt-6">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
	    className="group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-sky-50/80 hover:text-zinc-900 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
    >
	    <span className="grid h-8 w-8 place-items-center rounded-xl bg-sky-50/70 text-sky-700 ring-1 ring-sky-200/70 transition group-hover:bg-white group-hover:text-sky-800">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function MobileNavChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
	    className="shrink-0 rounded-2xl bg-white px-3 py-2 text-xs font-medium text-zinc-700 ring-1 ring-sky-200/70 transition hover:bg-sky-50/80 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
    >
      {label}
    </Link>
  );
}

function NavSubItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl px-3 py-2 text-sm text-zinc-600 transition hover:bg-sky-50/80 hover:text-zinc-900 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
    >
      {label}
    </Link>
  );
}

