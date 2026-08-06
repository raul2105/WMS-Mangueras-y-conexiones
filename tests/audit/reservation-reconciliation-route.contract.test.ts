import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("reservation reconciliation maintenance endpoint", () => {
  it("is disabled by default and requires inventory adjustment permission", () => {
    const source = readFileSync("app/api/admin/reconciliation/sales-reservations/route.ts", "utf8");
    expect(source).toContain('RESERVATION_RECONCILIATION_ENABLED !== "true"');
    expect(source).toContain('requirePermission("inventory.adjust")');
    expect(source).toContain('body?.mode === "APPLY"');
  });
});
