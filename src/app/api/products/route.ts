import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().or(z.literal("")),
  unitPrice: z.string().min(1),
  currencyCode: z.enum(["IQD", "USD"]),
  costCenterId: z.string().optional().or(z.literal("")),
  revenueAccountId: z.string().optional().or(z.literal("")),
});

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "1";

  const products = await prisma.product.findMany({
    where: { companyId: user.companyId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ name: "asc" }],
    take: 500,
  });

  return Response.json(products.map((p) => ({ ...p, unitPrice: String(p.unitPrice) })));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });

  const body = CreateSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: body.error.issues.map((i) => i.message).join(", ") }, { status: 422 });

  const { name, description, unitPrice, currencyCode } = body.data;

  let costCenterId: string | null = null;
  const requestedCostCenterId = body.data.costCenterId?.trim();
  if (requestedCostCenterId) {
    const cc = await prisma.costCenter.findFirst({
      where: { id: requestedCostCenterId, companyId: user.companyId, isActive: true },
      select: { id: true },
    });
    if (!cc) return Response.json({ error: "Cost center not found" }, { status: 400 });
    costCenterId = cc.id;
  }

  let revenueAccountId: string | null = null;
  const requestedRevenueAccountId = body.data.revenueAccountId?.trim();
  if (requestedRevenueAccountId) {
    const acc = await prisma.glAccount.findFirst({
			where: { id: requestedRevenueAccountId, companyId: user.companyId, isPosting: true },
      select: { id: true },
    });
		if (!acc) return Response.json({ error: "Linked account not found or not a posting account" }, { status: 400 });
    revenueAccountId = acc.id;
  }

  const product = await prisma.product.create({
    data: {
      companyId: user.companyId,
      name,
      description: description || null,
      unitPrice: parseFloat(unitPrice),
      currencyCode,
      costCenterId,
      revenueAccountId,
    },
  });

  return Response.json({ id: product.id }, { status: 201 });
}

