/**
 * WhatsApp notification utility.
 *
 * Supports two modes:
 * 1. WhatsApp Business API (via WHATSAPP_API_URL and WHATSAPP_API_TOKEN)
 * 2. Simple wa.me link generation (fallback, opens in browser)
 *
 * Configure env vars:
 *   WHATSAPP_API_URL=https://graph.facebook.com/v18.0/PHONE_NUMBER_ID/messages
 *   WHATSAPP_API_TOKEN=your_bearer_token
 */

type SendWhatsAppArgs = {
  to: string; // phone number with country code, e.g. "+9647701234567"
  message: string;
};

export async function sendWhatsApp({ to, message }: SendWhatsAppArgs): Promise<boolean> {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiToken = process.env.WHATSAPP_API_TOKEN;

  if (!apiUrl || !apiToken) {
    console.warn("[WhatsApp] API not configured, skipping message to:", to);
    return false;
  }

  // Clean phone number - remove spaces, dashes, etc.
  const cleanPhone = to.replace(/[^0-9+]/g, "").replace(/^\+/, "");

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "text",
        text: { body: message },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[WhatsApp] API error:", err);
      return false;
    }

    console.log("[WhatsApp] Message sent to:", to);
    return true;
  } catch (err) {
    console.error("[WhatsApp] Failed to send:", err);
    return false;
  }
}

type InvoiceWhatsAppData = {
  companyName: string;
  customerName: string;
  invoiceNumber: string;
  total: string;
  currencyCode: string;
  invoiceUrl: string;
};

export function buildInvoiceCreatedMessage(data: InvoiceWhatsAppData): string {
  return `🧾 *فاتورة جديدة | New Invoice*

مرحباً ${data.customerName},
تم إصدار فاتورة جديدة لكم من ${data.companyName}:

📋 رقم الفاتورة: *${data.invoiceNumber}*
💰 المبلغ: *${data.total} ${data.currencyCode}*

🔗 عرض الفاتورة: ${data.invoiceUrl}

شكراً لتعاملكم معنا ❤️`;
}

export function buildPaymentReceivedMessage(data: InvoiceWhatsAppData & { paidAmount: string }): string {
  return `✅ *تأكيد الدفع | Payment Received*

مرحباً ${data.customerName},
تم استلام دفعتكم بنجاح:

📋 رقم الفاتورة: *${data.invoiceNumber}*
💰 المبلغ المدفوع: *${data.paidAmount} ${data.currencyCode}*

🔗 عرض الفاتورة: ${data.invoiceUrl}

شكراً لكم 🙏`;
}

/**
 * Generate a wa.me link for manual sending (fallback when API not configured)
 */
export function generateWhatsAppLink(phone: string, message: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

