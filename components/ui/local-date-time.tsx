"use client";

import {
  formatDateTimeForTimeZone,
  type LocalDateTimeValue,
} from "@/lib/local-date-time";

type Props = {
  value: LocalDateTimeValue;
  className?: string;
};

/** Renders an instant in the browser's timezone without leaking Lambda time. */
export function LocalDateTime({ value, className }: Props) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  const isoValue = date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
  const timeZone = typeof window === "undefined"
    ? null
    : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatted = timeZone ? formatDateTimeForTimeZone(value, timeZone) : "--";

  return (
    <time
      className={className}
      dateTime={isoValue}
      title="Hora local del equipo"
      suppressHydrationWarning
    >
      {formatted}
    </time>
  );
}
