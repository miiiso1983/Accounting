import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { getCachedBranches } from "@/lib/db/cached-queries";
import { formatDate } from "@/lib/format/date";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

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

type EstimateStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CONVERTED";

const statusColors: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  SENT: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  ACCEPTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  REJECTED: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
  EXPIRED: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  CONVERTED: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

export default async function EstimatesIndexPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const statusParam = typeof sp.status === "string" ? sp.status : "";
  const customerId = typeof sp.customerId === "string" ? sp.customerId : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const branchId = typeof sp.branchId === "string" ? sp.branchId : "";
  const takeParam = typeof sp.take === "string" ? sp.take : undefined;
  const take = Math.min(Math.max(Number(takeParam) || 50, 1), 500);

  const allowedStatus = new Set(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"]);
  const status = allowedStatus.has(statusParam) ? (statusParam as EstimateStatus) : undefined;
  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.ESTIMATE_READ)) {
    return <div className="rounded-2xl border bg-white dark:bg-zinc-950 dark:border-zinc-700 p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white dark:bg-zinc-950 dark:border-zinc-700 p-5 text-sm">No company assigned.</div>;

  const [customers, estimates, branches] = await Promise.all([
    prisma.customer.findMany({ where: { companyId }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }),
    prisma.estimate.findMany({
      where: {
        companyId,
        ...(status ? { status } : {}),
        ...(customerId ? { customerId } : {}),
        ...(fromDate || toDate ? { issueDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}),
        ...(q ? { OR: [{ estimateNumber: { contains: q, mode: "insensitive" as const } }, { customer: { name: { contains: q, mode: "insensitive" as const } } }] } : {}),
        ...(branchId ? { branchId } : {}),
      },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      include: { customer: { select: { id: true, name: true } }, branch: { select: { code: true, name: true } } },
      take,
    }),
    getCachedBranches(companyId),
  ]);

  const canWrite = hasPermission(session, PERMISSIONS.ESTIMATE_WRITE);

  return (
    <div className="rounded-2xl border bg-white dark:bg-zinc-950 dark:border-zinc-700 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Sales</div>
          <div className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">Estimates / عروض الأسعار</div>
        </div>
        {canWrite && (
          <Link className="rounded-xl bg-zinc-900 dark:bg-zinc-100 px-3 py-2 text-sm text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200" href="/app/estimates/new">
            New Estimate / عرض سعر جديد
          </Link>
        )}
      </div>

      <div className="mt-4 rounded-2xl border dark:border-zinc-700 bg-white dark:bg-zinc-950 p-4">
        <form className="grid gap-3 md:grid-cols-6" method="GET">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Search / بحث</label>
            <input name="q" defaultValue={q} className="mt-1 w-full rounded-xl border dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200" placeholder="EST-0001 أو اسم الزبون" />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Status / الحالة</label>
            <select name="status" defaultValue={status ?? ""} className="mt-1 w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm">
              <option value="">All / الكل</option>
              {["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Customer / الزبون</label>
            <select name="customerId" defaultValue={customerId} className="mt-1 w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm">
              <option value="">All / الكل</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">From / من</label>
            <input name="from" type="date" defaultValue={from ?? ""} className="mt-1 w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">To / إلى</label>
            <input name="to" type="date" defaultValue={to ?? ""} className="mt-1 w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Branch / الفرع</label>
            <select name="branchId" defaultValue={branchId} className="mt-1 w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm">
              <option value="">All / الكل</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <button className="rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200" type="submit">Apply / تطبيق</button>
            <Link className="rounded-xl border dark:border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:text-zinc-300" href="/app/estimates">Reset / مسح</Link>
          </div>
        </form>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500 dark:text-zinc-400">
            <tr className="border-b dark:border-zinc-700">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Estimate #</th>
              <th className="py-2 pr-3">Customer</th>
              <th className="py-2 pr-3">Branch</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Total</th>
              <th className="py-2 pr-3">Expiry</th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((est) => (
              <tr key={est.id} className="border-b dark:border-zinc-700 last:border-b-0">
                <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-300">{formatDate(est.issueDate)}</td>
                <td className="py-2 pr-3"><Link className="underline text-zinc-700 dark:text-zinc-300" href={`/app/estimates/${est.id}`}>{est.estimateNumber}</Link></td>
                <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">{est.customer.name}</td>
                <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-300">{est.branch?.code ?? "-"}</td>
                <td className="py-2 pr-3"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[est.status] ?? ""}`}>{est.status}</span></td>
                <td className="py-2 pr-3 font-mono text-zinc-900 dark:text-zinc-100">{fmt(est.total)} {est.currencyCode}</td>
                <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-300">{est.expiryDate ? formatDate(est.expiryDate) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {estimates.length === 0 && <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">No estimates match the current filters.</div>}
      </div>
    </div>
  );
}
