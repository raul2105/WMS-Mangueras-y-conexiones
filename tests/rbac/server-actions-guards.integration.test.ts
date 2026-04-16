import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  const fullPath = path.join(process.cwd(), relativePath);
  return fs.readFileSync(fullPath, "utf8");
}

describe("rbac guards in critical server actions/pages", () => {
  it("inventory adjust action enforces inventory.adjust", () => {
    const content = readWorkspaceFile("app/(shell)/inventory/adjust/page.tsx");
    expect(content).toContain('requirePermission("inventory.adjust")');
  });

  it("inventory transfer action enforces inventory.transfer", () => {
    const content = readWorkspaceFile("app/(shell)/inventory/transfer/page.tsx");
    expect(content).toContain('requirePermission("inventory.transfer")');
  });

  it("inventory pick action enforces inventory.pick", () => {
    const content = readWorkspaceFile("app/(shell)/inventory/pick/page.tsx");
    expect(content).toContain('requirePermission("inventory.pick")');
  });

  it("audit page is protected by audit.view page guard", () => {
    const content = readWorkspaceFile("app/(shell)/audit/page.tsx");
    expect(content).toContain('pageGuard("audit.view")');
  });

  it("request write flows use write guard helper", () => {
    const newOrderContent = readWorkspaceFile("app/(shell)/production/requests/new/page.tsx");
    const detailContent = readWorkspaceFile("app/(shell)/production/requests/[id]/page.tsx");

    expect(newOrderContent).toContain("requireSalesWriteAccess()");
    expect(detailContent).toContain("requireSalesWriteAccess()");
  });

  it("request detail uses selected product ids for direct product lines", () => {
    const detailContent = readWorkspaceFile("app/(shell)/production/requests/[id]/page.tsx");
    const formContent = readWorkspaceFile("components/RequestProductLineForm.tsx");

    expect(detailContent).toContain('formData.get("productId")');
    expect(detailContent).not.toContain('formData.get("productQuery")');
    expect(formContent).toContain('name="productId"');
    expect(formContent).toContain("ProductSearchField");
  });

  it("product search wiring keeps direct request lines broad and assembly search typed", () => {
    const directFormContent = readWorkspaceFile("components/RequestProductLineForm.tsx");
    const assemblyFormContent = readWorkspaceFile("components/AssemblyConfiguratorForm.tsx");

    expect(directFormContent).not.toContain('productType=');
    expect(assemblyFormContent).toContain('productType="FITTING"');
    expect(assemblyFormContent).toContain('productType="HOSE"');
    expect(directFormContent).toContain('name="productId"');
    expect(assemblyFormContent).toContain('fieldKey="assembly-entry-fitting"');
  });
});
