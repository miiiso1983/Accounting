import Link from "next/link";
import { Building2, Printer, Settings, UserCog } from "lucide-react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { getMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const canCostCenters = hasPermission(session, PERMISSIONS.COST_CENTERS_READ);
  const canBranches = hasPermission(session, PERMISSIONS.BRANCHES_READ);
  const canPrintTemplates = hasPermission(session, PERMISSIONS.SETTINGS_WRITE);

  if (!canCostCenters && !canBranches && !canPrintTemplates) {
    // Still allow access for "My Preferences" which is always available
  }

  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  const t = createTranslator(messages);

  const cards = [
    {
      href: "/app/settings/preferences",
      title: "My Preferences / تفضيلاتي",
      desc: "Set your default branch and personal preferences. / ضبط الفرع الافتراضي والتفضيلات الشخصية.",
      icon: <UserCog className="h-5 w-5" aria-hidden />,
    },
    canCostCenters
      ? {
          href: "/app/settings/cost-centers",
          title: t("settingsPage.costCentersTitle"),
          desc: t("settingsPage.costCentersDesc"),
          icon: <Settings className="h-5 w-5" aria-hidden />,
        }
      : null,
    canBranches
      ? {
          href: "/app/settings/branches",
          title: t("settingsPage.branchesTitle"),
          desc: t("settingsPage.branchesDesc"),
          icon: <Building2 className="h-5 w-5" aria-hidden />,
        }
      : null,
    canPrintTemplates
      ? {
          href: "/app/settings/print-templates",
          title: t("settingsPage.printTemplatesTitle"),
          desc: t("settingsPage.printTemplatesDesc"),
          icon: <Printer className="h-5 w-5" aria-hidden />,
        }
      : null,
  ].filter(Boolean) as { href: string; title: string; desc: string; icon: React.ReactNode }[];

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="text-sm text-zinc-500">{t("settingsPage.subtitle")}</div>
      <div className="mt-1 text-base font-medium text-zinc-900">{t("settingsPage.title")}</div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-sky-200/60 bg-white p-4 shadow-sm transition hover:border-sky-300/80 hover:bg-sky-50/40 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
          >
            <div className="flex items-center gap-3 text-sky-700">{card.icon}</div>
            <div className="mt-3 text-sm font-semibold text-zinc-900">{card.title}</div>
            <div className="mt-1 text-sm text-zinc-600">{card.desc}</div>
            <div className="mt-4 text-xs font-medium text-emerald-700">{t("settingsPage.open")}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}