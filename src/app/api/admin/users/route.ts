import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const CreateUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(100),
  roleIds: z.array(z.string()).default([]),
  permissionIds: z.array(z.string()).default([]),
});

async function getSessionCompanyId(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
  return user?.companyId ?? null;
}

async function validateAccessIds(roleIds: string[], permissionIds: string[]) {
  const uniqueRoleIds = Array.from(new Set(roleIds));
  const uniquePermissionIds = Array.from(new Set(permissionIds));

  const [rolesCount, permissionsCount] = await Promise.all([
    uniqueRoleIds.length > 0 ? prisma.role.count({ where: { id: { in: uniqueRoleIds } } }) : Promise.resolve(0),
    uniquePermissionIds.length > 0
      ? prisma.permission.count({ where: { id: { in: uniquePermissionIds } } })
      : Promise.resolve(0),
  ]);

  if (rolesCount !== uniqueRoleIds.length || permissionsCount !== uniquePermissionIds.length) {
    return null;
  }

  return { roleIds: uniqueRoleIds, permissionIds: uniquePermissionIds };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.USERS_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getSessionCompanyId(session.user.id);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const users = await prisma.user.findMany({
    where: { companyId },
    select: {
      id: true,
      name: true,
      email: true,
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
    },
    orderBy: { createdAt: "asc" },
  });

  const roles = await prisma.role.findMany({
    select: { id: true, key: true, name: true },
    orderBy: { key: "asc" },
  });

  const permissions = await prisma.permission.findMany({
    select: { id: true, key: true, description: true },
    orderBy: { key: "asc" },
  });

  return Response.json({ users, roles, permissions });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.USERS_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getSessionCompanyId(session.user.id);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const json = await req.json();
  const parsed = CreateUserSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const access = await validateAccessIds(parsed.data.roleIds, parsed.data.permissionIds);
  if (!access) return Response.json({ error: "Invalid roles or permissions" }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) return Response.json({ error: "Email already exists" }, { status: 409 });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const user = await prisma.user.create({
    data: {
      companyId,
      name: parsed.data.name.trim(),
      email,
      passwordHash,
      roles:
        access.roleIds.length > 0
          ? { create: access.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      permissions:
        access.permissionIds.length > 0
          ? { create: access.permissionIds.map((permissionId) => ({ permissionId })) }
          : undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
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
    },
  });

  return Response.json({ user }, { status: 201 });
}

