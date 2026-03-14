import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth/options"
import { readStoredAttachment } from "@/lib/attachments/storage"
import { prisma } from "@/lib/db/prisma"
import { hasPermission, type SessionAuthz } from "@/lib/rbac/authorize"
import { PERMISSIONS } from "@/lib/rbac/permissions"

export const runtime = "nodejs"

function canReadAttachment(session: SessionAuthz | null | undefined, ownerType: "EXPENSE" | "INVOICE") {
  if (hasPermission(session, PERMISSIONS.ATTACHMENT_READ)) return true
  return ownerType === "EXPENSE"
    ? hasPermission(session, PERMISSIONS.EXPENSE_READ)
    : hasPermission(session, PERMISSIONS.INVOICE_READ)
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } })
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 })

  const attachment = await prisma.attachment.findFirst({
    where: { id, companyId: user.companyId },
    select: {
      originalName: true,
      mimeType: true,
      storageKey: true,
      ownerType: true,
    },
  })

  if (!attachment) return Response.json({ error: "Not found" }, { status: 404 })
  if (!canReadAttachment(session, attachment.ownerType)) {
    return Response.json({ error: "Not authorized" }, { status: 403 })
  }

  let content: Buffer
  try {
    content = await readStoredAttachment(attachment.storageKey)
  } catch {
    return Response.json({ error: "Attachment file not found" }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const disposition = searchParams.get("download") === "1" ? "attachment" : "inline"

  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  })
}