import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const UpdateUserSchema = z
  .object({
    password: z.string().min(8).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.password !== undefined || data.isActive !== undefined, {
    message: "No changes provided",
  });

async function getSessionCompanyId(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
  return user?.companyId ?? null;
}

async function getCompanyScopedUser(targetUserId: string, companyId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      companyId: true,
      isActive: true,
    },
  });

  if (!user || user.companyId !== companyId) return null;
  return user;
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  createdAt: true,
  permissions: {
    select: {
      permission: { select: { id: true, key: true, description: true } },
    },
  },
  roles: {
    select: {
      role: { select: { id: true, key: true, name: true } },
    },
  },
} as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.USERS_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getSessionCompanyId(session.user.id);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const { id: targetUserId } = await params;
  const targetUser = await getCompanyScopedUser(targetUserId, companyId);
  if (!targetUser) return Response.json({ error: "User not found" }, { status: 404 });

  const json = await req.json();
  const parsed = UpdateUserSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.isActive === false && targetUserId === session.user.id) {
    return Response.json({ error: "You cannot deactivate your own account" }, { status: 400 });
  }

  const data: { passwordHash?: string; isActive?: boolean } = {};

  if (parsed.data.password !== undefined) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }

  if (parsed.data.isActive !== undefined) {
    data.isActive = parsed.data.isActive;
  }

  const user = await prisma.user.update({
    where: { id: targetUserId },
    data,
    select: userSelect,
  });

  return Response.json({ user });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.USERS_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getSessionCompanyId(session.user.id);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const { id: targetUserId } = await params;
  if (targetUserId === session.user.id) {
    return Response.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const targetUser = await getCompanyScopedUser(targetUserId, companyId);
  if (!targetUser) return Response.json({ error: "User not found" }, { status: 404 });

  await prisma.user.delete({ where: { id: targetUserId } });

  return Response.json({ ok: true });
}