import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("new request customer selector UI contract", () => {
  it("uses CustomerSearchField for catalog users and keeps manual fallback", () => {
    const content = readWorkspaceFile("app/(shell)/production/requests/new/page.tsx");
    expect(content).toContain("CustomerSearchField");
    expect(content).toContain("canViewCustomers ? (");
    expect(content).toContain("canManageCustomers");
    expect(content).toContain('name="customerId"');
    expect(content).toContain('name="customerName"');
    expect(content).toContain("allowQuickCreate={canManageCustomers}");
    expect(content).not.toContain("<datalist");
  });

  it("includes inline quick-create behavior in selector component", () => {
    const selectorContent = readWorkspaceFile("components/CustomerSearchField.tsx");
    expect(selectorContent).toContain('fetch("/api/customers"');
    expect(selectorContent).toContain("allowQuickCreate = false");
    expect(selectorContent).toContain("quickCreateLabel = \"Crear cliente rápido\"");
  });

  it("quick-create api uses customerQuickCreateInlineSchema", () => {
    const apiContent = readWorkspaceFile("app/api/customers/route.ts");
    expect(apiContent).toContain("customerQuickCreateInlineSchema");
    expect(apiContent).toContain('requirePermission("customers.manage")');
  });
});

