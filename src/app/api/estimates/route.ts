import { getServerSession } from "next-auth";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { INTERACTIVE_TRANSACTION_OPTIONS, readTransactionErrorMessage } from "@/lib/db/interactive-transaction";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const BodySchema = z.object({
  estimateNumber: z.string().min(1),
  customerId: z.string().min(1),
  issueDate: z.string().min(1),
  expiryDate: z.string().optional().or(z.literal("")),
  currencyCode: z.enum(["IQD", "USD"]),
  exchangeRate: z.object({ rate: z.string().min(1) }).optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  discountValue: z.string().optional().or(z.literal("")),
  note: z.string().optional().or(z.literal("")),
  branchId: z.string().optional().or(z.literal("")),
  mode: z.enum(["DRAFT", "SEND"]),
  lines: z.array(z.object({
    description: z.string().min(1),
    costCenterId: z.string().optional().or(z.literal("")),
    productId: z.string().optional().or(z.literal("")),
    quantity: z.string().min(1),
    unitPrice: z.string().min(1),
    discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
    discountValue: z.string().optional().or(z.literal("")),
    taxRate: z.string().optional().or(z.literal("")),
  })).min(1),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ESTIMATE_READ)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const latestEstimate = await prisma.estimate.findFirst({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
    select: { estimateNumber: true },
    take: 1,
  });

  let nextNumber = "EST-0001";
  if (latestEstimate?.estimateNumber) {
    const match = latestEstimate.estimateNumber.match(/([0-9]+)$/);
    if (match) {
      const num = parseInt(match[1], 10) + 1;
      const prefix = latestEstimate.estimateNumber.slice(0, -match[1].length);
      nextNumber = prefix + String(num).padStart(match[1].length, "0");
    }
  }

  return Response.json({ nextNumber });
}


