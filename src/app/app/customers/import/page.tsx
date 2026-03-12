import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { authOptions } from "@/lib/auth/options";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";

import { ImportClient } from "./ImportClient";

export default async function CustomerImportPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  const t = createTranslator(messages);

  const labels = {
    title: t("customers.import.title"),
    subtitle: t("customers.import.subtitle"),
    downloadTemplate: t("customers.import.downloadTemplate"),
    upload: t("customers.import.upload"),
    importing: t("customers.import.importing"),
    success: t("customers.import.success"),
    errorRows: t("customers.import.errorRows"),
    dropzone: t("customers.import.dropzone"),
  };

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">{t("nav.customers")}</div>
          <div className="mt-1 text-base font-medium text-zinc-900">{labels.title}</div>
          <div className="mt-1 text-xs text-zinc-500">{labels.subtitle}</div>
        </div>
        <Link
          href="/app/customers"
          className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          ← {t("nav.customers")}
        </Link>
      </div>

      <ImportClient labels={labels} />
    </div>
  );
}

