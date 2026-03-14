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

const CreateSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
  subType: z.string().max(200).optional().nullable(),
  isPosting: z.boolean().default(true),
  parentId: z.string().optional().nullable(),
}).superRefine((val, ctx) => {
  if (val.subType) {
    const allowed = SUBTYPES_BY_TYPE[val.type] as readonly string[];
    if (!allowed.includes(val.subType)) {
      ctx.addIssue({ code: "custom", path: ["subType"], message: "Invalid subType for selected type" });
    }
  }
});

export async function GET(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COA_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { companyId: true },
  });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });

  const accounts = await prisma.glAccount.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true, type: true, subType: true, normalBalance: true, isPosting: true, parentId: true },
  });

  return Response.json({ accounts });
}

export async function POST(req: Request) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const { code, name, type, subType, isPosting, parentId } = parsed.data;

  // Validate parent belongs to same company
  if (parentId) {
    const parent = await prisma.glAccount.findFirst({
      where: { id: parentId, companyId: user.companyId },
    });
    if (!parent) return Response.json({ error: "Parent account not found" }, { status: 404 });
  }

  // Check code uniqueness
  const existing = await prisma.glAccount.findFirst({
    where: { companyId: user.companyId, code },
  });
  if (existing) return Response.json({ error: `Code "${code}" already in use` }, { status: 409 });

  const account = await prisma.glAccount.create({
    data: {
      companyId: user.companyId,
      code,
      name,
      type,
      subType: subType ?? null,
      normalBalance: normalBalanceForType[type],
      isPosting,
      parentId: parentId ?? null,
    },
  });

  return Response.json({ account }, { status: 201 });
}

