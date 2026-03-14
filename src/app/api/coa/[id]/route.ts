import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const normalBalanceForType = {
  ASSET: "DEBIT",
  EXPENSE: "DEBIT",
  LIABILITY: "CREDIT",
  EQUITY: "CREDIT",
  INCOME: "CREDIT",
} as const;

const SUBTYPES_BY_TYPE = {
  ASSET: ["أصول متداولة", "أصول ثابتة", "أصول أخرى"],
  LIABILITY: ["التزامات متداولة", "التزامات طويلة الأجل", "التزامات أخرى"],
  EQUITY: ["رأس المال", "الأرباح المحتجزة", "حقوق ملكية أخرى"],
  INCOME: ["إيرادات تشغيلية", "إيرادات أخرى"],
  EXPENSE: ["مصروفات تشغيلية", "مصروفات إدارية", "مصروفات أخرى"],
} as const;

const UpdateSchema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(200).optional(),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]).optional(),
  subType: z.string().max(200).optional().nullable(),
  isPosting: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COA_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { companyId: true },
  });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });

  const account = await prisma.glAccount.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const { code, name, type, subType, isPosting } = parsed.data;

  const effectiveType = type ?? (account.type as keyof typeof SUBTYPES_BY_TYPE);
  if (subType) {
    const allowed = SUBTYPES_BY_TYPE[effectiveType] as readonly string[];
    if (!allowed.includes(subType)) {
      return Response.json({ error: { fieldErrors: { subType: ["Invalid subType for selected type"] } } }, { status: 422 });
    }
  }
  if (type && subType === undefined && account.subType) {
    const allowed = SUBTYPES_BY_TYPE[effectiveType] as readonly string[];
    if (!allowed.includes(account.subType)) {
      return Response.json({ error: { fieldErrors: { subType: ["Please select a subType for the new type (or set it to empty)"] } } }, { status: 422 });
    }
  }

  // Check code uniqueness if changing code
  if (code && code !== account.code) {
    const existing = await prisma.glAccount.findFirst({
      where: { companyId: user.companyId, code, NOT: { id } },
    });
    if (existing) return Response.json({ error: `Code "${code}" already in use` }, { status: 409 });
  }

  const updated = await prisma.glAccount.update({
    where: { id },
    data: {
      ...(code ? { code } : {}),
      ...(name ? { name } : {}),
      ...(type ? { type, normalBalance: normalBalanceForType[type] } : {}),
      ...(subType !== undefined ? { subType } : {}),
      ...(isPosting !== undefined ? { isPosting } : {}),
    },
  });

  return Response.json({ account: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COA_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { companyId: true },
  });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });

  const account = await prisma.glAccount.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { children: true, journalLines: true, expenses: true } } },
  });
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

  if (account._count.children > 0) {
    return Response.json({ error: "Cannot delete account with sub-accounts" }, { status: 409 });
  }
  if (account._count.journalLines > 0 || account._count.expenses > 0) {
    return Response.json({ error: "Cannot delete account with existing transactions" }, { status: 409 });
  }

  await prisma.glAccount.delete({ where: { id } });
  return Response.json({ ok: true });
}

