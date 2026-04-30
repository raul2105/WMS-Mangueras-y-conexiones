import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("customer quick-create api contract", () => {
  it("enforces customers.manage permission", () => {
    const content = readWorkspaceFile("app/api/customers/route.ts");
    expect(content).toContain('requirePermission("customers.manage")');
  });

  it("validates input with customerQuickCreateInlineSchema", () => {
    const content = readWorkspaceFile("app/api/customers/route.ts");
    expect(content).toContain("customerQuickCreateInlineSchema");
    expect(content).toContain("firstErrorMessage");
  });

  it("persists with createCustomer service", () => {
    const content = readWorkspaceFile("app/api/customers/route.ts");
    expect(content).toContain("createCustomer(prisma");
    expect(content).toContain("CustomerServiceError");
  });
});
