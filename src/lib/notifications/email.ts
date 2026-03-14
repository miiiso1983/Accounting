import nodemailer from "nodemailer";

type SmtpLikeError = Error & {
  code?: string;
  response?: string;
  responseCode?: number;
  command?: string;
  errno?: string | number;
  syscall?: string;
  address?: string;
  port?: number;
};

function createTransporter() {
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = Number(process.env.SMTP_PORT || "587");
  const secure = process.env.SMTP_SECURE === "true";
  const debug = process.env.SMTP_DEBUG === "true";

  return nodemailer.createTransport({
    host,
    port,
    secure,
    logger: debug,
    debug,
    requireTLS: !secure && port === 587,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
    tls: {
      servername: host,
      minVersion: "TLSv1.2",
    },
  });
}

const FROM_ADDRESS = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@example.com";
const FROM_NAME = process.env.SMTP_FROM_NAME || "شركة التيم لتكنلوجيا المعلومات";

type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

function getErrorMessage(err: unknown) {
  if (err && typeof err === "object") {
    const smtpError = err as Partial<SmtpLikeError>;
    const parts = [smtpError.message].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    if (smtpError.code) parts.push(`code=${smtpError.code}`);
    if (typeof smtpError.responseCode === "number") parts.push(`responseCode=${smtpError.responseCode}`);
    if (smtpError.command) parts.push(`command=${smtpError.command}`);
    if (smtpError.response) parts.push(`response=${smtpError.response}`);
    if (smtpError.syscall) parts.push(`syscall=${smtpError.syscall}`);
    if (smtpError.address) parts.push(`address=${smtpError.address}`);
    if (typeof smtpError.port === "number") parts.push(`port=${smtpError.port}`);
    if (smtpError.errno) parts.push(`errno=${String(smtpError.errno)}`);

    if (parts.length > 0) return parts.join(" | ");
  }

  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return "Unknown SMTP error";
}

export async function sendEmail({ to, subject, html, attachments }: SendEmailArgs) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("[Email] SMTP not configured, skipping email to:", to);
    return { ok: false, error: "SMTP is not configured. Set SMTP_USER and SMTP_PASS." } satisfies SendEmailResult;
  }

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: { name: FROM_NAME, address: FROM_ADDRESS },
      to,
      subject,
      html,
      attachments,
    });
    console.log("[Email] Sent:", info.messageId);
    return { ok: true, messageId: info.messageId } satisfies SendEmailResult;
  } catch (err) {
    const message = getErrorMessage(err);
    console.error("[Email] Failed to send:", message, err);
    return { ok: false, error: message } satisfies SendEmailResult;
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
        <p style="margin-top: 8px; color: #52525b;">A PDF copy is attached to this email / تم إرفاق نسخة PDF مع الرسالة.</p>
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

export function buildPaymentReceivedEmail(
  data: InvoiceEmailData & { paidAmount: string; receiptUrl?: string },
): { subject: string; html: string } {
  const subject = `Payment received for ${data.invoiceNumber} | تم استلام الدفعة`;
  const url = data.receiptUrl ?? data.invoiceUrl;
  const linkLabel = data.receiptUrl ? "View Receipt / عرض الإيصال" : "View Invoice / عرض الفاتورة";
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
          <a href="${url}" style="background: #18181b; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">${linkLabel}</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
        <p style="color: #a1a1aa; font-size: 12px; text-align: center;">Thank you for your business / شكراً لتعاملكم معنا</p>
      </div>
    </div>
  `;
  return { subject, html };
}

