import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  calculateNumberOfInstallments,
  type InstallmentFrequency,
  toNumber,
} from "@/lib/reports/installment-sales";

import { Prisma } from "@/generated/prisma/client";

type RowData = Record<string, unknown>;

function normKey(k: string) {
  return k
    .toLowerCase()
    .replaceAll(" ", "")
    .replaceAll("_", "")
    .replaceAll("-", "")
    .replaceAll("(", "")
    .replaceAll(")", "")
    .trim();
}

function normalizeRow(row: RowData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[normKey(k)] = v;
  return out;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim() || null;
}

function parseFrequency(v: unknown): InstallmentFrequency | null {
  const s = str(v);
  if (!s) return null;
  const x = s.toLowerCase();
  if (["monthly", "month", "m", "شهري"].includes(x)) return "MONTHLY";
  if (["quarterly", "quarter", "q", "ربعسنوي", "ربع", "ربع سنوي"].includes(x)) return "QUARTERLY";
  if (["annually", "annual", "yearly", "y", "سنوي"].includes(x)) return "ANNUALLY";
  if (["monthly", "quarterly", "annually"].includes(x)) return x.toUpperCase() as InstallmentFrequency;
  if (["MONTHLY", "QUARTERLY", "ANNUALLY"].includes(s)) return s as InstallmentFrequency;
  return null;
}

function parseStatus(v: unknown): "ACTIVE" | "COMPLETED" | "CANCELLED" | null {
  const s = str(v);
  if (!s) return null;
  const x = s.toLowerCase();
  if (["active", "نشط"].includes(x)) return "ACTIVE";
  if (["completed", "complete", "مكتمل"].includes(x)) return "COMPLETED";
  if (["cancelled", "canceled", "ملغي", "ملغى"].includes(x)) return "CANCELLED";
  if (s === "ACTIVE" || s === "COMPLETED" || s === "CANCELLED") return s;
  return null;
}

function parseInvoiceDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;

  // Excel serial date
  if (typeof v === "number") {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, 0, 0, 0, 0));
  }

  const s = str(v);
  if (!s) return null;
  // Expect YYYY-MM-DD
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseCurrency(v: unknown): "IQD" | "USD" | null {
  const s = str(v);
  if (!s) return null;
  const up = s.toUpperCase();
  if (up === "IQD" || up === "USD") return up;
  return null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });
  const companyId = user.companyId;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const arrayBuffer = await (file as Blob).arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let rows: RowData[];
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]!]!;
    rows = XLSX.utils.sheet_to_json<RowData>(ws, { defval: "" });
  } catch {
    return Response.json({ error: "Failed to parse file. Ensure it is a valid .xlsx or .csv file." }, { status: 400 });
  }

  if (rows.length === 0) return Response.json({ error: "File is empty" }, { status: 400 });
  if (rows.length > 2000) return Response.json({ error: "Maximum 2000 rows per import" }, { status: 400 });

  const customers = await prisma.customer.findMany({
    where: { companyId },
    select: { id: true, name: true },
    take: 5000,
  });
  const customerByName = new Map<string, string>();
  for (const c of customers) customerByName.set(c.name.trim().toLowerCase(), c.id);

  const errors: Array<{ row: number; error: string }> = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = normalizeRow(rows[i]!);

    const productName = str(raw.productname);
    const customerName = str(raw.customername) ?? str(raw.customer);
    const invoiceNumber = str(raw.invoicenumber);
    const invoiceDate = parseInvoiceDate(raw.invoicedate);
    const durationMonths = Math.floor(toNumber(raw.durationmonths));
    const currencyCode = parseCurrency(raw.currencycode ?? raw.currency);
    const frequency = parseFrequency(raw.installmentfrequency);
    const status = parseStatus(raw.status) ?? "ACTIVE";

    const totalAmountNum = toNumber(raw.totalamount);

    if (!productName) { errors.push({ row: i + 2, error: "Missing productName" }); continue; }
    if (!customerName) { errors.push({ row: i + 2, error: "Missing customerName" }); continue; }
    if (!invoiceNumber) { errors.push({ row: i + 2, error: "Missing invoiceNumber" }); continue; }
    if (!invoiceDate) { errors.push({ row: i + 2, error: "Invalid invoiceDate" }); continue; }
    if (!Number.isFinite(durationMonths) || durationMonths <= 0) { errors.push({ row: i + 2, error: "Invalid durationMonths" }); continue; }
    if (!Number.isFinite(totalAmountNum) || totalAmountNum <= 0) { errors.push({ row: i + 2, error: "Invalid totalAmount" }); continue; }
    if (!currencyCode) { errors.push({ row: i + 2, error: "Invalid currencyCode" }); continue; }
    if (!frequency) { errors.push({ row: i + 2, error: "Invalid installmentFrequency" }); continue; }

    const customerId = customerByName.get(customerName.trim().toLowerCase());
    if (!customerId) { errors.push({ row: i + 2, error: `Customer not found: ${customerName}` }); continue; }

    const numberOfInstallments = calculateNumberOfInstallments(durationMonths, frequency);
    const total = new Prisma.Decimal(String(totalAmountNum));
    const total6 = total.toDecimalPlaces(6);
    const per6 = total6.div(numberOfInstallments).toDecimalPlaces(6);

    try {
      await prisma.installmentContract.create({
        data: {
          companyId,
          customerId,
          productName,
          invoiceNumber,
          invoiceDate,
          durationMonths,
          totalAmount: total6.toFixed(6),
          currencyCode,
          installmentFrequency: frequency,
          numberOfInstallments,
          amountPerInstallment: per6.toFixed(6),
          status,
        },
        select: { id: true },
      });
      imported++;
    } catch (e) {
      errors.push({ row: i + 2, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return Response.json({ imported, errors }, { status: 200 });
}

export async function GET() {
  const template =
    "productName,customerName,invoiceNumber,invoiceDate,durationMonths,totalAmount,currencyCode,installmentFrequency,status\n" +
    "Example Product,Example Customer,INV-1001,2026-01-15,12,1200,USD,MONTHLY,ACTIVE\n";
  return new Response(template, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="installment-sales-template.csv"',
    },
  });
}
