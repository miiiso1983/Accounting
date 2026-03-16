"use client";

import Link from "next/link";
import { useColumnVisibility, type ColumnDef } from "@/hooks/useColumnVisibility";
import { ColumnSelector } from "@/components/reports/ColumnSelector";
import { ExportButtons } from "@/components/reports/ExportButtons";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  SENT: "bg-sky-100 text-sky-700",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-orange-100 text-orange-700",
};

function fmt(n: number) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const COLUMNS: ColumnDef[] = [
  { key: "invoiceNumber", label: "Invoice # / رقم الفاتورة" },
  { key: "customer", label: "Customer / الزبون" },
  { key: "status", label: "Status / الحالة" },
  { key: "issueDate", label: "Issue Date / تاريخ الإصدار" },
  { key: "dueDate", label: "Due Date / تاريخ الاستحقاق" },
  { key: "currencyCode", label: "Currency / العملة", defaultVisible: false },
  { key: "total", label: "Total / الإجمالي" },
  { key: "paid", label: "Paid / المسدد" },
  { key: "remaining", label: "Remaining / المتبقي" },
  { key: "costCenter", label: "Cost Center / مركز الكلفة" },
];

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  currencyCode: string;
  total: number;
  paid: number;
  remaining: number;
  costCenterNames: string;
};

interface Props {
  rows: InvoiceRow[];
  grandTotal: number;
  grandPaid: number;
  grandRemaining: number;
  excelBaseHref: string;
}

export function InvoicesReportTable({ rows, grandTotal, grandPaid, grandRemaining, excelBaseHref }: Props) {
  const { visibility, toggle, isVisible, visibleKeys } = useColumnVisibility("invoices-report-columns", COLUMNS);

  const visibleCount = COLUMNS.filter((c) => isVisible(c.key)).length;
  // Count columns before "total" for the footer colspan
  const footerColSpan = ["invoiceNumber", "customer", "status", "issueDate", "dueDate", "currencyCode"].filter((k) => isVisible(k)).length;

  return (
    <>
      <div className="flex items-center gap-2">
        <ExportButtons excelHref={excelBaseHref} labels={{ excel: "Export Excel", print: "Print / PDF" }} visibleColumns={visibleKeys} />
        <ColumnSelector columns={COLUMNS} visibility={visibility} onToggle={toggle} />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              {isVisible("invoiceNumber") && <th className="py-2 pr-3">Invoice # / رقم الفاتورة</th>}
              {isVisible("customer") && <th className="py-2 pr-3">Customer / الزبون</th>}
              {isVisible("status") && <th className="py-2 pr-3">Status / الحالة</th>}
              {isVisible("issueDate") && <th className="py-2 pr-3">Issue Date / تاريخ الإصدار</th>}
              {isVisible("dueDate") && <th className="py-2 pr-3">Due Date / تاريخ الاستحقاق</th>}
              {isVisible("currencyCode") && <th className="py-2 pr-3">Currency / العملة</th>}
              {isVisible("total") && <th className="py-2 pr-3 text-right">Total / الإجمالي</th>}
              {isVisible("paid") && <th className="py-2 pr-3 text-right">Paid / المسدد</th>}
              {isVisible("remaining") && <th className="py-2 pr-3 text-right">Remaining / المتبقي</th>}
              {isVisible("costCenter") && <th className="py-2 pr-3">Cost Center / مركز الكلفة</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                {isVisible("invoiceNumber") && (
                  <td className="py-2 pr-3 font-mono text-zinc-700">
                    <Link href={`/app/invoices/${r.id}`} className="text-sky-700 hover:text-sky-900 hover:underline">{r.invoiceNumber}</Link>
                  </td>
                )}
                {isVisible("customer") && <td className="py-2 pr-3 text-zinc-900">{r.customerName}</td>}
                {isVisible("status") && (
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-zinc-100 text-zinc-700"}`}>{r.status}</span>
                  </td>
                )}
                {isVisible("issueDate") && <td className="py-2 pr-3 text-zinc-700">{r.issueDate}</td>}
                {isVisible("dueDate") && <td className="py-2 pr-3 text-zinc-700">{r.dueDate ?? "-"}</td>}
                {isVisible("currencyCode") && <td className="py-2 pr-3 text-zinc-700">{r.currencyCode}</td>}
                {isVisible("total") && <td className="py-2 pr-3 text-right font-mono text-zinc-900">{fmt(r.total)}</td>}
                {isVisible("paid") && <td className="py-2 pr-3 text-right font-mono text-emerald-700">{fmt(r.paid)}</td>}
                {isVisible("remaining") && <td className={`py-2 pr-3 text-right font-mono ${r.remaining > 0 ? "text-rose-600" : "text-zinc-500"}`}>{fmt(r.remaining)}</td>}
                {isVisible("costCenter") && <td className="py-2 pr-3 text-xs text-zinc-500">{r.costCenterNames || "-"}</td>}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={visibleCount} className="py-6 text-center text-zinc-400">No invoices found / لا توجد فواتير</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td colSpan={footerColSpan} className="py-2 pr-3 text-zinc-700">Total / المجموع</td>
                {isVisible("total") && <td className="py-2 pr-3 text-right font-mono text-zinc-900">{fmt(grandTotal)}</td>}
                {isVisible("paid") && <td className="py-2 pr-3 text-right font-mono text-emerald-700">{fmt(grandPaid)}</td>}
                {isVisible("remaining") && <td className="py-2 pr-3 text-right font-mono text-rose-600">{fmt(grandRemaining)}</td>}
                {isVisible("costCenter") && <td></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

