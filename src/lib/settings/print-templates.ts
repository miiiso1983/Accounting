export const PRINT_TEMPLATE_TYPES = ["INVOICE", "RECEIPT", "JOURNAL_ENTRY"] as const;

export type PrintTemplateTypeValue = (typeof PRINT_TEMPLATE_TYPES)[number];

export const PRINT_TEMPLATE_TYPE_LABELS: Record<PrintTemplateTypeValue, string> = {
  INVOICE: "Invoice / فاتورة",
  RECEIPT: "Receipt / إيصال",
  JOURNAL_ENTRY: "Journal Entry / قيد يومية",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripExecutableHtml(value: string) {
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function buildSampleBody(type: PrintTemplateTypeValue) {
  if (type === "RECEIPT") {
    return `
      <div class="sample-card">
        <div class="sample-title">Payment Receipt / إيصال دفع</div>
        <div class="sample-grid">
          <div><strong>Receipt #</strong><br />RCPT-001</div>
          <div><strong>Date</strong><br />2026-03-16</div>
          <div><strong>Received From</strong><br />Al Team Customer</div>
          <div><strong>Amount</strong><br />1,250 IQD</div>
        </div>
      </div>
    `;
  }

  if (type === "JOURNAL_ENTRY") {
    return `
      <div class="sample-card">
        <div class="sample-title">Journal Entry / قيد يومية</div>
        <table>
          <thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead>
          <tbody>
            <tr><td>Cash / الصندوق</td><td>1,000</td><td>-</td></tr>
            <tr><td>Revenue / الإيراد</td><td>-</td><td>1,000</td></tr>
          </tbody>
        </table>
      </div>
    `;
  }

  return `
    <div class="sample-card">
      <div class="sample-title">Invoice / فاتورة</div>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
        <tbody>
          <tr><td>Sample Product</td><td>2</td><td>500</td></tr>
          <tr><td>Service</td><td>1</td><td>250</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

export function buildPrintTemplatePreviewDocument(input: {
  name: string;
  type: PrintTemplateTypeValue;
  headerHtml: string;
  footerHtml: string;
  logoUrl?: string | null;
}) {
  const title = escapeHtml(input.name.trim() || "Print Template Preview");
  const logoUrl = input.logoUrl?.trim();
  const headerHtml = stripExecutableHtml(input.headerHtml || "");
  const footerHtml = stripExecutableHtml(input.footerHtml || "");

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f5f7fb; color: #111827; margin: 0; }
        .page { max-width: 840px; margin: 0 auto; padding: 24px; }
        .paper { background: #fff; border: 1px solid #dbe4f0; border-radius: 18px; padding: 24px; }
        .logo { max-height: 56px; max-width: 160px; object-fit: contain; margin-bottom: 16px; }
        .placeholder { border: 1px dashed #cbd5e1; border-radius: 12px; padding: 16px; color: #64748b; }
        .sample-card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px; margin: 18px 0; }
        .sample-title { font-weight: 700; margin-bottom: 12px; color: #0f172a; }
        .sample-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; }
        .footer-note { margin-top: 16px; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="paper">
          ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo" />` : ""}
          ${headerHtml || '<div class="placeholder">Header HTML preview / معاينة رأس القالب</div>'}
          ${buildSampleBody(input.type)}
          ${footerHtml || '<div class="placeholder">Footer HTML preview / معاينة تذييل القالب</div>'}
          <div class="footer-note">Sandbox preview only — scripts are stripped and iframe sandboxed.</div>
        </div>
      </div>
    </body>
  </html>`;
}