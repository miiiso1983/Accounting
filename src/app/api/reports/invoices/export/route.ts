import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

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

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });
  const companyId = user.companyId;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const customerId = searchParams.get("customerId") ?? undefined;
  const costCenterId = searchParams.get("costCenterId") ?? undefined;
  const columnsParam = searchParams.get("columns") ?? undefined;
  const visibleColumns = columnsParam ? columnsParam.split(",") : undefined;

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  const issueDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  const invoiceWhere: Record<string, unknown> = { companyId };
  if (issueDateWhere) invoiceWhere.issueDate = issueDateWhere;
  if (status && ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"].includes(status)) invoiceWhere.status = status;
  if (customerId) invoiceWhere.customerId = customerId;
  if (costCenterId) invoiceWhere.lineItems = { some: { costCenterId } };

  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere,
    orderBy: [{ issueDate: "desc" }],
    select: {
      invoiceNumber: true,
      status: true,
      issueDate: true,
      dueDate: true,
      totalBase: true,
      currencyCode: true,
      customer: { select: { name: true } },
      lineItems: { select: { costCenter: { select: { name: true } } } },
      payments: { select: { amountBase: true } },
    },
  });

  // Column key → header label mapping
  const columnMap: Record<string, string> = {
    invoiceNumber: "Invoice # / رقم الفاتورة",
    customer: "Customer / الزبون",
    status: "Status / الحالة",
    issueDate: "Issue Date / تاريخ الإصدار",
    dueDate: "Due Date / تاريخ الاستحقاق",
    currencyCode: "Currency / العملة",
    total: "Total / الإجمالي",
    paid: "Paid / المسدد",
    remaining: "Remaining / المتبقي",
    costCenter: "Cost Center / مركز الكلفة",
  };

  // Determine which columns to include
  const allKeys = Object.keys(columnMap);
  const activeKeys = visibleColumns ? allKeys.filter((k) => visibleColumns.includes(k)) : allKeys;
  const activeHeaders = activeKeys.map((k) => columnMap[k]);

  type RowType = Record<string, string | number>;
  const rows: RowType[] = invoices.map((inv) => {
    const total = Number(inv.totalBase);
    const paid = inv.payments.reduce((s, p) => s + Number(p.amountBase), 0);
    const remaining = total - paid;
    const ccNames = [...new Set(inv.lineItems.map((li) => li.costCenter?.name).filter(Boolean))].join(", ");
    const fullRow: Record<string, string | number> = {
      [columnMap.invoiceNumber]: inv.invoiceNumber,
      [columnMap.customer]: inv.customer.name,
      [columnMap.status]: inv.status,
      [columnMap.issueDate]: inv.issueDate.toISOString().slice(0, 10),
      [columnMap.dueDate]: inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "",
      [columnMap.currencyCode]: inv.currencyCode,
      [columnMap.total]: total,
      [columnMap.paid]: paid,
      [columnMap.remaining]: remaining,
      [columnMap.costCenter]: ccNames || "",
    };
    // Filter to active columns only
    const filteredRow: RowType = {};
    for (const h of activeHeaders) filteredRow[h] = fullRow[h] ?? "";
    return filteredRow;
  });

  // Summary row
  const grandTotal = invoices.reduce((_, inv) => _ + Number(inv.totalBase), 0);
  const grandPaid = invoices.reduce((s, inv) => s + inv.payments.reduce((ps, p) => ps + Number(p.amountBase), 0), 0);
  const grandRemaining = grandTotal - grandPaid;
  const summaryRow: RowType = {};
  for (const h of activeHeaders) {
    if (h === columnMap.total) summaryRow[h] = grandTotal;
    else if (h === columnMap.paid) summaryRow[h] = grandPaid;
    else if (h === columnMap.remaining) summaryRow[h] = grandRemaining;
    else if (h === activeHeaders[activeHeaders.length - 1] && !activeKeys.includes("total")) summaryRow[h] = "Total / المجموع";
    else summaryRow[h] = "";
  }
  // Mark last non-numeric column as "Total" label
  if (activeKeys.includes("total") || activeKeys.includes("paid") || activeKeys.includes("remaining")) {
    const lastLabelKey = activeHeaders.find((h) => h !== columnMap.total && h !== columnMap.paid && h !== columnMap.remaining && h !== columnMap.currencyCode);
    if (lastLabelKey && !summaryRow[lastLabelKey]) {
      // Find the last text-type header before numeric columns
      const textHeaders = activeHeaders.filter((h) => h !== columnMap.total && h !== columnMap.paid && h !== columnMap.remaining);
      if (textHeaders.length > 0) summaryRow[textHeaders[textHeaders.length - 1]] = "Total / المجموع";
    }
  }
  rows.push(summaryRow);

  const ws = XLSX.utils.json_to_sheet(rows.length > 1 ? rows : [{ Message: "(no data)" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invoices Report");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `invoices-report${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

