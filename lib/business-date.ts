/**
 * Commercial due dates are calendar days, not instants. They are persisted at
 * midnight UTC, so formatting must stay in UTC to avoid a one-day shift when
 * the server runs in a different local timezone.
 */
export function formatBusinessDate(
  value: Date | string | null | undefined,
  locale = "es-MX",
) {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString(locale, { timeZone: "UTC" });
}

/**
 * Business timezone for the commercial operation.
 * All due dates are normalized to this timezone before persistence
 * to ensure CloudFront (UTC) and localhost (local) produce consistent dates.
 */
export const BUSINESS_TIMEZONE = "America/Mexico_City";

/**
 * Normalize a date to the business timezone at midnight.
 * This ensures that regardless of the server/client timezone,
 * the same calendar date is persisted.
 */
export function normalizeToBusinessTimezone(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date for business timezone normalization");
  }

  // Get the date components in the business timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  // Return midnight UTC of that business date
  return new Date(Date.UTC(year, month - 1, day));
}

export function parseBusinessDate(value?: string) {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const [, yearRaw, monthRaw, dayRaw] = match;
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    const isCalendarDate =
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day;
    return isCalendarDate ? parsed : null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
