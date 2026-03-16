import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ExportButtons } from "@/components/reports/ExportButtons";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";

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

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
type Category = "OPERATING" | "INVESTING" | "FINANCING";

function classifyCounterparty(a: { type: AccountType; code: string }): Category {
  if (a.type === "INCOME" || a.type === "EXPENSE") return "OPERATING";
  // Working capital (simple heuristic)
  if (a.code.startsWith("12") || a.code.startsWith("21")) return "OPERATING"; // AR/AP
  if (a.type === "ASSET") return "INVESTING";
  return "FINANCING";
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
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

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  const entryDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  // Identify cash/bank accounts (Iraq UASC starter: 111x, 112x, parent 1100)
  const cashAccounts = await prisma.glAccount.findMany({
    where: {
      companyId,
      isPosting: true,
      OR: [{ code: { startsWith: "111" } }, { code: { startsWith: "112" } }, { parent: { code: "1100" } }],
    },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true },
  });
  const cashIds = cashAccounts.map((a) => a.id);
  const cashIdSet = new Set(cashIds);

  const entries = cashIds.length
    ? await prisma.journalEntry.findMany({
        where: {
          companyId,
          status: "POSTED",
          ...(entryDateWhere ? { entryDate: entryDateWhere } : {}),
          lines: { some: { accountId: { in: cashIds } } },
        },
        orderBy: [{ entryDate: "asc" }],
        select: {
          id: true,
          entryDate: true,
          description: true,
          lines: {
            select: {
              accountId: true,
              dc: true,
              amountBase: true,
              account: { select: { code: true, name: true, type: true } },
            },
          },
        },
      })
    : [];

  const buckets: Record<Category, Map<string, { code: string; name: string; amount: number }>> = {
    OPERATING: new Map(),
    INVESTING: new Map(),
    FINANCING: new Map(),
  };

  for (const e of entries) {
    let cashDelta = 0;
    const nonCash = new Map<string, { code: string; name: string; type: AccountType; raw: number }>();

    for (const l of e.lines) {
      const v = Number(l.amountBase ?? 0);
      const raw = l.dc === "DEBIT" ? v : -v;
      if (cashIdSet.has(l.accountId)) {
        cashDelta += raw;
      } else {
        const key = l.accountId;
        const prev = nonCash.get(key) ?? { code: l.account.code, name: l.account.name, type: l.account.type as AccountType, raw: 0 };
        prev.raw += raw;
        nonCash.set(key, prev);
      }
    }

    // Internal cash transfers will end up ~0.
    if (Math.abs(cashDelta) < 0.0001) continue;

    for (const [accountId, a] of nonCash.entries()) {
      const cashImpact = -a.raw; // ensures sum(cashImpact) == cashDelta
      if (Math.abs(cashImpact) < 0.0001) continue;
      const cat = classifyCounterparty({ type: a.type, code: a.code });
      const m = buckets[cat];
      const prev = m.get(accountId) ?? { code: a.code, name: a.name, amount: 0 };
      prev.amount += cashImpact;
      m.set(accountId, prev);
    }
  }

  function mapToRows(m: Map<string, { code: string; name: string; amount: number }>) {
    return [...m.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  const operatingRows = mapToRows(buckets.OPERATING);
  const investingRows = mapToRows(buckets.INVESTING);
  const financingRows = mapToRows(buckets.FINANCING);

  const totalOperating = operatingRows.reduce((s, r) => s + r.amount, 0);
  const totalInvesting = investingRows.reduce((s, r) => s + r.amount, 0);
  const totalFinancing = financingRows.reduce((s, r) => s + r.amount, 0);
  const netChange = totalOperating + totalInvesting + totalFinancing;

  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();

  function glHref(accountId: string) {
    const p = new URLSearchParams({ accountId, ...(from ? { from } : {}), ...(to ? { to } : {}) });
    return `/app/reports/general-ledger?${p.toString()}`;
  }

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">{t("reports.title")}</div>
          <div className="mt-1 text-base font-semibold text-zinc-900">Cash Flow Statement / قائمة التدفقات النقدية</div>
          {cashAccounts.length > 0 && (
            <div className="mt-1 text-xs text-zinc-500">
              Cash/Bank accounts: {cashAccounts.map((a) => `${a.code}`).join(", ")}
            </div>
          )}
        </div>
        <ExportButtons excelHref={`/api/reports/cash-flow/export${qs ? `?${qs}` : ""}`} labels={{ excel: t("reports.export.excel"), print: t("reports.export.print") }} />
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-6" method="GET" action="/app/reports/cash-flow">
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">{t("reports.filters.from")}</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">{t("reports.filters.to")}</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <div className="md:col-span-2 flex items-end gap-2">
          <button
            type="submit"
            className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
          >
            {t("reports.filters.apply")}
          </button>
          <Link href="/app/reports/cash-flow" className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50">
            Reset / إعادة ضبط
          </Link>
        </div>
      </form>

      {cashAccounts.length === 0 ? (
        <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-zinc-600">
          No cash/bank accounts detected (expected codes like 111x / 112x or parent 1100).
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr className="border-b">
                <th className="py-2 pr-3">Account / الحساب</th>
                <th className="py-2 pr-3 text-right">Cash impact (base) / الأثر النقدي</th>
              </tr>
            </thead>
            <tbody>
              <SectionRows title="Operating Activities / الأنشطة التشغيلية" color="emerald" rows={operatingRows} total={totalOperating} glHref={glHref} />
              <SectionRows title="Investing Activities / الأنشطة الاستثمارية" color="purple" rows={investingRows} total={totalInvesting} glHref={glHref} />
              <SectionRows title="Financing Activities / الأنشطة التمويلية" color="orange" rows={financingRows} total={totalFinancing} glHref={glHref} />

              <tr className="border-t-4 border-zinc-300 bg-zinc-50 font-bold text-base">
                <td className="py-3 pr-3">Net Change in Cash / صافي التغير في النقد</td>
                <td className={`py-3 pr-3 text-right font-mono ${netChange < 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmt(netChange)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SectionRows({
  title,
  color,
  rows,
  total,
  glHref,
}: {
  title: string;
  color: "emerald" | "purple" | "orange";
  rows: { id: string; code: string; name: string; amount: number }[];
  total: number;
  glHref: (id: string) => string;
}) {
  const headerClass =
    color === "emerald"
      ? "bg-emerald-50/60 text-emerald-800"
      : color === "purple"
        ? "bg-purple-50/60 text-purple-800"
        : "bg-orange-50/60 text-orange-800";
  const totalClass =
    color === "emerald"
      ? "bg-emerald-50 text-emerald-900"
      : color === "purple"
        ? "bg-purple-50 text-purple-900"
        : "bg-orange-50 text-orange-900";

  return (
    <>
      <tr className={headerClass}>
        <td colSpan={2} className="py-2 px-2 font-semibold">
          {title}
        </td>
      </tr>
      {rows.map((a) => (
        <tr key={a.id} className="border-b last:border-0">
          <td className="py-1.5 pr-3">
            <Link href={glHref(a.id)} className="hover:underline">
              <span className="font-mono text-xs text-sky-600 mr-2">{a.code}</span>
              <span className="text-sky-700 hover:text-sky-900">{a.name}</span>
            </Link>
          </td>
          <td className={`py-1.5 pr-3 text-right font-mono ${a.amount < 0 ? "text-rose-600" : "text-zinc-900"}`}>{a.amount !== 0 ? fmt(a.amount) : "-"}</td>
        </tr>
      ))}
      <tr className={totalClass}>
        <td className="py-2 pr-3 font-semibold">Total / الإجمالي</td>
        <td className="py-2 pr-3 text-right font-mono font-semibold">{fmt(total)}</td>
      </tr>
      <tr>
        <td colSpan={2} className="py-2" />
      </tr>
    </>
  );
}
