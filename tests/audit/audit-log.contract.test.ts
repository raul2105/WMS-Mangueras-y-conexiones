import { describe, expect, it, vi } from "vitest";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";

describe("critical audit contract", () => {
  it("does not swallow persistence failures", async () => {
    const failure = new Error("audit persistence unavailable");
    const db = {
      auditLog: {
        create: vi.fn().mockRejectedValue(failure),
      },
    };

    await expect(createAuditLogSafeWithDb({
      entityType: "INVENTORY",
      action: "RECEIVE",
    }, db as never)).rejects.toBe(failure);
  });
});
