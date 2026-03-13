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
  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);

  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      status: "PAID",
      ...(fromDate || toDate ? { updatedAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}),
    },
    select: {
      invoiceNumber: true,
      issueDate: true,
      updatedAt: true,
      totalBase: true,
      currencyCode: true,
      customer: { select: { name: true } },
    },
    orderBy: [{ customer: { name: "asc" } }, { updatedAt: "desc" }],
  });

  const rows = invoices.map((inv) => {
    const daysToCollect = Math.max(0, Math.floor((inv.updatedAt.getTime() - inv.issueDate.getTime()) / 86400000));
    return {
      Customer: inv.customer.name,
      "Invoice #": inv.invoiceNumber,
      "Issue Date": inv.issueDate.toISOString().slice(0, 10),
      "Paid Date": inv.updatedAt.toISOString().slice(0, 10),
      Amount: Number(inv.totalBase),
      Currency: inv.currencyCode,
      "Days to Collect": daysToCollect,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Collections");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="collections${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.xlsx"`,
    },
  });
}

