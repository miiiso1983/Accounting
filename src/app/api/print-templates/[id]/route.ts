import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { PRINT_TEMPLATE_TYPES, type PrintTemplateTypeValue } from "@/lib/settings/print-templates";

const UpdateSchema = z.object({
  name: z.string().min(1).max(150).transform((s) => s.trim()).optional(),
  type: z.enum(PRINT_TEMPLATE_TYPES).optional(),
  headerHtml: z.string().max(20000).optional(),
  footerHtml: z.string().max(20000).optional(),
  logoUrl: z.string().max(1000).optional().or(z.literal("")),
  isDefault: z.boolean().optional(),
});

async function getCompanyId(session: { user: { id: string } }) {
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  return user?.companyId ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const template = await prisma.printTemplate.findFirst({ where: { id, companyId } });
  if (!template) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(template);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const existing = await prisma.printTemplate.findFirst({ where: { id, companyId } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const body = UpdateSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: body.error.issues.map((i) => i.message).join(", ") }, { status: 422 });

  const nextType = (body.data.type ?? existing.type) as PrintTemplateTypeValue;
  const nextIsDefault = body.data.isDefault ?? existing.isDefault;
  const data: {
    name?: string;
    type?: PrintTemplateTypeValue;
    headerHtml?: string;
    footerHtml?: string;
    logoUrl?: string | null;
    isDefault?: boolean;
  } = {};

  if (body.data.name !== undefined) data.name = body.data.name;
  if (body.data.type !== undefined) data.type = body.data.type;
  if (body.data.headerHtml !== undefined) data.headerHtml = body.data.headerHtml;
  if (body.data.footerHtml !== undefined) data.footerHtml = body.data.footerHtml;
  if (body.data.logoUrl !== undefined) data.logoUrl = body.data.logoUrl.trim() || null;
  if (body.data.isDefault !== undefined) data.isDefault = body.data.isDefault;

  try {
    if (nextIsDefault) {
      await prisma.$transaction(async (tx) => {
        await tx.printTemplate.updateMany({
          where: { companyId, type: nextType, NOT: { id } },
          data: { isDefault: false },
        });

        await tx.printTemplate.update({ where: { id }, data: { ...data, isDefault: true } });
      });
    } else {
      await prisma.printTemplate.update({ where: { id }, data: { ...data, isDefault: false } });
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = await getCompanyId(session);
  if (!companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const existing = await prisma.printTemplate.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.printTemplate.delete({ where: { id } });
  return Response.json({ ok: true });
}