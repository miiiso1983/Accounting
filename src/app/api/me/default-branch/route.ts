import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";

const BodySchema = z.object({
  defaultBranchId: z.string().optional().nullable().or(z.literal("")),
});

/**
 * PUT /api/me/default-branch
 * Sets the current user's default branch (nullable).
 */
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const raw = parsed.data.defaultBranchId;
  const requested = typeof raw === "string" ? raw.trim() : raw;
  const nextDefaultBranchId = requested ? requested : null;

  if (nextDefaultBranchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: nextDefaultBranchId, companyId: user.companyId },
      select: { id: true },
    });
    if (!branch) return Response.json({ error: "Invalid branch" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { defaultBranchId: nextDefaultBranchId },
    select: { id: true },
  });

  return Response.json({ ok: true, defaultBranchId: nextDefaultBranchId }, { status: 200 });
}
