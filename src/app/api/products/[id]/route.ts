import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  unitPrice: z.string().optional(),
  currencyCode: z.enum(["IQD", "USD"]).optional(),
  isActive: z.boolean().optional(),
  costCenterId: z.string().optional().or(z.literal("")),
  revenueAccountId: z.string().optional().or(z.literal("")),
});

async function getCompanyId(session: { user: { id: string } }) {
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  return user?.companyId ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company" }, { status: 400 });

  const product = await prisma.product.findFirst({ where: { id, companyId } });
  if (!product) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ ...product, unitPrice: String(product.unitPrice) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company" }, { status: 400 });

  const existing = await prisma.product.findFirst({ where: { id, companyId } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const body = UpdateSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: body.error.issues.map((i) => i.message).join(", ") }, { status: 422 });

  const data: Record<string, unknown> = {};
  if (body.data.name !== undefined) data.name = body.data.name;
  if (body.data.description !== undefined) data.description = body.data.description || null;
  if (body.data.unitPrice !== undefined) data.unitPrice = parseFloat(body.data.unitPrice);
  if (body.data.currencyCode !== undefined) data.currencyCode = body.data.currencyCode;
  if (body.data.isActive !== undefined) data.isActive = body.data.isActive;

  if (body.data.costCenterId !== undefined) {
    const requestedCostCenterId = body.data.costCenterId?.trim();
    if (!requestedCostCenterId) {
      data.costCenterId = null;
    } else {
      const cc = await prisma.costCenter.findFirst({
        where: { id: requestedCostCenterId, companyId, isActive: true },
        select: { id: true },
      });
      if (!cc) return Response.json({ error: "Cost center not found" }, { status: 400 });
      data.costCenterId = cc.id;
    }
  }

  if (body.data.revenueAccountId !== undefined) {
    const requestedRevenueAccountId = body.data.revenueAccountId?.trim();
    if (!requestedRevenueAccountId) {
      data.revenueAccountId = null;
    } else {
      const acc = await prisma.glAccount.findFirst({
				where: { id: requestedRevenueAccountId, companyId, isPosting: true },
        select: { id: true },
      });
			if (!acc) return Response.json({ error: "Linked account not found or not a posting account" }, { status: 400 });
      data.revenueAccountId = acc.id;
    }
  }

  await prisma.product.update({ where: { id }, data });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company" }, { status: 400 });

  const existing = await prisma.product.findFirst({ where: { id, companyId } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  // Soft delete
  await prisma.product.update({ where: { id }, data: { isActive: false } });
  return Response.json({ ok: true });
}

