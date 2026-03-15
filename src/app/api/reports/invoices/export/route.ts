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
      customer: { select: { name: true } },
      lineItems: { select: { costCenter: { select: { name: true } } } },
      payments: { select: { amountBase: true } },
    },
  });

  type RowType = Record<string, string | number>;
  const rows: RowType[] = invoices.map((inv) => {
    const total = Number(inv.totalBase);
    const paid = inv.payments.reduce((s, p) => s + Number(p.amountBase), 0);
    const remaining = total - paid;
    const ccNames = [...new Set(inv.lineItems.map((li) => li.costCenter?.name).filter(Boolean))].join(", ");
    return {
      "Invoice # / رقم الفاتورة": inv.invoiceNumber,
      "Customer / الزبون": inv.customer.name,
      "Status / الحالة": inv.status,
      "Issue Date / تاريخ الإصدار": inv.issueDate.toISOString().slice(0, 10),
      "Due Date / تاريخ الاستحقاق": inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "",
      "Total / الإجمالي": total,
      "Paid / المسدد": paid,
      "Remaining / المتبقي": remaining,
      "Cost Center / مركز الكلفة": ccNames || "",
    };
  });

  // Summary row
  const grandTotal = rows.reduce((s, r) => s + (r["Total / الإجمالي"] as number), 0);
  const grandPaid = rows.reduce((s, r) => s + (r["Paid / المسدد"] as number), 0);
  const grandRemaining = rows.reduce((s, r) => s + (r["Remaining / المتبقي"] as number), 0);
  rows.push({
    "Invoice # / رقم الفاتورة": "",
    "Customer / الزبون": "",
    "Status / الحالة": "",
    "Issue Date / تاريخ الإصدار": "",
    "Due Date / تاريخ الاستحقاق": "Total / المجموع",
    "Total / الإجمالي": grandTotal,
    "Paid / المسدد": grandPaid,
    "Remaining / المتبقي": grandRemaining,
    "Cost Center / مركز الكلفة": "",
  });

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

