import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const CreateSchema = z.object({
  code: z.string().min(1).max(50).transform((s) => s.trim()),
  name: z.string().min(1).max(200).transform((s) => s.trim()),
});

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COST_CENTERS_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "1";

  const centers = await prisma.costCenter.findMany({
    where: {
      companyId: user.companyId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    take: 1000,
  });

  return Response.json(centers);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COST_CENTERS_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });

  const body = CreateSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: body.error.issues.map((i) => i.message).join(", ") }, { status: 422 });

  try {
    const created = await prisma.costCenter.create({
      data: {
        companyId: user.companyId,
        code: body.data.code,
        name: body.data.name,
      },
      select: { id: true },
    });
    return Response.json({ id: created.id }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
