import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildPublicInvoiceUrl } from "@/lib/invoices/public-link";
import { sendEmail, buildPaymentReceivedEmail } from "@/lib/notifications/email";
import { buildPaymentReceivedMessage, generateWhatsAppLink, sendWhatsApp } from "@/lib/notifications/whatsapp";
import { buildPublicReceiptUrl } from "@/lib/payments/public-link";

import { generatePaymentReceiptPdf } from "./pdf";
import { formatReceiptNumber } from "./receipt-number";

export type NotifyPaymentChannel = "email" | "whatsapp";

function formatDate(value: Date) {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const year = value.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function formatAmount(value: Prisma.Decimal) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export async function notifyPaymentReceipt(args: {
  paymentId: string;
  companyId: string;
  channel: NotifyPaymentChannel;
}) {
  try {
    const payment = await prisma.invoicePayment.findFirst({
      where: { id: args.paymentId, companyId: args.companyId },
      include: {
        invoice: { include: { company: true, customer: true } },
      },
    });

    if (!payment) return { success: false as const, error: "Payment not found" };

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

      let pdf: Buffer;
      try {
        pdf = await generatePaymentReceiptPdf({
          companyName: payment.invoice.company.name,
          customerName: payment.invoice.customer.name,
          customerEmail: payment.invoice.customer.email,
          customerPhone: payment.invoice.customer.phone,
          invoiceNumber: payment.invoice.invoiceNumber,
          receiptLabel: formatReceiptNumber(payment.receiptNumber, payment.id),
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return { success: false as const, error: `Failed to generate receipt PDF: ${msg}` };
      }

      const { subject, html } = buildPaymentReceivedEmail({
        ...notifBase,
        paidAmount: formatAmount(payment.amount),
        receiptUrl,
      });

      let result: Awaited<ReturnType<typeof sendEmail>>;
      try {
        result = await sendEmail({
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return { success: false as const, error: `Failed to send email: ${msg}` };
      }

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

      try {
        const sent = await sendWhatsApp({ to, message });
        if (sent) return { success: true as const };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        const link = generateWhatsAppLink(to, message);
        return { success: false as const, fallbackLink: link, error: `Failed to send WhatsApp: ${msg}` };
      }

      const link = generateWhatsAppLink(to, message);
      return {
        success: false as const,
        fallbackLink: link,
        message: "WhatsApp API not configured. Use the link to send manually.",
      };
    }

    return { success: false as const, error: "Unknown channel" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { success: false as const, error: `Notification failed: ${msg}` };
  }
}
