import { describe, expect, it } from "vitest";
import { formatBusinessDate } from "@/lib/business-date";

describe("formatBusinessDate", () => {
  it("preserves the calendar day regardless of the server timezone", () => {
    expect(formatBusinessDate(new Date("2026-08-01T00:00:00.000Z"))).toBe("1/8/2026");
  });

  it("renders invalid values as an unavailable business date", () => {
    expect(formatBusinessDate("not-a-date")).toBe("--");
  });
});
