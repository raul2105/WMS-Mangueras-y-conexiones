import { describe, expect, it } from "vitest";
import { formatDateTimeForTimeZone } from "@/lib/local-date-time";

describe("formatDateTimeForTimeZone", () => {
  const instant = "2026-07-30T18:59:00.000Z";

  it("renders the same instant in the requested device timezone", () => {
    expect(formatDateTimeForTimeZone(instant, "UTC")).toContain("18:59");
    expect(formatDateTimeForTimeZone(instant, "America/Mexico_City")).toContain("12:59");
  });

  it("keeps invalid timestamps unavailable", () => {
    expect(formatDateTimeForTimeZone("not-a-date", "UTC")).toBe("--");
  });
});
