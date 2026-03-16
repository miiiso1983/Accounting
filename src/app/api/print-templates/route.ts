import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { PRINT_TEMPLATE_TYPES, type PrintTemplateTypeValue } from "@/lib/settings/print-templates";

const CreateSchema = z.object({
  name: z.string().min(1).max(150).transform((s) => s.trim()),
  type: z.enum(PRINT_TEMPLATE_TYPES),
  headerHtml: z.string().max(20000),
  footerHtml: z.string().max(20000),
  logoUrl: z.string().max(1000).optional().or(z.literal("")),
  isDefault: z.boolean().optional(),
});

async function getCompanyId(session: { user: { id: string } }) {
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  return user?.companyId ?? null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const templates = await prisma.printTemplate.findMany({
    where: { companyId },
    orderBy: [{ type: "asc" }, { isDefault: "desc" }, { name: "asc" }],
  });

  return Response.json(templates);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const body = CreateSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: body.error.issues.map((i) => i.message).join(", ") }, { status: 422 });

  try {
    const hasDefault = await prisma.printTemplate.findFirst({
      where: { companyId, type: body.data.type, isDefault: true },
      select: { id: true },
    });

    const shouldBeDefault = body.data.isDefault || !hasDefault;
    const createData = {
      companyId,
      name: body.data.name,
      type: body.data.type,
      headerHtml: body.data.headerHtml,
      footerHtml: body.data.footerHtml,
      logoUrl: body.data.logoUrl?.trim() || null,
      isDefault: shouldBeDefault,
    };

    const created = shouldBeDefault
      ? await prisma.$transaction(async (tx) => {
          await tx.printTemplate.updateMany({
            where: { companyId, type: body.data.type },
            data: { isDefault: false },
          });

          return tx.printTemplate.create({ data: createData, select: { id: true } });
        })
      : await prisma.printTemplate.create({ data: createData, select: { id: true } });

    return Response.json({ id: created.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}