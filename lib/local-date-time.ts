export type LocalDateTimeValue = Date | string | null | undefined;

/**
 * Timestamps represent instants and should be rendered in the timezone of the
 * device that is operating the WMS. Calendar business dates use business-date
 * instead and must not use this formatter.
 */
export function formatDateTimeForTimeZone(
  value: LocalDateTimeValue,
  timeZone: string,
  locale = "es-MX",
) {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
