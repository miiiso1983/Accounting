import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { notifyPaymentReceipt } from "@/lib/payments/notify";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const BodySchema = z.object({
  channel: z.enum(["email", "whatsapp"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_PAYMENT_WRITE) && !hasPermission(session, PERMISSIONS.INVOICE_PAYMENT_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid channel" }, { status: 400 });

  try {
    const result = await notifyPaymentReceipt({ paymentId: id, companyId: user.companyId, channel: parsed.data.channel });
    if (result.success) return Response.json(result, { status: 200 });
    if ("fallbackLink" in result && typeof result.fallbackLink === "string" && result.fallbackLink.length > 0) {
      return Response.json(result, { status: 200 });
    }
    return Response.json(result, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
