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
    expect(content).toContain('name="customerId"');
    expect(content).toContain('name="customerName"');
    expect(content).not.toContain("<datalist");
  });

  it("does not include inline quick-create CTA in this simple flow", () => {
    const pageContent = readWorkspaceFile("app/(shell)/production/requests/new/page.tsx");
    const selectorContent = readWorkspaceFile("components/CustomerSearchField.tsx");

    expect(pageContent).not.toContain("customerQuickCreateInlineSchema");
    expect(pageContent).not.toContain("Crear cliente");
    expect(selectorContent).not.toContain("Crear cliente");
    expect(selectorContent).not.toContain("useActionState");
  });
});

