import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("KAN-52 flow narrative contract", () => {
  it("uses shared flow narrative helper in requests list and detail", () => {
    const listContent = readWorkspaceFile("app/(shell)/production/requests/page.tsx");
    const detailContent = readWorkspaceFile("app/(shell)/production/requests/[id]/page.tsx");

    expect(listContent).toContain("getSalesOrderFlowNarrative");
    expect(detailContent).toContain("getSalesOrderFlowNarrative");
    expect(detailContent).toContain("Siguiente acción");
  });

  it("bridges dashboard queue with homologated flow stage labels", () => {
    const dashboardContent = readWorkspaceFile("components/dashboard/fulfillment-priority-queue.tsx");
    const snapshotContent = readWorkspaceFile("lib/dashboard/fulfillment-dashboard.ts");

    expect(dashboardContent).toContain("row.flowStageLabel");
    expect(snapshotContent).toContain("flowStageLabel");
    expect(snapshotContent).toContain("flowBadgeVariant");
  });
});
