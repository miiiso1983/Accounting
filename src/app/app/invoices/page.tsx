import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { InvoiceListActions } from "./InvoiceListActions";

import { Prisma } from "@/generated/prisma/client";

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

type PaymentState = "ALL" | "PAID" | "PARTIAL" | "UNPAID";
type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";

function paymentStateOf(totalBase: Prisma.Decimal, receivedBase: Prisma.Decimal): Exclude<PaymentState, "ALL"> {
  if (totalBase.lte(0)) return "PAID";
  if (receivedBase.lte(0)) return "UNPAID";
  if (receivedBase.gte(totalBase)) return "PAID";
  return "PARTIAL";
}

export default async function InvoicesIndexPage({
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
  const paymentStateParam = typeof sp.paymentState === "string" ? sp.paymentState : "ALL";
  const takeParam = typeof sp.take === "string" ? sp.take : undefined;
  const take = Math.min(Math.max(Number(takeParam) || 50, 1), 500);

  const allowedStatus = new Set(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"]);
  const status = allowedStatus.has(statusParam) ? (statusParam as InvoiceStatus) : undefined;

  const allowedPaymentState = new Set(["ALL", "PAID", "PARTIAL", "UNPAID"]);
  const paymentState = allowedPaymentState.has(paymentStateParam) ? (paymentStateParam as PaymentState) : "ALL";

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const [customers, invoicesRaw] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true },
    }),
    prisma.invoice.findMany({
      where: {
        companyId,
        ...(status ? { status } : {}),
        ...(customerId ? { customerId } : {}),
        ...(fromDate || toDate
          ? {
              issueDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { invoiceNumber: { contains: q, mode: "insensitive" } },
                { customer: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      include: { customer: { select: { id: true, name: true } }, branch: { select: { code: true, name: true } } },
      take,
    }),
  ]);

  const invoiceIds = invoicesRaw.map((i) => i.id);
  const payAgg = invoiceIds.length
    ? await prisma.invoicePayment.groupBy({
        by: ["invoiceId"],
        where: { companyId, invoiceId: { in: invoiceIds } },
        _sum: { amountBase: true },
      })
    : [];
  const receivedByInvoiceId = new Map<string, Prisma.Decimal>();
  for (const row of payAgg) {
    receivedByInvoiceId.set(row.invoiceId, new Prisma.Decimal(row._sum.amountBase ?? 0));
  }

  const rows = invoicesRaw
    .map((inv) => {
      const receivedBase = receivedByInvoiceId.get(inv.id) ?? new Prisma.Decimal(0);
      const totalBase = new Prisma.Decimal(inv.totalBase);
      const remainingBase = totalBase.sub(receivedBase);
      const ps = paymentStateOf(totalBase, receivedBase);
      return { inv, receivedBase, remainingBase, paymentState: ps };
    })
    .filter((r) => (paymentState === "ALL" ? true : r.paymentState === paymentState));
  const canWrite = hasPermission(session, PERMISSIONS.INVOICE_WRITE);

  const exportQs = new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(status ? { status } : {}),
    ...(customerId ? { customerId } : {}),
    ...(q ? { q } : {}),
    ...(paymentState !== "ALL" ? { paymentState } : {}),
  }).toString();

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Sales</div>
          <div className="mt-1 text-base font-medium text-zinc-900">Invoices</div>
        </div>
        <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800" href="/app/invoices/new">
          New invoice
        </Link>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4">
        <form className="grid gap-3 md:grid-cols-6" method="GET">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-zinc-600">Search (Invoice # / Customer) / بحث</label>
            <input
              name="q"
              defaultValue={q}
              className="mt-1 w-full rounded-xl border bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
              placeholder="e.g. INV-1001 أو اسم الزبون"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-600">Status / الحالة</label>
            <select name="status" defaultValue={status ?? ""} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
              <option value="">All / الكل</option>
              <option value="DRAFT">DRAFT</option>
              <option value="SENT">SENT</option>
              <option value="PAID">PAID</option>
              <option value="OVERDUE">OVERDUE</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-600">Customer / الزبون</label>
            <select name="customerId" defaultValue={customerId} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
              <option value="">All / الكل</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-600">From / من</label>
            <input name="from" type="date" defaultValue={from ?? ""} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-600">To / إلى</label>
            <input name="to" type="date" defaultValue={to ?? ""} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-600">Payment / الدفع</label>
            <select name="paymentState" defaultValue={paymentState} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
              <option value="ALL">All / الكل</option>
              <option value="UNPAID">Unpaid / غير مدفوع</option>
              <option value="PARTIAL">Partial / جزئي</option>
              <option value="PAID">Paid / مدفوع</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-600">Limit / عدد</label>
            <select name="take" defaultValue={String(take)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
              {[50, 100, 200, 500].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2 md:col-span-2">
            <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800" type="submit">
              Apply / تطبيق
            </button>
            <Link className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50" href="/app/invoices">
              Reset / مسح
            </Link>
            <a
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 hover:bg-emerald-100"
              href={`/api/invoices/export${exportQs ? `?${exportQs}` : ""}`}
            >
              Export Excel
            </a>
          </div>
        </form>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Invoice #</th>
              <th className="py-2 pr-3">Customer</th>
              <th className="py-2 pr-3">Branch / الفرع</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Total (base)</th>
              <th className="py-2 pr-3">Received (base) / المستلم</th>
              <th className="py-2 pr-3">Remaining (base) / المتبقي</th>
              <th className="py-2 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ inv, receivedBase, remainingBase }) => (
              <tr key={inv.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3 text-zinc-700">{inv.issueDate.toISOString().slice(0, 10)}</td>
                <td className="py-2 pr-3">
                  <Link className="underline text-zinc-700" href={`/app/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
                </td>
                <td className="py-2 pr-3 text-zinc-900">{inv.customer.name}</td>
                <td className="py-2 pr-3 text-zinc-700">{inv.branch ? `${inv.branch.code}` : "-"}</td>
                <td className="py-2 pr-3 text-zinc-700">{inv.status}</td>
                <td className="py-2 pr-3 font-mono text-zinc-900">{fmt(inv.totalBase)}</td>
                <td className="py-2 pr-3 font-mono text-zinc-900">{fmt(receivedBase)}</td>
                <td className="py-2 pr-3 font-mono text-zinc-900">{fmt(remainingBase)}</td>
                <td className="py-2 pr-3">
                  <InvoiceListActions invoiceId={inv.id} status={inv.status} canWrite={canWrite} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 ? <div className="mt-4 text-sm text-zinc-600">No invoices match the current filters.</div> : null}
      </div>
    </div>
  );
}
