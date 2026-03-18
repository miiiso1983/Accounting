export const PAYMENT_REFERENCE_TYPES = ["PAYMENT", "INVOICE_PAYMENT"] as const;

export type JournalEntryTypeValue = "MANUAL" | "SYSTEM";

export function deriveJournalEntryType(referenceType?: string | null): JournalEntryTypeValue {
  return referenceType ? "SYSTEM" : "MANUAL";
}

export function formatJournalEntryNumber(entryNumber: number | null | undefined, type: JournalEntryTypeValue, fallbackId?: string) {
  if (!entryNumber) return fallbackId ? fallbackId.slice(0, 8) : "-";
  const prefix = type === "MANUAL" ? "ME" : "JE";
  return `${prefix}-${String(entryNumber).padStart(3, "0")}`;
}

export function getJournalEntryTypeLabel(type: JournalEntryTypeValue) {
  return type === "MANUAL" ? "قيد يدوي / Manual Journal Entry" : "قيد نظامي / System Journal Entry";
}

export function isPaymentReferenceType(referenceType?: string | null) {
  return PAYMENT_REFERENCE_TYPES.includes((referenceType ?? "") as (typeof PAYMENT_REFERENCE_TYPES)[number]);
}

export function getJournalSourceLabel(referenceType?: string | null) {
  if (!referenceType) return "يدوي / Manual";
  if (referenceType === "INVOICE") return "فاتورة مبيعات / Sales Invoice";
  if (referenceType === "EXPENSE") return "مصروف / Expense";
  if (referenceType === "FUND_TRANSFER") return "تحويل / Fund Transfer";
  if (isPaymentReferenceType(referenceType)) return "سند قبض / Payment";
  return referenceType;
}

export function getJournalSourceHref(args: {
  referenceType?: string | null;
  invoiceId?: string | null;
  expenseId?: string | null;
  paymentInvoiceId?: string | null;
}) {
  if (args.referenceType === "INVOICE" && args.invoiceId) return `/app/invoices/${args.invoiceId}`;
  if (args.referenceType === "EXPENSE" && args.expenseId) return `/app/expenses/${args.expenseId}`;
  if (args.referenceType === "FUND_TRANSFER") return "/app/transfers";
  if (isPaymentReferenceType(args.referenceType) && args.paymentInvoiceId) return `/app/invoices/${args.paymentInvoiceId}`;
  return undefined;
}