import { describe, expect, it, vi } from "vitest";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";
import fs from "node:fs";
import path from "node:path";

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

  it("keeps catalog mutations and required audit writes in the same transaction", () => {
    for (const relativePath of ["app/(shell)/catalog/new/page.tsx", "app/(shell)/catalog/[id]/edit/page.tsx"]) {
      const content = fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
      expect(content).toContain("prisma.$transaction(async (tx)");
      expect(content).toContain("createAuditLogRequiredWithDb");
      expect(content).toContain("}, tx)");
      expect(content).not.toContain("createAuditLogSafe({");
    }
  });
});
