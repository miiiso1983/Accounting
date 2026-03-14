import { readFile } from "node:fs/promises";
import { join } from "node:path";

import fontkit from "@pdf-lib/fontkit";
import bidiFactory from "bidi-js";
import { ArabicShaper } from "arabic-persian-reshaper";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FONT_SIZE = 10;
const SMALL_FONT_SIZE = 9;
const HEADER_FONT_SIZE = 22;
const LINE_HEIGHT = 15;
const TABLE_COLUMNS = { index: 24, description: 190, quantity: 60, price: 70, tax: 55, total: 100 };
const COLORS = {
  accent: rgb(0.04, 0.45, 0.74),
  ink: rgb(0.09, 0.09, 0.11),
  muted: rgb(0.45, 0.45, 0.5),
  border: rgb(0.89, 0.9, 0.92),
  panel: rgb(0.96, 0.98, 1),
  success: rgb(0.06, 0.62, 0.35),
};

const bidi = bidiFactory();
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export type InvoicePdfData = {
  companyName: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddressLines: string[];
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string | null;
  status: string;
  currencyCode: string;
  paymentTerms?: string | null;
  subtotal: number;
  discountAmount: number;
  discountLabel?: string | null;
  taxTotal: number;
  total: number;
  invoiceUrl: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate?: number | null;
    lineTotal: number;
  }>;
};

function formatAmount(value: number) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-";
}

type PreparedText = {
  text: string;
  rtl: boolean;
};

