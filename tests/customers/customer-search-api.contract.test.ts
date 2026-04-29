import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("customer search API contract", () => {
  it("enforces customers.view and active-only search", () => {
    const content = readWorkspaceFile("app/api/customers/search/route.ts");
    expect(content).toContain('requirePermission("customers.view")');
    expect(content).toContain("searchCustomers(prisma");
    expect(content).toContain("isActive: true");
  });

  it("returns stable response shape for selector", () => {
    const content = readWorkspaceFile("app/api/customers/search/route.ts");
    expect(content).toContain("return Response.json({");
    expect(content).toContain("results:");
    expect(content).toContain("selected:");
    expect(content).toContain("nextCursor");
  });
});

