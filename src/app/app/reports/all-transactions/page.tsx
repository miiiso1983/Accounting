import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { ExportButtons } from "@/components/reports/ExportButtons";

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

function fmt(n: number) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const DOC_TYPE_LABELS: Record<string, string> = {
  JOURNAL: "سند قيد / Journal Entry",
  INVOICE: "مبيعات / Sales Invoice",
  EXPENSE: "مشتريات / Expense",
  PAYMENT: "سند قبض / Payment",
  FUND_TRANSFER: "سند تحويل / Fund Transfer",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  POSTED: "bg-emerald-100 text-emerald-700",
  VOID: "bg-rose-100 text-rose-700",
  SENT: "bg-sky-100 text-sky-700",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-orange-100 text-orange-700",
  SUBMITTED: "bg-sky-100 text-sky-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

type TransactionRow = {
  id: string;
  date: string;
  docType: string;
  docTypeLabel: string;
  reference: string;
  description: string;
  totalDebit: number;
  totalCredit: number;
  status: string;
  link: string;
};

export default async function AllTransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const sp = (await searchParams) ?? {};
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const docType = typeof sp.docType === "string" ? sp.docType : undefined;
  const status = typeof sp.status === "string" ? sp.status : undefined;

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  const entryDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  // Build where clause for journal entries
  const jeWhere: Record<string, unknown> = { companyId };
  if (entryDateWhere) jeWhere.entryDate = entryDateWhere;
  if (status && ["DRAFT", "POSTED", "VOID"].includes(status)) jeWhere.status = status;
  if (docType === "JOURNAL") jeWhere.referenceType = null;
  else if (docType === "FUND_TRANSFER") jeWhere.referenceType = "FUND_TRANSFER";
  else if (docType === "INVOICE") jeWhere.referenceType = "INVOICE";
  else if (docType === "EXPENSE") jeWhere.referenceType = "EXPENSE";
  else if (docType === "PAYMENT") jeWhere.referenceType = "PAYMENT";

  const journalEntries = await prisma.journalEntry.findMany({
    where: jeWhere,
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take: 1000,
    select: {
      id: true,
      entryNumber: true,
      entryDate: true,
      description: true,
      status: true,
      referenceType: true,
      referenceId: true,
      lines: {
        select: { dc: true, amountBase: true },
      },
      invoices: { select: { id: true, invoiceNumber: true, status: true } },
      expenses: { select: { id: true, expenseNumber: true, status: true } },
      invoicePayments: { select: { id: true, invoiceId: true } },
    },
  });

  // Map journal entries to unified rows
  const rows: TransactionRow[] = journalEntries.map((je) => {
    const totalDebit = je.lines.filter((l) => l.dc === "DEBIT").reduce((s, l) => s + Number(l.amountBase), 0);
    const totalCredit = je.lines.filter((l) => l.dc === "CREDIT").reduce((s, l) => s + Number(l.amountBase), 0);

    let docTypeKey = "JOURNAL";
    let reference = `JE-${je.entryNumber || je.id.slice(-6)}`;
    let displayStatus: string = je.status;
    let link = `/app/journal/${je.id}`;

    if (je.referenceType === "FUND_TRANSFER") {
      docTypeKey = "FUND_TRANSFER";
      reference = `TRF-${je.entryNumber || je.id.slice(-6)}`;
    } else if (je.referenceType === "INVOICE" && je.invoices.length > 0) {
      docTypeKey = "INVOICE";
      const inv = je.invoices[0];
      reference = inv.invoiceNumber;
      displayStatus = inv.status;
      link = `/app/invoices/${inv.id}`;
    } else if (je.referenceType === "EXPENSE" && je.expenses.length > 0) {
      docTypeKey = "EXPENSE";
      const exp = je.expenses[0];
      reference = exp.expenseNumber || `EXP-${je.id.slice(-6)}`;
      displayStatus = exp.status;
      link = `/app/expenses/${exp.id}`;
    } else if (je.referenceType === "PAYMENT" && je.invoicePayments.length > 0) {
      docTypeKey = "PAYMENT";
      const pmt = je.invoicePayments[0];
      reference = `PMT-${je.entryNumber || je.id.slice(-6)}`;
      link = `/app/invoices/${pmt.invoiceId}`;
    }

    return {
      id: je.id,
      date: je.entryDate.toISOString().slice(0, 10),
      docType: docTypeKey,
      docTypeLabel: DOC_TYPE_LABELS[docTypeKey] || docTypeKey,
      reference,
      description: je.description || "-",
      totalDebit,
      totalCredit,
      status: displayStatus,
      link,
    };
  });

  const grandDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
  const grandCredit = rows.reduce((s, r) => s + r.totalCredit, 0);

  // Build query string for export
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (docType) qs.set("docType", docType);
  if (status) qs.set("status", status);
  const qsStr = qs.toString();

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Reports / التقارير</div>
          <div className="mt-1 text-base font-medium text-zinc-900">All Transactions / جميع الحركات المالية</div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons excelHref={`/api/reports/all-transactions/export${qsStr ? `?${qsStr}` : ""}`} labels={{ excel: "Export Excel", print: "Print / PDF" }} />
          <Link className="text-sm underline text-zinc-700" href="/app/reports">Back / رجوع</Link>
        </div>
      </div>

      {/* Filters */}
      <form className="mt-4 grid gap-3 md:grid-cols-12" method="GET" action="/app/reports/all-transactions">
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">From / من</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">To / إلى</label>
          <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">Document Type / نوع الوثيقة</label>
          <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" name="docType" defaultValue={docType ?? ""}>
            <option value="">All / الكل</option>
            <option value="JOURNAL">سند قيد / Journal Entry</option>
            <option value="INVOICE">مبيعات / Sales Invoice</option>
            <option value="EXPENSE">مشتريات / Expense</option>
            <option value="PAYMENT">سند قبض / Payment</option>
            <option value="FUND_TRANSFER">تحويل / Fund Transfer</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-zinc-600">Status / الحالة</label>
          <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" name="status" defaultValue={status ?? ""}>
            <option value="">All / الكل</option>
            <option value="DRAFT">Draft / مسودة</option>
            <option value="POSTED">Posted / مرحّل</option>
            <option value="VOID">Void / ملغي</option>
          </select>
        </div>
        <div className="md:col-span-2 flex items-end">
          <button type="submit" className="w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800">Filter / تصفية</button>
        </div>
      </form>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border bg-zinc-50 px-3 py-2">
          <div className="text-xs text-zinc-500">Transactions / عدد الحركات</div>
          <div className="mt-1 text-lg font-bold text-zinc-900">{rows.length}</div>
        </div>
        <div className="rounded-xl border bg-emerald-50 px-3 py-2">
          <div className="text-xs text-emerald-600">Total Debit / إجمالي المدين</div>
          <div className="mt-1 text-lg font-bold text-emerald-900">{fmt(grandDebit)}</div>
        </div>
        <div className="rounded-xl border bg-sky-50 px-3 py-2">
          <div className="text-xs text-sky-600">Total Credit / إجمالي الدائن</div>
          <div className="mt-1 text-lg font-bold text-sky-900">{fmt(grandCredit)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3 w-10">#</th>
              <th className="py-2 pr-3">Date / التاريخ</th>
              <th className="py-2 pr-3">Document / الوثيقة</th>
              <th className="py-2 pr-3">Reference / رقمها</th>
              <th className="py-2 pr-3">Notes / ملاحظة</th>
              <th className="py-2 pr-3 text-right">Total Debit / إجمالي المدين</th>
              <th className="py-2 pr-3 text-right">Total Credit / إجمالي الدائن</th>
              <th className="py-2 pr-3">Status / الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="py-6 text-center text-zinc-400">No transactions found / لا توجد حركات</td></tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-zinc-50">
                  <td className="py-2 pr-3 text-zinc-400 font-mono text-xs">{idx + 1}</td>
                  <td className="py-2 pr-3 font-mono text-zinc-700">{r.date}</td>
                  <td className="py-2 pr-3 text-zinc-700">{r.docTypeLabel}</td>
                  <td className="py-2 pr-3">
                    <Link href={r.link} className="text-sky-700 hover:text-sky-900 hover:underline font-mono">{r.reference}</Link>
                  </td>
                  <td className="py-2 pr-3 text-zinc-600 max-w-xs truncate">{r.description}</td>
                  <td className="py-2 pr-3 text-right font-mono text-zinc-900">{r.totalDebit > 0 ? fmt(r.totalDebit) : "-"}</td>
                  <td className="py-2 pr-3 text-right font-mono text-zinc-900">{r.totalCredit > 0 ? fmt(r.totalCredit) : "-"}</td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-zinc-100 text-zinc-700"}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 font-semibold text-sm">
              <tr>
                <td colSpan={5} className="py-2 pr-3 text-zinc-700">Total / المجموع</td>
                <td className="py-2 pr-3 text-right font-mono text-emerald-800">{fmt(grandDebit)}</td>
                <td className="py-2 pr-3 text-right font-mono text-sky-800">{fmt(grandCredit)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

