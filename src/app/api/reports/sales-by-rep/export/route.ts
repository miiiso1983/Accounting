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

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  const issueDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { companyId, salesRepresentativeId: { not: null } };
  if (issueDateWhere) where.issueDate = issueDateWhere;
  if (status) where.status = status;

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      salesRepresentative: { select: { name: true } },
      customer: { select: { name: true } },
    },
    orderBy: [{ issueDate: "desc" }],
  });

  type RowType = Record<string, string | number>;
  const rows: RowType[] = invoices.map((inv) => ({
    "Sales Rep / المندوب": inv.salesRepresentative?.name ?? "",
    "Invoice # / رقم الفاتورة": inv.invoiceNumber,
    "Customer / الزبون": inv.customer.name,
    "Status / الحالة": inv.status,
    "Issue Date / تاريخ الإصدار": inv.issueDate.toISOString().slice(0, 10),
    "Total / الإجمالي": Number(inv.total) || 0,
    "Currency / العملة": inv.currencyCode,
    "Total (base) / الإجمالي (أساس)": Number(inv.totalBase) || 0,
    "Base Currency / عملة الأساس": inv.baseCurrencyCode,
  }));

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Message: "(no data)" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sales by Rep");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `sales-by-rep${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

