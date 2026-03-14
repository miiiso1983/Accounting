import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  calculateNumberOfInstallments,
  type InstallmentFrequency,
} from "@/lib/reports/installment-sales";

import { Prisma } from "@/generated/prisma/client";

const CreateSchema = z.object({
  productName: z.string().min(1).max(200),
  customerId: z.string().min(1),
  invoiceNumber: z.string().min(1).max(80),
  invoiceDate: z.string().min(1), // YYYY-MM-DD
  durationMonths: z.coerce.number().int().min(1).max(600),
  totalAmount: z.string().min(1),
  currencyCode: z.enum(["IQD", "USD"]),
  installmentFrequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUALLY"]),
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
});

function parseYmdDate(ymd: string) {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid invoiceDate");
  return d;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const take = Math.min(Math.max(Number(searchParams.get("take")) || 200, 1), 1000);

  const rows = await prisma.installmentContract.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ invoiceDate: "desc" }],
    take,
    select: {
      id: true,
      productName: true,
      invoiceNumber: true,
      invoiceDate: true,
      durationMonths: true,
      totalAmount: true,
      currencyCode: true,
      installmentFrequency: true,
      numberOfInstallments: true,
      amountPerInstallment: true,
      status: true,
      customer: { select: { id: true, name: true } },
    },
  });

  return Response.json(
    rows.map((r) => ({
      ...r,
      totalAmount: String(r.totalAmount),
      amountPerInstallment: String(r.amountPerInstallment),
    })),
  );
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });
  const companyId = user.companyId;

  const body = CreateSchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.issues.map((i) => i.message).join(", ") }, { status: 422 });
  }

  const invoiceDate = parseYmdDate(body.data.invoiceDate);
  const frequency = body.data.installmentFrequency as InstallmentFrequency;
  const numberOfInstallments = calculateNumberOfInstallments(body.data.durationMonths, frequency);

  let total: Prisma.Decimal;
  try {
    total = new Prisma.Decimal(body.data.totalAmount);
  } catch {
    return Response.json({ error: "Invalid totalAmount" }, { status: 422 });
  }
  if (total.lte(0)) return Response.json({ error: "Total amount must be > 0" }, { status: 422 });

  const total6 = total.toDecimalPlaces(6);
  const per6 = total6.div(numberOfInstallments).toDecimalPlaces(6);

  // Validate customer belongs to the company
  const customer = await prisma.customer.findFirst({
    where: { id: body.data.customerId, companyId },
    select: { id: true },
  });
  if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });

  const existing = await prisma.installmentContract.findFirst({
    where: { companyId, invoiceNumber: body.data.invoiceNumber },
    select: { id: true },
  });
  if (existing) return Response.json({ error: "Invoice number already exists" }, { status: 409 });

  try {
    const created = await prisma.installmentContract.create({
      data: {
        companyId,
        customerId: body.data.customerId,
        productName: body.data.productName,
        invoiceNumber: body.data.invoiceNumber,
        invoiceDate,
        durationMonths: body.data.durationMonths,
        totalAmount: total6.toFixed(6),
        currencyCode: body.data.currencyCode,
        installmentFrequency: body.data.installmentFrequency,
        numberOfInstallments,
        amountPerInstallment: per6.toFixed(6),
        status: body.data.status ?? "ACTIVE",
      },
      select: { id: true },
    });
    return Response.json({ id: created.id }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
