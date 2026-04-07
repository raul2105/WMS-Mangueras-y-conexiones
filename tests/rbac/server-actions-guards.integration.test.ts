import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  const fullPath = path.join(process.cwd(), relativePath);
  return fs.readFileSync(fullPath, "utf8");
}

describe("rbac guards in critical server actions/pages", () => {
  it("inventory adjust action enforces inventory.adjust", () => {
    const content = readWorkspaceFile("app/inventory/adjust/page.tsx");
    expect(content).toContain('requirePermission("inventory.adjust")');
  });

  it("inventory transfer action enforces inventory.transfer", () => {
    const content = readWorkspaceFile("app/inventory/transfer/page.tsx");
    expect(content).toContain('requirePermission("inventory.transfer")');
  });

  it("inventory pick action enforces inventory.pick", () => {
    const content = readWorkspaceFile("app/inventory/pick/page.tsx");
    expect(content).toContain('requirePermission("inventory.pick")');
  });

  it("audit page is protected by audit.view page guard", () => {
    const content = readWorkspaceFile("app/audit/page.tsx");
    expect(content).toContain('pageGuard("audit.view")');
  });

  it("sales write flows use write guard helper", () => {
    const newOrderContent = readWorkspaceFile("app/sales/orders/new/page.tsx");
    const detailContent = readWorkspaceFile("app/sales/orders/[id]/page.tsx");

    expect(newOrderContent).toContain("requireSalesWriteAccess()");
    expect(detailContent).toContain("requireSalesWriteAccess()");
  });
});