function safePdfText(value: string | null | undefined, fallback = "-") {
  const normalized = (value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function containsArabic(value: string) {
  return ARABIC_REGEX.test(value);
}

function reorderRtlText(text: string) {
  const embeddingLevels = bidi.getEmbeddingLevels(text, "rtl");
  const chars = text.split("");
  const mirroredChars = bidi.getMirroredCharactersMap(text, embeddingLevels);

  mirroredChars.forEach((char, index) => {
    chars[index] = char;
  });

  bidi.getReorderSegments(text, embeddingLevels).forEach(([start, end]) => {
    const reversed = chars.slice(start, end + 1).reverse();
    chars.splice(start, end - start + 1, ...reversed);
  });

  return chars.join("");
}

function preparePdfText(value: string | null | undefined, fallback = "-"): PreparedText {
  const normalized = safePdfText(value, fallback);
  if (!containsArabic(normalized)) {
    return { text: normalized, rtl: false };
  }

  try {
    return { text: reorderRtlText(ArabicShaper.convertArabic(normalized)), rtl: true };
  } catch {
    return { text: normalized, rtl: false };
  }
}

function truncateText(text: string, maxWidth: number, font: PDFFont, size: number, rtl = false) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = "...";
  let out = text;

  if (rtl) {
    while (out.length > 1 && font.widthOfTextAtSize(`${ellipsis}${out}`, size) > maxWidth) {
      out = out.slice(1);
    }
    return `${ellipsis}${out}`;
  }

  while (out.length > 1 && font.widthOfTextAtSize(`${out}${ellipsis}`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}${ellipsis}`;
}

function selectFont(prepared: PreparedText, font: PDFFont, arabicFont: PDFFont) {
  return prepared.rtl ? arabicFont : font;
}

function drawPreparedText(
  page: PDFPage,
  prepared: PreparedText,
  options: {
    x: number;
    y: number;
    size: number;
    font: PDFFont;
    arabicFont: PDFFont;
    color: ReturnType<typeof rgb>;
    maxWidth?: number;
    boxWidth?: number;
  },
) {
  const activeFont = selectFont(prepared, options.font, options.arabicFont);
  const text = options.maxWidth ? truncateText(prepared.text, options.maxWidth, activeFont, options.size, prepared.rtl) : prepared.text;
  const width = activeFont.widthOfTextAtSize(text, options.size);
  const x = prepared.rtl && options.boxWidth ? options.x + Math.max(options.boxWidth - width, 0) : options.x;

  page.drawText(text, { x, y: options.y, size: options.size, font: activeFont, color: options.color });

  return { text, width, font: activeFont, x };
}

function drawLabelValue(page: PDFPage, label: string, value: string, x: number, y: number, labelWidth: number, font: PDFFont, bold: PDFFont) {
  page.drawText(label, { x, y, size: SMALL_FONT_SIZE, font, color: COLORS.muted });
  page.drawText(value, { x: x + labelWidth, y, size: FONT_SIZE, font: bold, color: COLORS.ink });
}

async function loadLogoBytes() {
  try {
    return await readFile(join(process.cwd(), "public", "logo.PNG"));
  } catch {
    return null;
  }
}

async function loadArabicFontBytes(weight: "regular" | "bold") {
  const folder = weight === "bold" ? "700Bold" : "400Regular";
  const filename = weight === "bold" ? "NotoNaskhArabic_700Bold.ttf" : "NotoNaskhArabic_400Regular.ttf";
  return readFile(join(process.cwd(), "node_modules", "@expo-google-fonts", "noto-naskh-arabic", folder, filename));
}

function paymentTermsLabel(paymentTerms?: string | null) {
  if (paymentTerms === "MONTHLY") return "Monthly";
  if (paymentTerms === "QUARTERLY") return "Quarterly";
  if (paymentTerms === "YEARLY") return "Yearly";
  return undefined;
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setTitle(`Invoice ${data.invoiceNumber}`);
  pdfDoc.setAuthor(data.companyName);
  pdfDoc.setCreator("Accounting App");
  pdfDoc.setProducer("Accounting App");

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const arabicFont = await pdfDoc.embedFont(await loadArabicFontBytes("regular"), { subset: true });
  const arabicBold = await pdfDoc.embedFont(await loadArabicFontBytes("bold"), { subset: true });
  const logoBytes = await loadLogoBytes();
  const logo = logoBytes ? await pdfDoc.embedPng(logoBytes).catch(() => null) : null;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  const ensureSpace = (height: number) => {
    if (y - height < MARGIN) newPage();
  };

  if (logo) {
    page.drawImage(logo, { x: MARGIN, y: y - 56, width: 56, height: 56 });
  }

  const companyName = preparePdfText(data.companyName, "Company");
  const invoiceTitle = safePdfText(`INVOICE ${data.invoiceNumber}`, "INVOICE");
  const companyX = logo ? MARGIN + 72 : MARGIN;
  drawPreparedText(page, companyName, {
    x: companyX,
    y: y - 6,
    size: 16,
    font: bold,
    arabicFont: arabicBold,
    color: COLORS.ink,
    boxWidth: 220,
    maxWidth: 220,
  });
  page.drawText("Invoice attachment", { x: companyX, y: y - 24, size: FONT_SIZE, font, color: COLORS.muted });
  const titleWidth = bold.widthOfTextAtSize(invoiceTitle, HEADER_FONT_SIZE);
  page.drawText(invoiceTitle, { x: PAGE_WIDTH - MARGIN - titleWidth, y: y - 6, size: HEADER_FONT_SIZE, font: bold, color: COLORS.accent });

  y -= 74;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: COLORS.border });
  y -= 24;

  page.drawText("Bill To", { x: MARGIN, y, size: FONT_SIZE, font: bold, color: COLORS.muted });
  page.drawText("Invoice Details", { x: MARGIN + 280, y, size: FONT_SIZE, font: bold, color: COLORS.muted });
  y -= 18;

  const customerLines = [
    preparePdfText(data.customerName, "Customer"),
    preparePdfText(data.customerEmail, ""),
    preparePdfText(data.customerPhone, ""),
    ...data.customerAddressLines.map((line) => preparePdfText(line, "")),
  ].filter(Boolean);

  customerLines.slice(0, 5).forEach((line, index) => {
    drawPreparedText(page, line, {
      x: MARGIN,
      y: y - index * LINE_HEIGHT,
      size: FONT_SIZE,
      font: index === 0 ? bold : font,
      arabicFont: index === 0 ? arabicBold : arabicFont,
      color: index === 0 ? COLORS.ink : COLORS.muted,
      boxWidth: 240,
      maxWidth: 240,
    });
  });

  const rightX = MARGIN + 280;
  drawLabelValue(page, "Number:", safePdfText(data.invoiceNumber), rightX, y, 54, font, bold);
  drawLabelValue(page, "Date:", safePdfText(data.issueDate), rightX, y - LINE_HEIGHT, 54, font, bold);
  if (data.dueDate) drawLabelValue(page, "Due:", safePdfText(data.dueDate), rightX, y - LINE_HEIGHT * 2, 54, font, bold);
  drawLabelValue(page, "Status:", safePdfText(data.status), rightX, y - LINE_HEIGHT * 3, 54, font, bold);
  drawLabelValue(page, "Currency:", safePdfText(data.currencyCode), rightX, y - LINE_HEIGHT * 4, 54, font, bold);
  const paymentTerms = paymentTermsLabel(data.paymentTerms);
  if (paymentTerms) drawLabelValue(page, "Payment:", paymentTerms, rightX, y - LINE_HEIGHT * 5, 54, font, bold);

  y -= 110;
  ensureSpace(160);

  const tableHeaderY = y;
  page.drawRectangle({ x: MARGIN, y: tableHeaderY - 20, width: CONTENT_WIDTH, height: 20, color: COLORS.panel, borderColor: COLORS.border, borderWidth: 1 });
  let colX = MARGIN + 6;
  const headerLabels = ["#", "Description", "Qty", "Price", "Tax", "Total"];
  const widths = Object.values(TABLE_COLUMNS);
  headerLabels.forEach((label, index) => {
    page.drawText(label, { x: colX, y: tableHeaderY - 14, size: SMALL_FONT_SIZE, font: bold, color: COLORS.muted });
    colX += widths[index]!;
  });

  y = tableHeaderY - 30;
  const rowHeight = 18;

  const drawTableHeaderOnNewPage = () => {
    page.drawRectangle({ x: MARGIN, y: y - 20, width: CONTENT_WIDTH, height: 20, color: COLORS.panel, borderColor: COLORS.border, borderWidth: 1 });
    let headerX = MARGIN + 6;
    headerLabels.forEach((label, index) => {
      page.drawText(label, { x: headerX, y: y - 14, size: SMALL_FONT_SIZE, font: bold, color: COLORS.muted });
      headerX += widths[index]!;
    });
    y -= 30;
  };

  data.lineItems.forEach((item, index) => {
    if (y - rowHeight < MARGIN + 120) {
      newPage();
      drawTableHeaderOnNewPage();
    }

    page.drawLine({ start: { x: MARGIN, y: y - 2 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 2 }, thickness: 1, color: COLORS.border });
    let x = MARGIN + 6;
    const description = preparePdfText(item.description, `Item ${index + 1}`);
    const tax = item.taxRate ? `${formatAmount(item.taxRate * 100)}%` : "-";
    const values: Array<string | PreparedText> = [
      String(index + 1),
      description,
      formatAmount(item.quantity),
      formatAmount(item.unitPrice),
      tax,
      `${formatAmount(item.lineTotal)} ${safePdfText(data.currencyCode)}`,
    ];

    values.forEach((value, valueIndex) => {
      const width = widths[valueIndex]! - 12;
      if (valueIndex === 1 && typeof value !== "string") {
        drawPreparedText(page, value, {
          x,
          y: y - 13,
          size: SMALL_FONT_SIZE,
          font,
          arabicFont,
          color: COLORS.ink,
          boxWidth: width,
          maxWidth: width,
        });
      } else if (typeof value === "string") {
        const rendered = truncateText(value, width, valueIndex === 5 ? bold : font, SMALL_FONT_SIZE);
        page.drawText(rendered, {
          x,
          y: y - 13,
          size: SMALL_FONT_SIZE,
          font: valueIndex === 5 ? bold : font,
          color: COLORS.ink,
        });
      }
      x += widths[valueIndex]!;
    });

    y -= rowHeight;
  });

  y -= 20;
  ensureSpace(110);

  const totalsWidth = 220;
  const totalsX = PAGE_WIDTH - MARGIN - totalsWidth;
  const totalsRows: Array<{ label: string; value: string; color?: ReturnType<typeof rgb>; bold?: boolean }> = [
    { label: "Subtotal", value: `${formatAmount(data.subtotal)} ${safePdfText(data.currencyCode)}` },
  ];
  if (data.discountAmount > 0) {
    totalsRows.push({ label: safePdfText(data.discountLabel, "Discount"), value: `-${formatAmount(data.discountAmount)} ${safePdfText(data.currencyCode)}` });
  }
  if (data.taxTotal > 0) {
    totalsRows.push({ label: "Tax", value: `${formatAmount(data.taxTotal)} ${safePdfText(data.currencyCode)}` });
  }
  totalsRows.push({ label: "Total", value: `${formatAmount(data.total)} ${safePdfText(data.currencyCode)}`, color: COLORS.accent, bold: true });

  page.drawRectangle({ x: totalsX, y: y - totalsRows.length * 22 - 16, width: totalsWidth, height: totalsRows.length * 22 + 16, borderColor: COLORS.border, borderWidth: 1 });
  let totalsY = y - 18;
  totalsRows.forEach((row) => {
    page.drawText(row.label, { x: totalsX + 12, y: totalsY, size: FONT_SIZE, font: row.bold ? bold : font, color: row.color ?? COLORS.muted });
    const valueWidth = (row.bold ? bold : font).widthOfTextAtSize(row.value, FONT_SIZE);
    page.drawText(row.value, { x: totalsX + totalsWidth - 12 - valueWidth, y: totalsY, size: FONT_SIZE, font: row.bold ? bold : font, color: row.color ?? COLORS.ink });
    totalsY -= 22;
  });
  y = totalsY - 8;

  ensureSpace(70);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: COLORS.border });
  y -= 18;
  page.drawText("View the live invoice online:", { x: MARGIN, y, size: SMALL_FONT_SIZE, font: bold, color: COLORS.muted });
  y -= 14;
  page.drawText(truncateText(safePdfText(data.invoiceUrl), CONTENT_WIDTH, font, SMALL_FONT_SIZE), { x: MARGIN, y, size: SMALL_FONT_SIZE, font, color: COLORS.success });
  y -= 18;
  page.drawText("Embedded Arabic font support enabled for customer-facing text.", { x: MARGIN, y, size: 8, font, color: COLORS.muted });

  return Buffer.from(await pdfDoc.save());
}