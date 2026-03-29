/**
 * Format a receipt number as Pay-0001, Pay-0002, etc.
 */
export function formatReceiptNumber(receiptNumber: number | null | undefined, fallbackId?: string): string {
  if (!receiptNumber) return fallbackId ? fallbackId.slice(0, 8) : "-";
  return `Pay-${String(receiptNumber).padStart(4, "0")}`;
}

