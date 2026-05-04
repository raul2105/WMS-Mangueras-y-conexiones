import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("home dashboard KAN-50 slice contract", () => {
  it("keeps operational focus and actionable navigation for admin/manager", () => {
    const content = readWorkspaceFile("app/(shell)/page.tsx");

    expect(content).toContain('title="Dashboard de pedidos por surtir"');
    expect(content).toContain("getFulfillmentDashboardSnapshot");
    expect(content).toContain('href="/production/requests"');
    expect(content).toContain('href="/production"');
    expect(content).toContain("FulfillmentKpiGrid");
    expect(content).toContain("FulfillmentPriorityQueue");
    expect(content).toContain("FulfillmentAlertList");
  });

  it("preserves role-home redirect behavior", () => {
    const content = readWorkspaceFile("app/(shell)/page.tsx");

    expect(content).toContain("ROLE_HOME");
    expect(content).toContain("if (home !== \"/\")");
    expect(content).toContain("redirect(home)");
  });
});
