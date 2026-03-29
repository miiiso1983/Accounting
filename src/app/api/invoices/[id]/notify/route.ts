import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { generateInvoicePdf } from "@/lib/invoices/pdf";
import { buildPublicInvoiceUrl } from "@/lib/invoices/public-link";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { sendEmail, buildInvoiceCreatedEmail } from "@/lib/notifications/email";
import { sendWhatsApp, buildInvoiceCreatedMessage, generateWhatsAppLink } from "@/lib/notifications/whatsapp";

const BodySchema = z.object({
  channel: z.enum(["email", "whatsapp"]),
});

function formatDate(value: Date) {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const year = value.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  const canNotify = hasPermission(session, PERMISSIONS.INVOICE_WRITE) || hasPermission(session, PERMISSIONS.INVOICE_SEND);
  if (!canNotify) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: user.companyId },
    include: { customer: true, company: true, lineItems: true },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });

  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid channel" }, { status: 400 });

  const { channel } = parsed.data;
  const invoiceUrl = buildPublicInvoiceUrl(invoice.id);

  const notifData = {
    companyName: invoice.company.name,
    customerName: invoice.customer.name,
    invoiceNumber: invoice.invoiceNumber,
    total: Number(invoice.total).toLocaleString(undefined, { maximumFractionDigits: 2 }),
    currencyCode: invoice.currencyCode,
    invoiceUrl,
  };
  const issueDate = formatDate(invoice.issueDate);
  const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : undefined;

  if (channel === "email") {
    if (!invoice.customer.email) {
      return Response.json({ error: "Customer has no email address" }, { status: 400 });
    }
    const pdfBuffer = await generateInvoicePdf({
      companyName: invoice.company.name,
      customerName: invoice.customer.name,
      customerEmail: invoice.customer.email,
      customerPhone: invoice.customer.phone,
      customerAddressLines: [invoice.customer.address1, invoice.customer.address2, invoice.customer.city, invoice.customer.country].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ),
      invoiceNumber: invoice.invoiceNumber,
      issueDate,
      dueDate,
      status: invoice.status,
      currencyCode: invoice.currencyCode,
      paymentTerms: invoice.paymentTerms,
      subtotal: Number(invoice.subtotal),
      discountAmount: Number(invoice.discountAmount),
      discountLabel:
        invoice.discountAmount.gt(0) && invoice.discountType === "PERCENTAGE"
          ? `Discount (${Number(invoice.discountValue).toLocaleString(undefined, { maximumFractionDigits: 2 })}%)`
          : "Discount",
      taxTotal: Number(invoice.taxTotal),
      total: Number(invoice.total),
      invoiceUrl,
      lineItems: invoice.lineItems.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        taxRate: item.taxRate ? Number(item.taxRate) : null,
        lineTotal: Number(item.lineTotal),
      })),
    });
    const { subject, html } = buildInvoiceCreatedEmail({ ...notifData, issueDate, dueDate });
    const result = await sendEmail({
      to: invoice.customer.email,
      subject,
      html,
      attachments: [{ filename: `invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
    });
    if (!result.ok) {
      return Response.json({ error: `Failed to send email: ${result.error}` }, { status: 500 });
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

