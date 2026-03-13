import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });
  const companyId = user.companyId;

  const { searchParams } = new URL(req.url);
  const asOfParam = searchParams.get("asOf") ?? undefined;
  const asOfDate = asOfParam ? new Date(`${asOfParam}T23:59:59.999Z`) : new Date();
  const asOfMs = asOfDate.getTime();

  const invoices = await prisma.invoice.findMany({
    where: { companyId, status: { in: ["SENT", "OVERDUE"] }, issueDate: { lte: asOfDate } },
    select: { totalBase: true, issueDate: true, dueDate: true, customerId: true, customer: { select: { name: true } } },
    orderBy: { issueDate: "asc" },
  });

  const map = new Map<string, { name: string; current: number; "1-30": number; "31-60": number; "61-90": number; "90+": number; total: number }>();
  for (const inv of invoices) {
    const amt = Number(inv.totalBase);
    const dueMs = inv.dueDate ? inv.dueDate.getTime() : inv.issueDate.getTime();
    const days = Math.max(0, Math.floor((asOfMs - dueMs) / 86400000));
    if (!map.has(inv.customerId)) map.set(inv.customerId, { name: inv.customer.name, current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0, total: 0 });
    const e = map.get(inv.customerId)!;
    if (days <= 0) e.current += amt;
    else if (days <= 30) e["1-30"] += amt;
    else if (days <= 60) e["31-60"] += amt;
    else if (days <= 90) e["61-90"] += amt;
    else e["90+"] += amt;
    e.total += amt;
  }

  const rows = [...map.values()].sort((a, b) => b.total - a.total).map(({ name, ...rest }) => ({ Customer: name, ...rest }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "AR Aging");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ar-aging${asOfParam ? `-${asOfParam}` : ""}.xlsx"`,
    },
  });
}

