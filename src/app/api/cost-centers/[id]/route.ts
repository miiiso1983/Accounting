import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const UpdateSchema = z.object({
  code: z.string().min(1).max(50).transform((s) => s.trim()).optional(),
  name: z.string().min(1).max(200).transform((s) => s.trim()).optional(),
  isActive: z.boolean().optional(),
});

async function getCompanyId(session: { user: { id: string } }) {
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  return user?.companyId ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COST_CENTERS_READ)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company" }, { status: 400 });

  const cc = await prisma.costCenter.findFirst({ where: { id, companyId } });
  if (!cc) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(cc);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COST_CENTERS_WRITE)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company" }, { status: 400 });

  const existing = await prisma.costCenter.findFirst({ where: { id, companyId } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const body = UpdateSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: body.error.issues.map((i) => i.message).join(", ") }, { status: 422 });

  const data: Record<string, unknown> = {};
  if (body.data.code !== undefined) data.code = body.data.code;
  if (body.data.name !== undefined) data.name = body.data.name;
  if (body.data.isActive !== undefined) data.isActive = body.data.isActive;

  try {
    await prisma.costCenter.update({ where: { id }, data });
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COST_CENTERS_WRITE)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company" }, { status: 400 });

  const existing = await prisma.costCenter.findFirst({ where: { id, companyId } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  // Soft delete
  await prisma.costCenter.update({ where: { id }, data: { isActive: false } });
  return Response.json({ ok: true });
}
