import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildPublicInvoiceUrl } from "@/lib/invoices/public-link";
import { sendEmail, buildPaymentReceivedEmail } from "@/lib/notifications/email";
import { buildPaymentReceivedMessage, generateWhatsAppLink, sendWhatsApp } from "@/lib/notifications/whatsapp";
import { buildPublicReceiptUrl } from "@/lib/payments/public-link";

import { generatePaymentReceiptPdf } from "./pdf";

export type NotifyPaymentChannel = "email" | "whatsapp";

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatAmount(value: Prisma.Decimal) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export async function notifyPaymentReceipt(args: {
  paymentId: string;
  companyId: string;
  channel: NotifyPaymentChannel;
}) {
  const payment = await prisma.invoicePayment.findFirst({
    where: { id: args.paymentId, companyId: args.companyId },
    include: {
      invoice: { include: { company: true, customer: true } },
    },
  });

  if (!payment) throw new Error("Payment not found");

  const invoiceUrl = buildPublicInvoiceUrl(payment.invoiceId);
  const receiptUrl = buildPublicReceiptUrl(payment.id);

  const notifBase = {
    companyName: payment.invoice.company.name,
    customerName: payment.invoice.customer.name,
    invoiceNumber: payment.invoice.invoiceNumber,
    total: formatAmount(payment.invoice.total),
    currencyCode: payment.invoice.currencyCode,
    issueDate: formatDate(payment.invoice.issueDate),
    dueDate: payment.invoice.dueDate ? formatDate(payment.invoice.dueDate) : undefined,
    invoiceUrl,
  };

  if (args.channel === "email") {
    const to = payment.invoice.customer.email;
    if (!to) {
      return { success: false as const, error: "Customer has no email address" };
    }

    const pdf = await generatePaymentReceiptPdf({
      companyName: payment.invoice.company.name,
      customerName: payment.invoice.customer.name,
      customerEmail: payment.invoice.customer.email,
      customerPhone: payment.invoice.customer.phone,
      invoiceNumber: payment.invoice.invoiceNumber,
      paymentId: payment.id,
      paymentDate: formatDate(payment.paymentDate),
      method: payment.method,
      note: payment.note,
      amount: formatAmount(payment.amount),
      currencyCode: payment.currencyCode,
      amountBase: formatAmount(payment.amountBase),
      baseCurrencyCode: payment.baseCurrencyCode,
      receiptUrl,
    });

    const { subject, html } = buildPaymentReceivedEmail({
      ...notifBase,
      paidAmount: formatAmount(payment.amount),
      receiptUrl,
    });

    const result = await sendEmail({
      to,
      subject,
      html,
      attachments: [
        {
          filename: `receipt-${payment.invoice.invoiceNumber}-${payment.id.slice(0, 8)}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });

    if (!result.ok) return { success: false as const, error: `Failed to send email: ${result.error}` };
    return { success: true as const, messageId: result.messageId };
  }

  if (args.channel === "whatsapp") {
    const to = payment.invoice.customer.phone;
    if (!to) {
      return { success: false as const, error: "Customer has no phone number" };
    }

    const message = buildPaymentReceivedMessage({
      ...notifBase,
      paidAmount: formatAmount(payment.amount),
      receiptUrl,
    });

    const sent = await sendWhatsApp({ to, message });
    if (sent) return { success: true as const };

    const link = generateWhatsAppLink(to, message);
    return {
      success: false as const,
      fallbackLink: link,
      message: "WhatsApp API not configured. Use the link to send manually.",
    };
  }

  return { success: false as const, error: "Unknown channel" };
}
