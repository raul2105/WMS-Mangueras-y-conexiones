import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("sales requests customer fallback contract", () => {
  it("list page keeps snapshot > relation > placeholder fallback and guarded link", () => {
    const content = readWorkspaceFile("app/(shell)/production/requests/page.tsx");
    expect(content).toContain('const displayCustomer = order.customerName?.trim() || order.customer?.name || "--";');
    expect(content).toContain("{order.customerId && canViewCustomers ? (");
    expect(content).toContain("href={`/sales/customers/${order.customerId}`}");
  });

  it("detail page keeps snapshot > relation > placeholder fallback and guarded link", () => {
    const content = readWorkspaceFile("app/(shell)/production/requests/[id]/page.tsx");
    expect(content).toContain('const displayCustomer = order.customerName?.trim() || order.customer?.name || "--";');
    expect(content).toContain("{order.customerId && canViewCustomers ? (");
    expect(content).toContain("href={`/sales/customers/${order.customerId}`}");
  });
});

