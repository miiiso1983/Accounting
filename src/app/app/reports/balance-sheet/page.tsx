import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { ExportButtons } from "@/components/reports/ExportButtons";
import type { JournalEntryStatus } from "@/generated/prisma/client";

function fmt(n: number) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function parseDateEnd(ymd: string | undefined) {
  if (!ymd) return undefined;
  const d = new Date(`${ymd}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

type AccountRow = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  isPosting: boolean;
  balance: number;
  children: AccountRow[];
};

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const asOf = typeof sp.asOf === "string" ? sp.asOf : undefined;
  const costCenterId = typeof sp.costCenterId === "string" ? sp.costCenterId : undefined;

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const toDate = parseDateEnd(asOf);

  const costCenters = await prisma.costCenter.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true },
  });

  // Fetch all accounts (not just posting)
  const allAccounts = await prisma.glAccount.findMany({
    where: { companyId, type: { in: ["ASSET", "LIABILITY", "EQUITY"] } },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true, type: true, parentId: true, isPosting: true },
  });

  // Aggregate posted journal lines
  const postingIds = allAccounts.filter((a) => a.isPosting).map((a) => a.id);
  const lineWhere = (dc: "DEBIT" | "CREDIT") => ({
    dc,
    ...(costCenterId ? { costCenterId } : {}),
    journalEntry: { companyId, status: "POSTED" as JournalEntryStatus, ...(toDate ? { entryDate: { lte: toDate } } : {}) },
    accountId: { in: postingIds },
  });
  const [debitAgg, creditAgg] = await Promise.all([
    prisma.journalLine.groupBy({ by: ["accountId"], where: lineWhere("DEBIT"), _sum: { amountBase: true } }),
    prisma.journalLine.groupBy({ by: ["accountId"], where: lineWhere("CREDIT"), _sum: { amountBase: true } }),
  ]);

  const debitMap = new Map<string, number>();
  for (const r of debitAgg) debitMap.set(r.accountId, Number(r._sum.amountBase ?? 0));
  const creditMap = new Map<string, number>();
  for (const r of creditAgg) creditMap.set(r.accountId, Number(r._sum.amountBase ?? 0));

  // Build tree
  const byId = new Map<string, AccountRow>();
  for (const a of allAccounts) {
    const rawBal = (debitMap.get(a.id) ?? 0) - (creditMap.get(a.id) ?? 0);
    byId.set(a.id, { ...a, type: a.type as AccountType, balance: a.isPosting ? rawBal : 0, children: [] });
  }
  const roots: AccountRow[] = [];
  for (const a of allAccounts) {
    const node = byId.get(a.id)!;
    if (a.parentId && byId.has(a.parentId)) byId.get(a.parentId)!.children.push(node);
    else roots.push(node);
  }

  // Roll up balances from children to parents
  function rollUp(node: AccountRow): number {
    let childSum = 0;
    for (const c of node.children) childSum += rollUp(c);
    node.balance += childSum;
    return node.balance;
  }
  roots.forEach(rollUp);

  const assetRoots = roots.filter((r) => r.type === "ASSET");
  const liabilityRoots = roots.filter((r) => r.type === "LIABILITY");
  const equityRoots = roots.filter((r) => r.type === "EQUITY");

  // Display balances according to normal balance
  // ASSET: debit-normal → positive means debit > credit (correct)
  // LIABILITY/EQUITY: credit-normal → negate so positive means credit > debit
  function displayBal(node: AccountRow) {
    if (node.type === "LIABILITY" || node.type === "EQUITY") return -node.balance;
    return node.balance;
  }

  const totalAssets = assetRoots.reduce((s, r) => s + r.balance, 0);
  const totalLiabilities = liabilityRoots.reduce((s, r) => s + -r.balance, 0);
  const totalEquity = equityRoots.reduce((s, r) => s + -r.balance, 0);
  const totalLE = totalLiabilities + totalEquity;
  const balanced = Math.abs(totalAssets - totalLE) < 0.01;

  const qs = new URLSearchParams({ ...(asOf ? { asOf } : {}), ...(costCenterId ? { costCenterId } : {}) }).toString();
  const qsStr = qs ? `?${qs}` : "";

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Reports / التقارير</div>
          <div className="mt-1 text-base font-semibold text-zinc-900">Balance Sheet / الميزانية العمومية</div>
        </div>
        <ExportButtons excelHref={`/api/reports/balance-sheet/export${qsStr}`} labels={{ excel: "Export Excel", print: "Print / PDF" }} />
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-9" method="GET" action="/app/reports/balance-sheet">
        <div className="md:col-span-3">
          <label className="text-xs font-medium text-zinc-600">As of date / بتاريخ</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="asOf" defaultValue={asOf ?? ""} />
        </div>
        <div className="md:col-span-3">
          <label className="text-xs font-medium text-zinc-600">Cost Center / مركز الكلفة</label>
          <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" name="costCenterId" defaultValue={costCenterId ?? ""}>
            <option value="">All / الكل</option>
            {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-3 flex items-end">
          <button type="submit" className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">Apply / تطبيق</button>
        </div>
      </form>
      {/* Balance Sheet Sections */}
      <div className="mt-4 space-y-6">
        {/* ASSETS */}
        <Section title="Assets / الأصول" color="sky" roots={assetRoots} displayBal={displayBal} fmt={fmt} />
        <div className="rounded-xl bg-sky-50 px-4 py-3 flex justify-between items-center font-bold text-sky-900">
          <span>Total Assets / إجمالي الأصول</span>
          <span className="font-mono">{fmt(totalAssets)}</span>
        </div>

        {/* LIABILITIES */}
        <Section title="Liabilities / الالتزامات" color="rose" roots={liabilityRoots} displayBal={displayBal} fmt={fmt} />
        <div className="rounded-xl bg-rose-50 px-4 py-3 flex justify-between items-center font-bold text-rose-900">
          <span>Total Liabilities / إجمالي الالتزامات</span>
          <span className="font-mono">{fmt(totalLiabilities)}</span>
        </div>

        {/* EQUITY */}
        <Section title="Equity / حقوق الملكية" color="purple" roots={equityRoots} displayBal={displayBal} fmt={fmt} />
        <div className="rounded-xl bg-purple-50 px-4 py-3 flex justify-between items-center font-bold text-purple-900">
          <span>Total Equity / إجمالي حقوق الملكية</span>
          <span className="font-mono">{fmt(totalEquity)}</span>
        </div>

        {/* TOTAL L+E */}
        <div className="rounded-xl bg-zinc-100 px-4 py-3 flex justify-between items-center font-bold text-zinc-900 text-base">
          <span>Liabilities + Equity / الالتزامات + حقوق الملكية</span>
          <span className="font-mono">{fmt(totalLE)}</span>
        </div>

        {/* Balance check */}
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${balanced ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {balanced ? "✅ Balanced — Assets = Liabilities + Equity / الميزانية متوازنة" : `⚠️ Not balanced — Difference: ${fmt(totalAssets - totalLE)} / الميزانية غير متوازنة`}
        </div>
      </div>
    </div>
  );
}

function Section({ title, color, roots, displayBal, fmt }: { title: string; color: string; roots: AccountRow[]; displayBal: (n: AccountRow) => number; fmt: (n: number) => string }) {
  const colorMap: Record<string, string> = { sky: "text-sky-800 bg-sky-50/60", rose: "text-rose-800 bg-rose-50/60", purple: "text-purple-800 bg-purple-50/60" };
  return (
    <div>
      <div className={`rounded-t-xl px-4 py-2 font-semibold text-sm ${colorMap[color] ?? ""}`}>{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {roots.map((r) => <AccountTree key={r.id} node={r} depth={0} displayBal={displayBal} fmt={fmt} />)}
          {roots.length === 0 && <tr><td className="py-2 px-4 text-zinc-400">No accounts</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function AccountTree({ node, depth, displayBal, fmt }: { node: AccountRow; depth: number; displayBal: (n: AccountRow) => number; fmt: (n: number) => string }) {
  const val = displayBal(node);
  const hasChildren = node.children.length > 0;
  return (
    <>
      <tr className={`border-b last:border-0 ${hasChildren ? "font-medium" : ""}`}>
        <td className="py-1.5 px-4" style={{ paddingLeft: `${depth * 20 + 16}px` }}>
          <span className="font-mono text-xs text-zinc-500 mr-2">{node.code}</span>
          <span className="text-zinc-800">{node.name}</span>
        </td>
        <td className={`py-1.5 px-4 text-right font-mono ${val < 0 ? "text-rose-600" : "text-zinc-900"}`}>
          {val !== 0 ? fmt(val) : "-"}
        </td>
      </tr>
      {node.children.map((c) => <AccountTree key={c.id} node={c} depth={depth + 1} displayBal={displayBal} fmt={fmt} />)}
    </>
  );
}

