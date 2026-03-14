import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const UpdateSchema = z.object({
  name: z.string().min(1),
  companyName: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address1: z.string().optional().or(z.literal("")),
  address2: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
});

async function getCompanyId(session: { user: { id: string } }) {
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  return user?.companyId ?? null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const existing = await prisma.customer.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const parsed = UpdateSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 422 });

  const body = parsed.data;
  await prisma.customer.update({
    where: { id },
    data: {
      name: body.name,
      companyName: body.companyName || null,
      email: body.email || null,
      phone: body.phone || null,
      address1: body.address1 || null,
      address2: body.address2 || null,
      city: body.city || null,
      country: body.country || null,
    },
  });

  return Response.json({ ok: true });
}