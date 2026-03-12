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

      <div className="mt-4 grid gap-3 md:grid-cols-2">
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
      </div>
    </div>
  );
}
