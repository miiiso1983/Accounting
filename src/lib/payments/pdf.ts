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
const HEADER_FONT_SIZE = 20;
const LINE_HEIGHT = 15;
const COLORS = {
  accent: rgb(0.06, 0.62, 0.35),
  ink: rgb(0.09, 0.09, 0.11),
  muted: rgb(0.45, 0.45, 0.5),
  border: rgb(0.89, 0.9, 0.92),
  panel: rgb(0.96, 0.99, 0.97),
};

const bidi = bidiFactory();
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export type PaymentReceiptPdfData = {
  companyName: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  invoiceNumber: string;
  paymentId: string;
  paymentDate: string;
  method?: string | null;
  note?: string | null;
  amount: string;
  currencyCode: string;
  amountBase: string;
  baseCurrencyCode: string;
  receiptUrl: string;
};

type PreparedText = { text: string; rtl: boolean };

function safePdfText(value: string | null | undefined, fallback = "-") {
  const normalized = (value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function containsArabic(value: string) {
  return ARABIC_REGEX.test(value);
}

function reorderRtlText(text: string) {
  const embeddingLevels = bidi.getEmbeddingLevels(text, "rtl");
  const chars = text.split("");
  const mirroredChars = bidi.getMirroredCharactersMap(text, embeddingLevels);
  mirroredChars.forEach((char, index) => (chars[index] = char));
  bidi.getReorderSegments(text, embeddingLevels).forEach(([start, end]) => {
    const reversed = chars.slice(start, end + 1).reverse();
    chars.splice(start, end - start + 1, ...reversed);
  });
  return chars.join("");
}

function preparePdfText(value: string | null | undefined, fallback = "-"): PreparedText {
  const normalized = safePdfText(value, fallback);
  if (!containsArabic(normalized)) return { text: normalized, rtl: false };
  try {
    return { text: reorderRtlText(ArabicShaper.convertArabic(normalized)), rtl: true };
  } catch {
    return { text: normalized, rtl: false };
  }
}

function truncateText(text: string, maxWidth: number, font: PDFFont, size: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = "...";
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}${ellipsis}`, size) > maxWidth) out = out.slice(0, -1);
  return `${out}${ellipsis}`;
}

function drawPreparedText(page: PDFPage, prepared: PreparedText, options: { x: number; y: number; size: number; font: PDFFont; arabicFont: PDFFont; color: ReturnType<typeof rgb>; boxWidth?: number; maxWidth?: number }) {
  const activeFont = prepared.rtl ? options.arabicFont : options.font;
  const text = options.maxWidth ? truncateText(prepared.text, options.maxWidth, activeFont, options.size) : prepared.text;
  const width = activeFont.widthOfTextAtSize(text, options.size);
  const x = prepared.rtl && options.boxWidth ? options.x + Math.max(options.boxWidth - width, 0) : options.x;
  page.drawText(text, { x, y: options.y, size: options.size, font: activeFont, color: options.color });
}

async function loadArabicFontBytes(weight: "regular" | "bold") {
  const folder = weight === "bold" ? "700Bold" : "400Regular";
  const filename = weight === "bold" ? "NotoNaskhArabic_700Bold.ttf" : "NotoNaskhArabic_400Regular.ttf";
  return readFile(join(process.cwd(), "node_modules", "@expo-google-fonts", "noto-naskh-arabic", folder, filename));
}

async function loadLogoBytes() {
  try {
    return await readFile(join(process.cwd(), "public", "logo.PNG"));
  } catch {
    return null;
  }
}

export async function generatePaymentReceiptPdf(data: PaymentReceiptPdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setTitle(`Receipt ${data.invoiceNumber}`);
  pdfDoc.setAuthor(data.companyName);
  pdfDoc.setCreator("Accounting App");

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const arabicFont = await pdfDoc.embedFont(await loadArabicFontBytes("regular"), { subset: true });
  const arabicBold = await pdfDoc.embedFont(await loadArabicFontBytes("bold"), { subset: true });
  const logoBytes = await loadLogoBytes();
  const logo = logoBytes ? await pdfDoc.embedPng(logoBytes).catch(() => null) : null;

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  if (logo) page.drawImage(logo, { x: MARGIN, y: y - 52, width: 52, height: 52 });

  drawPreparedText(page, preparePdfText(data.companyName, "Company"), {
    x: logo ? MARGIN + 68 : MARGIN,
    y: y - 8,
    size: 16,
    font: bold,
    arabicFont: arabicBold,
    color: COLORS.ink,
    boxWidth: 260,
    maxWidth: 260,
  });

  const titleEn = "PAYMENT RECEIPT";
  const titleWidth = bold.widthOfTextAtSize(titleEn, HEADER_FONT_SIZE);
  page.drawText(titleEn, { x: PAGE_WIDTH - MARGIN - titleWidth, y: y - 8, size: HEADER_FONT_SIZE, font: bold, color: COLORS.accent });
  drawPreparedText(page, preparePdfText("إيصال دفع", ""), {
    x: PAGE_WIDTH - MARGIN - 160,
    y: y - 30,
    size: 14,
    font,
    arabicFont: arabicFont,
    color: COLORS.muted,
    boxWidth: 160,
    maxWidth: 160,
  });

  y -= 74;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: COLORS.border });
  y -= 22;

	// Never draw Arabic text with StandardFonts (WinAnsi). Draw bilingual labels in two parts.
	const receivedPrefix = "Received From / ";
	page.drawText(receivedPrefix, { x: MARGIN, y, size: SMALL_FONT_SIZE, font: bold, color: COLORS.muted });
	const receivedPrefixW = bold.widthOfTextAtSize(receivedPrefix, SMALL_FONT_SIZE);
	drawPreparedText(page, preparePdfText("استلمنا من", ""), {
		x: MARGIN + receivedPrefixW,
		y,
		size: SMALL_FONT_SIZE,
		font: bold,
		arabicFont: arabicBold,
		color: COLORS.muted,
		maxWidth: 240 - receivedPrefixW,
	});
  page.drawText("Receipt Details", { x: MARGIN + 280, y, size: SMALL_FONT_SIZE, font: bold, color: COLORS.muted });
  y -= 18;

  const leftLines = [
    preparePdfText(data.customerName, "Customer"),
    preparePdfText(data.customerEmail, ""),
    preparePdfText(data.customerPhone, ""),
  ].filter((v) => v.text !== "-");

  leftLines.slice(0, 4).forEach((line, idx) => {
    drawPreparedText(page, line, {
      x: MARGIN,
      y: y - idx * LINE_HEIGHT,
      size: FONT_SIZE,
      font: idx === 0 ? bold : font,
      arabicFont: idx === 0 ? arabicBold : arabicFont,
      color: idx === 0 ? COLORS.ink : COLORS.muted,
      boxWidth: 240,
      maxWidth: 240,
    });
  });

  const rightX = MARGIN + 280;
  const labelW = 78;
  const drawKV = (label: string, value: string, yy: number) => {
    page.drawText(label, { x: rightX, y: yy, size: SMALL_FONT_SIZE, font, color: COLORS.muted });
    page.drawText(truncateText(value, 180, bold, FONT_SIZE), { x: rightX + labelW, y: yy, size: FONT_SIZE, font: bold, color: COLORS.ink });
  };
  drawKV("Invoice #:", safePdfText(data.invoiceNumber), y);
  drawKV("Receipt ID:", safePdfText(data.paymentId), y - LINE_HEIGHT);
  drawKV("Date:", safePdfText(data.paymentDate), y - LINE_HEIGHT * 2);
  drawKV("Method:", safePdfText(data.method, "-").toUpperCase(), y - LINE_HEIGHT * 3);

  y -= 86;
  page.drawRectangle({ x: MARGIN, y: y - 56, width: CONTENT_WIDTH, height: 56, color: COLORS.panel, borderColor: COLORS.border, borderWidth: 1 });
	const amountPaidPrefix = "Amount Paid / ";
	page.drawText(amountPaidPrefix, { x: MARGIN + 14, y: y - 20, size: FONT_SIZE, font: bold, color: COLORS.muted });
	const amountPaidPrefixW = bold.widthOfTextAtSize(amountPaidPrefix, FONT_SIZE);
	drawPreparedText(page, preparePdfText("المبلغ المدفوع", ""), {
		x: MARGIN + 14 + amountPaidPrefixW,
		y: y - 20,
		size: FONT_SIZE,
		font: bold,
		arabicFont: arabicBold,
		color: COLORS.muted,
			maxWidth: Math.max(CONTENT_WIDTH - 28 - amountPaidPrefixW, 40),
	});
  const amountText = `${safePdfText(data.amount)} ${safePdfText(data.currencyCode)}`;
  const amountW = bold.widthOfTextAtSize(amountText, 16);
  page.drawText(amountText, { x: PAGE_WIDTH - MARGIN - 14 - amountW, y: y - 24, size: 16, font: bold, color: COLORS.accent });
	const baseText = `${safePdfText(data.amountBase)} ${safePdfText(data.baseCurrencyCode)}`;
	const basePrefix = "Base / ";
	page.drawText(basePrefix, { x: MARGIN + 14, y: y - 42, size: SMALL_FONT_SIZE, font, color: COLORS.muted });
	const basePrefixW = font.widthOfTextAtSize(basePrefix, SMALL_FONT_SIZE);
	const baseAr = preparePdfText("الأساس:", "");
	drawPreparedText(page, baseAr, {
		x: MARGIN + 14 + basePrefixW,
		y: y - 42,
		size: SMALL_FONT_SIZE,
		font,
		arabicFont,
		color: COLORS.muted,
	});
	const baseArFont = baseAr.rtl ? arabicFont : font;
	const baseArW = baseArFont.widthOfTextAtSize(baseAr.text, SMALL_FONT_SIZE);
	const baseValueX = MARGIN + 14 + basePrefixW + baseArW + 6;
		page.drawText(truncateText(baseText, Math.max(PAGE_WIDTH - MARGIN - 14 - baseValueX, 40), font, SMALL_FONT_SIZE), {
		x: baseValueX,
		y: y - 42,
		size: SMALL_FONT_SIZE,
		font,
		color: COLORS.muted,
	});

  y -= 92;
  if (data.note && data.note.trim()) {
    page.drawText("Note:", { x: MARGIN, y, size: SMALL_FONT_SIZE, font: bold, color: COLORS.muted });
    drawPreparedText(page, preparePdfText(data.note, ""), { x: MARGIN + 44, y, size: SMALL_FONT_SIZE, font, arabicFont, color: COLORS.ink, boxWidth: CONTENT_WIDTH - 44, maxWidth: CONTENT_WIDTH - 44 });
    y -= 18;
  }

  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: COLORS.border });
  y -= 16;
  page.drawText("View the receipt online:", { x: MARGIN, y, size: SMALL_FONT_SIZE, font: bold, color: COLORS.muted });
  y -= 14;
  page.drawText(truncateText(safePdfText(data.receiptUrl), CONTENT_WIDTH, font, SMALL_FONT_SIZE), { x: MARGIN, y, size: SMALL_FONT_SIZE, font, color: COLORS.accent });

  return Buffer.from(await pdfDoc.save());
}
