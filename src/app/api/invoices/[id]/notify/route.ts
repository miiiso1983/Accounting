import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { sendEmail, buildInvoiceCreatedEmail } from "@/lib/notifications/email";
import { sendWhatsApp, buildInvoiceCreatedMessage, generateWhatsAppLink } from "@/lib/notifications/whatsapp";

const BodySchema = z.object({
  channel: z.enum(["email", "whatsapp"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: user.companyId },
    include: { customer: true, company: true },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });

  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid channel" }, { status: 400 });

  const { channel } = parsed.data;
  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "https://phpstack-1510634-6273369.cloudwaysapps.com";
  const invoiceUrl = `${baseUrl}/app/invoices/${invoice.id}/preview`;

  const notifData = {
    companyName: invoice.company.name,
    customerName: invoice.customer.name,
    invoiceNumber: invoice.invoiceNumber,
    total: Number(invoice.total).toLocaleString(undefined, { maximumFractionDigits: 2 }),
    currencyCode: invoice.currencyCode,
    invoiceUrl,
  };

  if (channel === "email") {
    if (!invoice.customer.email) {
      return Response.json({ error: "Customer has no email address" }, { status: 400 });
    }
    const { subject, html } = buildInvoiceCreatedEmail({ ...notifData, issueDate: invoice.issueDate.toISOString().slice(0, 10), dueDate: invoice.dueDate?.toISOString().slice(0, 10) });
    const result = await sendEmail({ to: invoice.customer.email, subject, html });
    if (!result) {
      return Response.json({ error: "Failed to send email. Check SMTP configuration." }, { status: 500 });
    }
    return Response.json({ success: true, messageId: result.messageId });
  }

  if (channel === "whatsapp") {
    if (!invoice.customer.phone) {
      return Response.json({ error: "Customer has no phone number" }, { status: 400 });
    }
    const message = buildInvoiceCreatedMessage(notifData);

    // Try API first
    const sent = await sendWhatsApp({ to: invoice.customer.phone, message });
    if (sent) {
      return Response.json({ success: true });
    }

    // Fallback: return wa.me link
    const link = generateWhatsAppLink(invoice.customer.phone, message);
    return Response.json({ success: false, fallbackLink: link, message: "WhatsApp API not configured. Use the link to send manually." });
  }

  return Response.json({ error: "Unknown channel" }, { status: 400 });
}

