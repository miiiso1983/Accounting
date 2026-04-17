import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { Prisma } from "@/generated/prisma/client";
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

type PaymentState = "ALL" | "PAID" | "PARTIAL" | "UNPAID" | "SETTLED";
type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";

function paymentStateOf(totalBase: Prisma.Decimal, receivedBase: Prisma.Decimal): Exclude<PaymentState, "ALL"> {
  if (totalBase.lte(0)) return "PAID";
  if (receivedBase.lte(0)) return "UNPAID";
  if (receivedBase.gte(totalBase)) return "PAID";
  return "PARTIAL";
}

function toNum(d: unknown) {
  const n = Number(String(d));
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });
  const companyId = user.companyId;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const q = (searchParams.get("q") ?? "").trim();
  const customerId = searchParams.get("customerId") ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const paymentStateParam = searchParams.get("paymentState") ?? "ALL";

  const allowedStatus = new Set(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"]);
  const status = allowedStatus.has(statusParam) ? (statusParam as InvoiceStatus) : undefined;

  const allowedPaymentState = new Set(["ALL", "PAID", "PARTIAL", "UNPAID"]);
  const paymentState = allowedPaymentState.has(paymentStateParam) ? (paymentStateParam as PaymentState) : "ALL";

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);

  // Export more than the on-screen list by default.
  const take = Math.min(Math.max(Number(searchParams.get("take")) || 10000, 1), 20000);

  const invoices = await prisma.invoice.findMany({
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
    include: { customer: { select: { name: true } } },
    take,
  });

  const invoiceIds = invoices.map((i) => i.id);
  const [payAgg, cnAgg] = await Promise.all([
    invoiceIds.length
      ? prisma.invoicePayment.groupBy({
          by: ["invoiceId"],
          where: { companyId, invoiceId: { in: invoiceIds } },
          _sum: { amountBase: true },
        })
      : [],
    invoiceIds.length
      ? prisma.creditNote.groupBy({
          by: ["invoiceId"],
          where: { companyId, invoiceId: { in: invoiceIds } },
          _sum: { totalBase: true },
        })
      : [],
  ]);
  const receivedByInvoiceId = new Map<string, Prisma.Decimal>();
  for (const row of payAgg) {
    receivedByInvoiceId.set(row.invoiceId, new Prisma.Decimal(row._sum.amountBase ?? 0));
  }
  const creditedByInvoiceId = new Map<string, Prisma.Decimal>();
  for (const row of cnAgg) {
    creditedByInvoiceId.set(row.invoiceId, new Prisma.Decimal(row._sum.totalBase ?? 0));
  }

  const closedStatuses = new Set(["CLOSED", "WRITTEN_OFF", "CANCELLED"]);
  const rows = invoices
    .map((inv) => {
      const isClosed = closedStatuses.has(inv.status);
      const receivedBase = receivedByInvoiceId.get(inv.id) ?? new Prisma.Decimal(0);
      const creditedBase = creditedByInvoiceId.get(inv.id) ?? new Prisma.Decimal(0);
      const totalBase = new Prisma.Decimal(inv.totalBase);
      const remainingBase = isClosed ? new Prisma.Decimal(0) : totalBase.sub(receivedBase).sub(creditedBase);
      const ps = isClosed ? ("SETTLED" as const) : paymentStateOf(totalBase, receivedBase.plus(creditedBase));
      return { inv, receivedBase, creditedBase, remainingBase, paymentState: ps };
    })
    .filter((r) => (paymentState === "ALL" ? true : r.paymentState === paymentState))
    .map(({ inv, receivedBase, creditedBase, remainingBase, paymentState: ps }) => ({
      Date: formatDate(inv.issueDate),
      "Invoice #": inv.invoiceNumber,
      Customer: inv.customer.name,
      Status: inv.status,
      "Payment State": ps,
      "Base Currency": inv.baseCurrencyCode,
      "Total (base)": toNum(inv.totalBase),
      "Received (base)": toNum(receivedBase),
      "Credit Notes (base)": toNum(creditedBase),
      "Remaining (base)": toNum(remainingBase),
    }));

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Message: "(no data)" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invoices");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toISOString().slice(0, 10);
  const filename = `invoices-${today}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
