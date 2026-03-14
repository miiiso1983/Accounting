import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const BodySchema = z.object({
  roleIds: z.array(z.string()).default([]),
  permissionIds: z.array(z.string()).default([]),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.USERS_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id: targetUserId } = await params;

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!sessionUser?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  // Ensure target user belongs to same company
  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { companyId: true } });
  if (!targetUser || targetUser.companyId !== sessionUser.companyId) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const roleIds = Array.from(new Set(parsed.data.roleIds));
  const permissionIds = Array.from(new Set(parsed.data.permissionIds));

  const [rolesCount, permissionsCount] = await Promise.all([
    roleIds.length > 0 ? prisma.role.count({ where: { id: { in: roleIds } } }) : Promise.resolve(0),
    permissionIds.length > 0
      ? prisma.permission.count({ where: { id: { in: permissionIds } } })
      : Promise.resolve(0),
  ]);

  if (rolesCount !== roleIds.length || permissionsCount !== permissionIds.length) {
    return Response.json({ error: "Invalid roles or permissions" }, { status: 400 });
  }

  // Replace all roles and direct permissions for this user
  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: targetUserId } }),
    prisma.userPermission.deleteMany({ where: { userId: targetUserId } }),
    ...(roleIds.length > 0
      ? [prisma.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: targetUserId, roleId })) })]
      : []),
    ...(permissionIds.length > 0
      ? [
          prisma.userPermission.createMany({
            data: permissionIds.map((permissionId) => ({ userId: targetUserId, permissionId })),
          }),
        ]
      : []),
  ]);

  return Response.json({ ok: true });
}

