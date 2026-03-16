import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const CreateSchema = z.object({
  code: z.string().min(1).max(50).transform((s) => s.trim()),
  name: z.string().min(1).max(200).transform((s) => s.trim()),
  address: z.string().max(500).optional().or(z.literal("")),
  phone: z.string().max(100).optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});

async function getCompanyId(session: { user: { id: string } }) {
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  return user?.companyId ?? null;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BRANCHES_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "1";

  const branches = await prisma.branch.findMany({
    where: { companyId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
  });

  return Response.json(branches);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BRANCHES_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const body = CreateSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: body.error.issues.map((i) => i.message).join(", ") }, { status: 422 });

  try {
    const created = await prisma.branch.create({
      data: {
        companyId,
        code: body.data.code,
        name: body.data.name,
        address: body.data.address?.trim() || null,
        phone: body.data.phone?.trim() || null,
        isActive: body.data.isActive ?? true,
      },
      select: { id: true },
    });

    return Response.json({ id: created.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}