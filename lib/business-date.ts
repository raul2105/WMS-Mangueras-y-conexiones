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
