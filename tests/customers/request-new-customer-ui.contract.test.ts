import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("new request customer selector UI contract", () => {
  it("page.tsx renders NewOrderForm and passes the limited quick-create capability", () => {
    const content = readWorkspaceFile("app/(shell)/production/requests/new/page.tsx");
    expect(content).toContain("NewOrderForm");
    expect(content).toContain("canViewCustomers");
    expect(content).toContain("canManageCustomers");
    expect(content).toContain("canQuickCreateCustomers");
    expect(content).toContain("canViewCustomers={canViewCustomers}");
    expect(content).toContain("canManageCustomers={canManageCustomers}");
    expect(content).toContain("canQuickCreateCustomers={canQuickCreateCustomers}");
  });

  it("NewOrderForm uses CustomerSearchField for catalog users and keeps manual fallback", () => {
    const content = readWorkspaceFile("components/NewOrderForm.tsx");
    expect(content).toContain("CustomerSearchField");
    expect(content).toContain("canViewCustomers");
    expect(content).toContain("canManageCustomers");
    expect(content).toContain('name="customerId"');
    expect(content).toContain('name="customerName"');
    expect(content).toContain("allowQuickCreate={canQuickCreateCustomers}");
    expect(content).toContain("allowQuickCreateCode={canManageCustomers}");
    expect(content).not.toContain("<datalist");
  });

  it("includes inline quick-create behavior in selector component", () => {
    const selectorContent = readWorkspaceFile("components/CustomerSearchField.tsx");
    expect(selectorContent).toContain('fetch("/api/customers"');
    expect(selectorContent).toContain("allowQuickCreate = false");
    expect(selectorContent).toContain("allowQuickCreateCode = false");
    expect(selectorContent).toContain("onChange?.(option.id)");
    expect(selectorContent).toContain("onChange?.(created.id)");
  });

  it("quick-create api uses customerQuickCreateInlineSchema", () => {
    const apiContent = readWorkspaceFile("app/api/customers/route.ts");
    expect(apiContent).toContain("customerQuickCreateInlineSchema");
    expect(apiContent).toContain('"customers.quick_create_sales"');
    expect(apiContent).toContain("sales-quick-create");
  });

  it("does not treat a query-only commercial context as an executable order line", () => {
    const formContent = readWorkspaceFile("components/NewOrderForm.tsx");
    expect(formContent).toContain("const hasProductContext = orderLines.length > 0;");
    expect(formContent).toContain('missing.push("orderLines")');
    expect(formContent).toContain('disabled={readinessState !== "ready"}');
  });
});
