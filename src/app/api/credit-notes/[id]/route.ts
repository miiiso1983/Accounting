import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CREDIT_NOTE_READ)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const creditNote = await prisma.creditNote.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      invoice: { select: { id: true, invoiceNumber: true, customer: { select: { id: true, name: true } } } },
      lineItems: true,
      journalEntry: { select: { id: true, entryNumber: true } },
      branch: { select: { code: true, name: true } },
    },
  });

  if (!creditNote) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(creditNote);
}
