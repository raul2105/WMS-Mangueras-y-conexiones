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

  it("users pages are protected by users.manage page guard", () => {
    const listContent = readWorkspaceFile("app/(shell)/users/page.tsx");
    const newContent = readWorkspaceFile("app/(shell)/users/new/page.tsx");
    const detailContent = readWorkspaceFile("app/(shell)/users/[id]/page.tsx");
    const editContent = readWorkspaceFile("app/(shell)/users/[id]/edit/page.tsx");

    expect(listContent).toContain('pageGuard("users.manage")');
    expect(newContent).toContain('pageGuard("users.manage")');
    expect(detailContent).toContain('pageGuard("users.manage")');
    expect(editContent).toContain('pageGuard("users.manage")');
  });

  it("users server actions enforce users.manage", () => {
    const newContent = readWorkspaceFile("app/(shell)/users/new/page.tsx");
    const detailContent = readWorkspaceFile("app/(shell)/users/[id]/page.tsx");
    const editContent = readWorkspaceFile("app/(shell)/users/[id]/edit/page.tsx");

    expect(newContent).toContain('requirePermission("users.manage")');
    expect(detailContent).toContain('requirePermission("users.manage")');
    expect(editContent).toContain('requirePermission("users.manage")');
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

  it("assembly release action no longer blocks warehouse operator by hardcoded role check", () => {
    const productionOrderDetail = readWorkspaceFile("app/(shell)/production/orders/[id]/page.tsx");

    expect(productionOrderDetail).toContain("releaseAssemblyPickList(prisma, orderId)");
    expect(productionOrderDetail).not.toContain("Operador de almacén no puede liberar surtido de ensamble");
  });

  it("customer pages enforce customers.view/customers.manage split", () => {
    const listContent = readWorkspaceFile("app/(shell)/sales/customers/page.tsx");
    const newContent = readWorkspaceFile("app/(shell)/sales/customers/new/page.tsx");
    const detailContent = readWorkspaceFile("app/(shell)/sales/customers/[id]/page.tsx");
    const editContent = readWorkspaceFile("app/(shell)/sales/customers/[id]/edit/page.tsx");

    expect(listContent).toContain('pageGuard("customers.view")');
    expect(detailContent).toContain('pageGuard("customers.view")');
    expect(newContent).toContain('pageGuard("customers.manage")');
    expect(editContent).toContain('pageGuard("customers.manage")');
  });

  it("customer server actions enforce customers.manage", () => {
    const newContent = readWorkspaceFile("app/(shell)/sales/customers/new/page.tsx");
    const editContent = readWorkspaceFile("app/(shell)/sales/customers/[id]/edit/page.tsx");

    expect(newContent).toContain('requirePermission("customers.manage")');
    expect(editContent).toContain('requirePermission("customers.manage")');
  });
});
