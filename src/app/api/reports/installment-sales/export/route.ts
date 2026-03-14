import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  buildDueDates,
  buildMonthColumns,
  monthKey,
  type CurrencyCode,
  type InstallmentFrequency,
} from "@/lib/reports/installment-sales";

function toNum(d: unknown) {
  const n = Number(String(d));
  return Number.isFinite(n) ? n : 0;
}

type Cur = "ALL" | CurrencyCode;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });
  const companyId = user.companyId;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const customerId = searchParams.get("customerId") ?? undefined;
  const currency = (searchParams.get("currency") ?? "ALL") as Cur;
  const activeOnly = searchParams.get("activeOnly") === "1";

  const monthCols = buildMonthColumns(from, to, 6);
  const endDate = monthCols.length ? monthCols[monthCols.length - 1]!.to : new Date();
  const startDate = monthCols.length ? monthCols[0]!.from : new Date(0);
  const queryStart = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() - 120, 1));

  const contracts = await prisma.installmentContract.findMany({
    where: {
      companyId,
      ...(customerId ? { customerId } : {}),
      ...(activeOnly ? { status: "ACTIVE" } : {}),
      ...(currency !== "ALL" ? { currencyCode: currency } : {}),
      invoiceDate: { gte: queryStart, lte: endDate },
    },
    select: {
      invoiceDate: true,
      totalAmount: true,
      currencyCode: true,
      installmentFrequency: true,
      numberOfInstallments: true,
      amountPerInstallment: true,
      status: true,
      customer: { select: { id: true, name: true } },
    },
    orderBy: [{ customer: { name: "asc" } }, { invoiceDate: "asc" }],
    take: 10000,
  });

  type Cell = { USD: number; IQD: number };
  const zeroCell = (): Cell => ({ USD: 0, IQD: 0 });

  const byCustomer = new Map<
    string,
    { name: string; sales: Record<string, Cell>; due: Record<string, Cell> }
  >();

  const monthKeys = new Set(monthCols.map((m) => m.key));

  for (const c of contracts) {
    const cid = c.customer.id;
    if (!byCustomer.has(cid)) {
      byCustomer.set(cid, { name: c.customer.name, sales: {}, due: {} });
    }
    const entry = byCustomer.get(cid)!;
    const cur = c.currencyCode as CurrencyCode;

    // Sales in invoice month
    const mkSales = monthKey(c.invoiceDate);
    if (monthKeys.has(mkSales)) {
      entry.sales[mkSales] ||= zeroCell();
      entry.sales[mkSales][cur] += toNum(c.totalAmount);
    }

    // Due schedule in months
    const dueDates = buildDueDates(c.invoiceDate, c.numberOfInstallments, c.installmentFrequency as InstallmentFrequency);
    for (const dd of dueDates) {
      const mk = monthKey(dd);
      if (!monthKeys.has(mk)) continue;
      entry.due[mk] ||= zeroCell();
      entry.due[mk][cur] += toNum(c.amountPerInstallment);
    }
  }

  const customers = [...byCustomer.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

  const rows: Record<string, string | number>[] = [];
  for (const [, g] of customers) {
    const row: Record<string, string | number> = { Customer: g.name };

    let totalSalesUSD = 0;
    let totalSalesIQD = 0;
    let totalDueUSD = 0;
    let totalDueIQD = 0;

    for (const mc of monthCols) {
      const s = g.sales[mc.key] ?? zeroCell();
      const d = g.due[mc.key] ?? zeroCell();

      if (currency === "ALL") {
        row[`${mc.label} Sales USD`] = s.USD;
        row[`${mc.label} Sales IQD`] = s.IQD;
        row[`${mc.label} Due USD`] = d.USD;
        row[`${mc.label} Due IQD`] = d.IQD;
	      } else {
	        // Here, `currency` is narrowed to a specific CurrencyCode ("USD" | "IQD")
	        row[`${mc.label} Sales`] = currency === "USD" ? s.USD : s.IQD;
	        row[`${mc.label} Due`] = currency === "USD" ? d.USD : d.IQD;
	      }

      totalSalesUSD += s.USD;
      totalSalesIQD += s.IQD;
      totalDueUSD += d.USD;
      totalDueIQD += d.IQD;
    }

    if (currency === "ALL") {
      row["Total Sales USD"] = totalSalesUSD;
      row["Total Sales IQD"] = totalSalesIQD;
      row["Total Due USD"] = totalDueUSD;
      row["Total Due IQD"] = totalDueIQD;
    } else {
      row["Total Sales"] = currency === "USD" ? totalSalesUSD : totalSalesIQD;
      row["Total Due"] = currency === "USD" ? totalDueUSD : totalDueIQD;
    }

    rows.push(row);
  }

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Customer: "(no data)" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Installment Sales");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename = `installment-sales-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
