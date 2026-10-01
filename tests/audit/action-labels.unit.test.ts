import { describe, expect, it } from "vitest";
import { auditActionLabel } from "@/lib/audit/action-labels";

describe("auditActionLabel", () => {
  it("translates inventory actions regardless of legacy casing or separators", () => {
    expect(auditActionLabel("RELEASE_RESERVED_STOCK")).toBe("Liberar inventario reservado");
    expect(auditActionLabel("release reserved stock")).toBe("Liberar inventario reservado");
    expect(auditActionLabel("move-reserved-stock-to-location")).toBe("Mover inventario reservado");
  });
});
