import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const UpdateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SALES_REP_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const rep = await prisma.salesRepresentative.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { invoices: true } } },
  });

  if (!rep) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(rep);
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SALES_REP_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const existing = await prisma.salesRepresentative.findFirst({ where: { id, companyId: user.companyId }, select: { id: true } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const json = await req.json();
  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, email, phone, isActive } = parsed.data;

  const updated = await prisma.salesRepresentative.update({
    where: { id },
    data: {
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      ...(isActive !== undefined ? { isActive } : {}),
    },
    select: { id: true },
  });

  return Response.json({ id: updated.id });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SALES_REP_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const existing = await prisma.salesRepresentative.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { invoices: true } } },
  });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  if (existing._count.invoices > 0) {
    // Deactivate instead of delete when linked invoices exist
    await prisma.salesRepresentative.update({ where: { id }, data: { isActive: false } });
    return Response.json({ deactivated: true });
  }

  await prisma.salesRepresentative.delete({ where: { id } });
  return Response.json({ success: true });
}

