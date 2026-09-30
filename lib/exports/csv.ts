/**
 * Serializes a single CSV cell and prevents spreadsheet formula execution for
 * untrusted text values. Numeric values stay numeric, including negatives.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  let text = String(value);
  if (typeof value === "string" && (/^[\t\r\n]/.test(text) || /^[\u0000-\u0020]*[=+\-@]/.test(text))) {
    text = `'${text}`;
  }

  if (/[",\r\n\t]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