export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ESTIMATE_WRITE)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { id: true, baseCurrencyCode: true } });
  if (!company) return Response.json({ error: "Company not found" }, { status: 400 });

  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  const requestedBranchId = body.branchId?.trim() || null;
  const issueDate = new Date(`${body.issueDate}T00:00:00.000Z`);
  const expiryDate = body.expiryDate ? new Date(`${body.expiryDate}T00:00:00.000Z`) : null;
  const baseCurrencyCode = company.baseCurrencyCode;
  const estimateCurrency = body.currencyCode;

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (requestedBranchId) {
        const b = await tx.branch.findFirst({ where: { id: requestedBranchId, companyId: company.id }, select: { id: true } });
        if (!b) throw new Error("Invalid branch");
      }

      const customer = await tx.customer.findFirst({ where: { id: body.customerId, companyId: company.id }, select: { id: true } });
      if (!customer) throw new Error("Customer not found");

      const costCenterIds = Array.from(new Set(body.lines.map((l) => (l.costCenterId ?? "").trim()).filter(Boolean)));
      if (costCenterIds.length > 0) {
        const found = await tx.costCenter.findMany({ where: { companyId: company.id, id: { in: costCenterIds } }, select: { id: true } });
        if (found.length !== costCenterIds.length) throw new Error("Invalid cost center");
      }

      let exchangeRateId: string | null = null;
      let rateDecimal: Prisma.Decimal | null = null;
      if (estimateCurrency !== baseCurrencyCode) {
        const rateStr = body.exchangeRate?.rate;
        if (!rateStr) throw new Error("Exchange rate is required when estimate currency != base currency");
        rateDecimal = new Prisma.Decimal(rateStr);
        if (rateDecimal.lte(0)) throw new Error("Exchange rate must be > 0");

        const fx = await tx.exchangeRate.create({
          data: {
            companyId: company.id,
            baseCurrencyCode: estimateCurrency,
            quoteCurrencyCode: baseCurrencyCode,
            rate: rateStr,
            effectiveAt: issueDate,
            source: "estimate-manual",
          },
          select: { id: true },
        });
        exchangeRateId = fx.id;
      }

      const zero = new Prisma.Decimal(0);
      const computedLines = body.lines.map((l) => {
        const qty = new Prisma.Decimal(l.quantity);
        const price = new Prisma.Decimal(l.unitPrice);
        if (qty.lte(0)) throw new Error("Quantity must be > 0");
        if (price.lt(0)) throw new Error("Unit price must be >= 0");

        const grossTotal = qty.mul(price);
        const lineDiscountType = l.discountType ?? null;
        const lineDiscountValue = l.discountValue ? new Prisma.Decimal(l.discountValue) : zero;
        let lineDiscountAmount = zero;
        if (lineDiscountType === "PERCENTAGE" && lineDiscountValue.gt(0)) {
          lineDiscountAmount = grossTotal.mul(lineDiscountValue).div(100).toDecimalPlaces(6);
        } else if (lineDiscountType === "FIXED" && lineDiscountValue.gt(0)) {
          lineDiscountAmount = lineDiscountValue.toDecimalPlaces(6);
        }
        const lineTotal = grossTotal.minus(lineDiscountAmount);

        const taxRate = l.taxRate ? new Prisma.Decimal(l.taxRate) : null;
        if (taxRate && taxRate.lt(0)) throw new Error("Tax rate must be >= 0");
        const lineTax = taxRate ? lineTotal.mul(taxRate) : zero;
        const costCenterId = l.costCenterId?.trim() || null;
        const productId = l.productId?.trim() || null;

        return { description: l.description, costCenterId, productId, quantity: qty, unitPrice: price, discountType: lineDiscountType, discountValue: lineDiscountValue, lineTotal, taxRate, lineTax };
      });

      const subtotal = computedLines.reduce((acc, l) => acc.plus(l.lineTotal), zero).toDecimalPlaces(6);

      let discountAmount = zero;
      const discountType = body.discountType ?? null;
      const discountValue = body.discountValue ? new Prisma.Decimal(body.discountValue) : zero;
      if (discountType === "PERCENTAGE" && discountValue.gt(0)) {
        discountAmount = subtotal.mul(discountValue).div(100).toDecimalPlaces(6);
      } else if (discountType === "FIXED" && discountValue.gt(0)) {
        discountAmount = discountValue.toDecimalPlaces(6);
      }
      const afterDiscount = subtotal.minus(discountAmount);

      const taxTotal = computedLines.reduce((acc, l) => acc.plus(l.lineTax), zero).toDecimalPlaces(6);
      const total = afterDiscount.plus(taxTotal).toDecimalPlaces(6);

      const mulToBase = (amt: Prisma.Decimal) => {
        if (estimateCurrency === baseCurrencyCode) return amt;
        if (!rateDecimal) throw new Error("Missing exchange rate");
        return amt.mul(rateDecimal);
      };

      const subtotalBase = mulToBase(subtotal).toDecimalPlaces(6);
      const discountAmountBase = mulToBase(discountAmount).toDecimalPlaces(6);
      const taxTotalBase = mulToBase(taxTotal).toDecimalPlaces(6);
      const totalBase = mulToBase(total).toDecimalPlaces(6);

      const estimate = await tx.estimate.create({
        data: {
          companyId: company.id,
          branchId: requestedBranchId,
          customerId: customer.id,
          estimateNumber: body.estimateNumber,
          status: body.mode === "SEND" ? "SENT" : "DRAFT",
          issueDate,
          expiryDate,
          currencyCode: estimateCurrency,
          baseCurrencyCode,
          exchangeRateId,
          subtotal: subtotal.toFixed(6),
          discountType,
          discountValue: discountValue.toFixed(6),
          discountAmount: discountAmount.toFixed(6),
          taxTotal: taxTotal.toFixed(6),
          total: total.toFixed(6),
          subtotalBase: subtotalBase.toFixed(6),
          discountAmountBase: discountAmountBase.toFixed(6),
          taxTotalBase: taxTotalBase.toFixed(6),
          totalBase: totalBase.toFixed(6),
          note: body.note?.trim() || null,
          createdById: session.user.id,
          lineItems: {
            create: computedLines.map((l) => ({
              description: l.description,
              costCenterId: l.costCenterId,
              productId: l.productId,
              quantity: l.quantity.toDecimalPlaces(6).toFixed(6),
              unitPrice: l.unitPrice.toDecimalPlaces(6).toFixed(6),
              discountType: l.discountType,
              discountValue: l.discountValue.toDecimalPlaces(6).toFixed(6),
              lineTotal: l.lineTotal.toDecimalPlaces(6).toFixed(6),
              taxRate: l.taxRate ? l.taxRate.toDecimalPlaces(6).toFixed(6) : null,
            })),
          },
        },
        select: { id: true },
      });

      return estimate;
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    return Response.json({ id: created.id }, { status: 201 });
  } catch (e) {
    const message = readTransactionErrorMessage(e);
    return Response.json({ error: message }, { status: 400 });
  }
}