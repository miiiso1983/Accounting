import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().or(z.literal("")),
  unitPrice: z.string().min(1),
  currencyCode: z.enum(["IQD", "USD"]),
});

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "1";

  const products = await prisma.product.findMany({
    where: { companyId: user.companyId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ name: "asc" }],
    take: 500,
  });

  return Response.json(products.map((p) => ({ ...p, unitPrice: String(p.unitPrice) })));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });

  const body = CreateSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: body.error.issues.map((i) => i.message).join(", ") }, { status: 422 });

  const { name, description, unitPrice, currencyCode } = body.data;

  const product = await prisma.product.create({
    data: {
      companyId: user.companyId,
      name,
      description: description || null,
      unitPrice: parseFloat(unitPrice),
      currencyCode,
    },
  });

  return Response.json({ id: product.id }, { status: 201 });
}

