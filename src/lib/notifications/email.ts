import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@example.com";

type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailArgs) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("[Email] SMTP not configured, skipping email to:", to);
    return null;
  }

  try {
    const info = await transporter.sendMail({
      from: FROM,
      to,
      subject,
      html,
    });
    console.log("[Email] Sent:", info.messageId);
    return info;
  } catch (err) {
    console.error("[Email] Failed to send:", err);
    return null;
  }
}

type InvoiceEmailData = {
  companyName: string;
  customerName: string;
  invoiceNumber: string;
  total: string;
  currencyCode: string;
  issueDate: string;
  dueDate?: string;
  invoiceUrl: string;
};

export function buildInvoiceCreatedEmail(data: InvoiceEmailData): { subject: string; html: string } {
  const subject = `Invoice ${data.invoiceNumber} from ${data.companyName} | فاتورة ${data.invoiceNumber}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #0ea5e9; color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">${data.companyName}</h1>
        <p style="margin: 5px 0 0; opacity: 0.9;">Invoice / فاتورة</p>
      </div>
      <div style="border: 1px solid #e4e4e7; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
        <p>Dear <strong>${data.customerName}</strong>,</p>
        <p>A new invoice has been issued for you:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; color: #71717a;">Invoice #</td><td style="padding: 8px; font-weight: bold;">${data.invoiceNumber}</td></tr>
          <tr><td style="padding: 8px; color: #71717a;">Date</td><td style="padding: 8px;">${data.issueDate}</td></tr>
          ${data.dueDate ? `<tr><td style="padding: 8px; color: #71717a;">Due Date</td><td style="padding: 8px;">${data.dueDate}</td></tr>` : ""}
          <tr style="background: #f4f4f5;"><td style="padding: 8px; color: #71717a;">Total</td><td style="padding: 8px; font-weight: bold; font-size: 18px;">${data.total} ${data.currencyCode}</td></tr>
        </table>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${data.invoiceUrl}" style="background: #18181b; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">View Invoice / عرض الفاتورة</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
        <p style="color: #a1a1aa; font-size: 12px; text-align: center;">Thank you for your business / شكراً لتعاملكم معنا</p>
      </div>
    </div>
  `;
  return { subject, html };
}

export function buildPaymentReceivedEmail(data: InvoiceEmailData & { paidAmount: string }): { subject: string; html: string } {
  const subject = `Payment received for ${data.invoiceNumber} | تم استلام الدفعة`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #10b981; color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">${data.companyName}</h1>
        <p style="margin: 5px 0 0; opacity: 0.9;">Payment Confirmation / تأكيد الدفع</p>
      </div>
      <div style="border: 1px solid #e4e4e7; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
        <p>Dear <strong>${data.customerName}</strong>,</p>
        <p>We have received your payment. Thank you!</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; color: #71717a;">Invoice #</td><td style="padding: 8px; font-weight: bold;">${data.invoiceNumber}</td></tr>
          <tr style="background: #f0fdf4;"><td style="padding: 8px; color: #71717a;">Amount Paid</td><td style="padding: 8px; font-weight: bold; color: #10b981; font-size: 18px;">${data.paidAmount} ${data.currencyCode}</td></tr>
        </table>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${data.invoiceUrl}" style="background: #18181b; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">View Invoice / عرض الفاتورة</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
        <p style="color: #a1a1aa; font-size: 12px; text-align: center;">Thank you for your business / شكراً لتعاملكم معنا</p>
      </div>
    </div>
  `;
  return { subject, html };
}

