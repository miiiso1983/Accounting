import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const BodySchema = z.object({
  roleIds: z.array(z.string()),
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

  const { roleIds } = parsed.data;

  // Replace all roles for this user
  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: targetUserId } }),
    ...(roleIds.length > 0
      ? [prisma.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: targetUserId, roleId })) })]
      : []),
  ]);

  return Response.json({ ok: true });
}

