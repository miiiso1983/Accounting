import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/format/date";
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

  const paymentDateWhere = fromDate || toDate
    ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) }
    : undefined;

  // Export is aligned with the UI: filter by InvoicePayment.paymentDate and aggregate per invoice.
  const payments = await prisma.invoicePayment.findMany({
    where: {
      companyId,
      ...(paymentDateWhere ? { paymentDate: paymentDateWhere } : {}),
    },
    select: {
      invoiceId: true,
      paymentDate: true,
      amountBase: true,
      invoice: {
        select: {
          invoiceNumber: true,
          issueDate: true,
          totalBase: true,
          currencyCode: true,
          customer: { select: { name: true } },
        },
      },
    },
    orderBy: { paymentDate: "desc" },
    take: 100000,
  });

  type Agg = {
    customer: string;
    invoiceNumber: string;
    issueDate: Date;
    paidDate: Date;
    totalAmount: number;
    collectedAmount: number;
    currency: string;
  };

  const byInvoiceId = new Map<string, Agg>();
  for (const p of payments) {
    const existing = byInvoiceId.get(p.invoiceId);
    if (!existing) {
      byInvoiceId.set(p.invoiceId, {
        customer: p.invoice.customer.name,
        invoiceNumber: p.invoice.invoiceNumber,
        issueDate: p.invoice.issueDate,
        paidDate: p.paymentDate,
        totalAmount: Number(p.invoice.totalBase),
        collectedAmount: Number(p.amountBase),
        currency: p.invoice.currencyCode,
      });
      continue;
    }

    existing.collectedAmount += Number(p.amountBase);
    if (p.paymentDate.getTime() > existing.paidDate.getTime()) existing.paidDate = p.paymentDate;
  }

  const rows = [...byInvoiceId.values()]
    .sort((a, b) => {
      const c = a.customer.localeCompare(b.customer);
      if (c !== 0) return c;
      return b.paidDate.getTime() - a.paidDate.getTime();
    })
    .map((r) => {
      const daysToCollect = Math.max(0, Math.floor((r.paidDate.getTime() - r.issueDate.getTime()) / 86400000));
      return {
        Customer: r.customer,
        "Invoice #": r.invoiceNumber,
        "Issue Date": formatDate(r.issueDate),
        "Paid Date": formatDate(r.paidDate),
        Total: r.totalAmount,
        Collected: r.collectedAmount,
        Currency: r.currency,
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

