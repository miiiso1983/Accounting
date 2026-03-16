import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const UpdateSchema = z.object({
  code: z.string().min(1).max(50).transform((s) => s.trim()).optional(),
  name: z.string().min(1).max(200).transform((s) => s.trim()).optional(),
  address: z.string().max(500).optional().or(z.literal("")),
  phone: z.string().max(100).optional().or(z.literal("")),
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
  if (!hasPermission(session, PERMISSIONS.BRANCHES_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const branch = await prisma.branch.findFirst({ where: { id, companyId } });
  if (!branch) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(branch);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BRANCHES_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const existing = await prisma.branch.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const body = UpdateSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: body.error.issues.map((i) => i.message).join(", ") }, { status: 422 });

  const data: {
    code?: string;
    name?: string;
    address?: string | null;
    phone?: string | null;
    isActive?: boolean;
  } = {};

  if (body.data.code !== undefined) data.code = body.data.code;
  if (body.data.name !== undefined) data.name = body.data.name;
  if (body.data.address !== undefined) data.address = body.data.address.trim() || null;
  if (body.data.phone !== undefined) data.phone = body.data.phone.trim() || null;
  if (body.data.isActive !== undefined) data.isActive = body.data.isActive;

  try {
    await prisma.branch.update({ where: { id }, data });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BRANCHES_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const existing = await prisma.branch.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.branch.delete({ where: { id } });
  return Response.json({ ok: true });
}