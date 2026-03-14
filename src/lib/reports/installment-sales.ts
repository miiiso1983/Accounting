export type InstallmentFrequency = "MONTHLY" | "QUARTERLY" | "ANNUALLY";
export type CurrencyCode = "USD" | "IQD";

export interface MonthColumn {
  key: string;
  label: string;
  from: Date;
  to: Date;
}

export function fmtAmount(n: number) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", timeZone: "UTC" });
}

export function frequencyToMonths(frequency: InstallmentFrequency) {
  if (frequency === "QUARTERLY") return 3;
  if (frequency === "ANNUALLY") return 12;
  return 1;
}

export function calculateNumberOfInstallments(durationMonths: number, frequency: InstallmentFrequency) {
  return Math.max(1, Math.ceil(durationMonths / frequencyToMonths(frequency)));
}

export function calculateAmountPerInstallment(totalAmount: number, numberOfInstallments: number) {
  if (!Number.isFinite(totalAmount) || numberOfInstallments <= 0) return 0;
  return totalAmount / numberOfInstallments;
}

export function parseDateStart(ymd?: string | null) {
  if (!ymd) return undefined;
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseDateEnd(ymd?: string | null) {
  if (!ymd) return undefined;
  const d = new Date(`${ymd}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function buildMonthColumns(fromParam?: string, toParam?: string, defaultMonths = 6): MonthColumn[] {
  const now = new Date();
  const endDate = parseDateEnd(toParam) ?? now;
  const startDate = parseDateStart(fromParam)
    ?? new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - defaultMonths + 1, 1));

  const cols: MonthColumn[] = [];
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  while (cursor <= endDate) {
    const from = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const to = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    cols.push({ key: monthKey(from), label: monthLabel(from), from, to });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return cols;
}

export function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
}

export function buildDueDates(
  invoiceDate: Date,
  numberOfInstallments: number,
  frequency: InstallmentFrequency,
) {
  const step = frequencyToMonths(frequency);
  return Array.from({ length: numberOfInstallments }, (_, index) => addUtcMonths(invoiceDate, index * step));
}

export function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replaceAll(",", "").trim();
    if (!cleaned) return Number.NaN;
    return Number(cleaned);
  }
  return Number.NaN;
}