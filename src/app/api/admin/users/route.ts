import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.USERS_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const users = await prisma.user.findMany({
    where: { companyId: user.companyId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
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

  return Response.json({ users, roles });
}

