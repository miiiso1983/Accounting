import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/format/date";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

function toNum(d: unknown) {
  const n = Number(String(d));
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.EXPENSE_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });
  const companyId = user.companyId;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = { companyId };
  if (from || to) {
    where.expenseDate = {
      ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    };
  }

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    include: {
      expenseAccount: { select: { code: true, name: true } },
      costCenter: { select: { code: true, name: true } },
      lineItems: {
        include: {
          account: { select: { code: true, name: true } },
          costCenter: { select: { code: true, name: true } },
        },
      },
    },
    take: 5000,
  });

  const rows: Record<string, unknown>[] = [];
  for (const e of expenses) {
    if (e.lineItems.length === 0) {
      // Legacy expense without line items
      rows.push({
        "Expense #": e.expenseNumber || e.id.slice(0, 8),
        Date: formatDate(e.expenseDate),
        Vendor: e.vendorName || "",
        Status: e.status,
        "Account Code": e.expenseAccount?.code || "",
        "Account Name": e.expenseAccount?.name || "",
        "Cost Center": e.costCenter ? `${e.costCenter.code} - ${e.costCenter.name}` : "",
        Description: e.description || "",
        Amount: toNum(e.total),
        Currency: e.currencyCode,
        "Amount (base)": toNum(e.totalBase),
        "Base Currency": e.baseCurrencyCode,
      });
    } else {
      for (const li of e.lineItems) {
        rows.push({
          "Expense #": e.expenseNumber || e.id.slice(0, 8),
          Date: formatDate(e.expenseDate),
          Vendor: e.vendorName || "",
          Status: e.status,
          "Account Code": li.account.code,
          "Account Name": li.account.name,
          "Cost Center": li.costCenter ? `${li.costCenter.code} - ${li.costCenter.name}` : "",
          Description: li.description || e.description || "",
          Amount: toNum(li.amount),
          Currency: e.currencyCode,
          "Total (base)": toNum(e.totalBase),
          "Base Currency": e.baseCurrencyCode,
        });
      }
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Message: "(no data)" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Expenses");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename = `expenses-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

