import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ESTIMATE_WRITE)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const estimate = await prisma.estimate.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true, status: true },
  });

  if (!estimate) return Response.json({ error: "Not found" }, { status: 404 });
  if (estimate.status !== "DRAFT") return Response.json({ error: "Only DRAFT estimates can be sent" }, { status: 400 });

  await prisma.estimate.update({ where: { id }, data: { status: "SENT" } });

  return Response.json({ success: true });
}
