import { describe, expect, it } from "vitest";
import { escapeCsvCell } from "@/lib/exports/csv";

describe("CSV cell serialization", () => {
  it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1:A2)", "  =1+1"])(
    "marks formula-like text as literal: %j",
    (value) => {
      expect(escapeCsvCell(value)).toBe(`'${value}`);
    },
  );

  it.each([
    ["\t=1+1", `"'\t=1+1"`],
    ["\r=1+1", `"'\r=1+1"`],
    ["\n=1+1", `"'\n=1+1"`],
  ])("neutralizes leading control characters and preserves valid CSV quoting", (value, expected) => {
    expect(escapeCsvCell(value)).toBe(expected);
  });

  it("preserves numeric negative values as numbers while marking negative text literal", () => {
    expect(escapeCsvCell(-42)).toBe("-42");
    expect(escapeCsvCell("-42")).toBe("'-42");
  });

  it("quotes delimiters and escapes quotes without changing the cell content", () => {
    expect(escapeCsvCell('ACME, "North"\r\nWarehouse')).toBe('"ACME, ""North""\r\nWarehouse"');
    expect(escapeCsvCell("item\tcode")).toBe('"item\tcode"');
  });

  it("keeps empty nullable values empty", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });
});
