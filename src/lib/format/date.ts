/**
 * Format a Date object as DD/MM/YYYY.
 *
 * Examples:
 *   formatDate(new Date("2024-03-15")) => "15/03/2024"
 *   formatDate(new Date("2024-12-01")) => "01/12/2024"
 */
export function formatDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

