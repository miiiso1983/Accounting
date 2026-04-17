import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CREDIT_NOTE_READ)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const creditNotes = await prisma.creditNote.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    include: {
      invoice: { select: { id: true, invoiceNumber: true, customer: { select: { id: true, name: true } } } },
      branch: { select: { code: true, name: true } },
    },
    take: 200,
  });

  return Response.json(creditNotes);
}
