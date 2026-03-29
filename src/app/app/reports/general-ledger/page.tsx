import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { formatDate } from "@/lib/format/date";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";
import { ExportButtons } from "@/components/reports/ExportButtons";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function parseDateStart(ymd: string | undefined) {
  if (!ymd) return undefined;
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDateEnd(ymd: string | undefined) {
  if (!ymd) return undefined;
  const d = new Date(`${ymd}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const accountId = typeof sp.accountId === "string" ? sp.accountId : undefined;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  const t = createTranslator(messages);

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const accounts = await prisma.glAccount.findMany({
    where: { companyId, isPosting: true },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true },
  });

  const selectedAccount = accountId ? accounts.find((a) => a.id === accountId) : undefined;

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  const entryDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  const lines = accountId
    ? await prisma.journalLine.findMany({
        where: {
          accountId,
          journalEntry: {
            companyId,
            status: "POSTED",
            ...(entryDateWhere ? { entryDate: entryDateWhere } : {}),
          },
        },
        include: {
          journalEntry: { select: { id: true, entryDate: true, description: true, referenceType: true, referenceId: true } },
        },
        orderBy: [{ journalEntry: { entryDate: "asc" } }, { id: "asc" }],
        take: 500,
      })
    : [];

  const rows = lines.reduce<Array<(typeof lines)[number] & { running: number }>>((acc, l) => {
    const prev = acc.length ? acc[acc.length - 1]!.running : 0;
    const v = Number(l.amountBase);
    const running = prev + (l.dc === "DEBIT" ? v : -v);
    return [...acc, { ...l, running }];
  }, []);

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">{t("reports.title")}</div>
          <div className="mt-1 text-base font-medium text-zinc-900">{t("reports.generalLedger.title")}</div>
        </div>
        {accountId && (
          <ExportButtons
            excelHref={`/api/reports/general-ledger/export?${new URLSearchParams({ accountId, ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}`}
            labels={{ excel: t("reports.export.excel"), print: t("reports.export.print") }}
          />
        )}
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-8" method="GET" action="/app/reports/general-ledger">
        <div className="md:col-span-4">
          <label className="text-xs font-medium text-zinc-600">{t("reports.filters.account")}</label>
          <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" name="accountId" defaultValue={accountId ?? ""}>
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">{t("reports.filters.from")}</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">{t("reports.filters.to")}</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <div className="md:col-span-8">
          <button
            type="submit"
            className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
          >
            {t("reports.filters.apply")}
          </button>
        </div>
      </form>

      {!accountId ? (
        <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-zinc-700">{t("reports.empty.selectAccount")}</div>
      ) : (
        <div className="mt-4">
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-xs text-zinc-500">{t("reports.filters.account")}</div>
            <div className="mt-1 text-sm font-medium text-zinc-900">
              {selectedAccount ? `${selectedAccount.code} — ${selectedAccount.name}` : accountId}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr className="border-b">
                  <th className="py-2 pr-3">{t("reports.columns.date")}</th>
                  <th className="py-2 pr-3">{t("reports.columns.entry")}</th>
                  <th className="py-2 pr-3">{t("reports.columns.dc")}</th>
                  <th className="py-2 pr-3">{t("reports.columns.debitBase")}</th>
                  <th className="py-2 pr-3">{t("reports.columns.creditBase")}</th>
                  <th className="py-2 pr-3">{t("reports.columns.balanceBase")}</th>
                  <th className="py-2 pr-3">{t("reports.columns.amount")}</th>
                  <th className="py-2 pr-3">{t("reports.columns.currency")}</th>
                  <th className="py-2 pr-3">{t("reports.columns.note")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 text-zinc-700">{formatDate(l.journalEntry.entryDate)}</td>
                    <td className="py-2 pr-3">
                      <Link className="underline text-zinc-700" href={`/app/journal/${l.journalEntry.id}`}>
                        {l.journalEntry.description ?? l.journalEntry.id}
                      </Link>
                      {l.journalEntry.referenceType ? (
                        <div className="mt-1 text-xs text-zinc-500">
                          {l.journalEntry.referenceType}
                          {l.journalEntry.referenceId ? ` · ${l.journalEntry.referenceId}` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-zinc-700">{l.dc}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-900">{l.dc === "DEBIT" ? fmt(l.amountBase) : "-"}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-900">{l.dc === "CREDIT" ? fmt(l.amountBase) : "-"}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-900">{fmt(l.running)}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-900">{fmt(l.amount)}</td>
                    <td className="py-2 pr-3 text-zinc-700">{l.currencyCode}</td>
                    <td className="py-2 pr-3 text-zinc-700">{l.description ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {rows.length === 0 ? <div className="mt-4 text-sm text-zinc-600">No lines found.</div> : null}
            {rows.length >= 500 ? <div className="mt-2 text-xs text-zinc-500">Showing first 500 lines.</div> : null}
          </div>
        </div>
      )}
    </div>
  );
}
