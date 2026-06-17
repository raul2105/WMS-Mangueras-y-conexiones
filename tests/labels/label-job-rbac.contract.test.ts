import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("label job RBAC contract", () => {
  it("hides trace navigation behind audit permission checks", () => {
    const content = readWorkspaceFile("app/(shell)/labels/jobs/[id]/page.tsx");

    expect(content).toContain('hasPermissionInSession("audit.view")');
    expect(content).toContain("{canViewTrace ? (");
  });
});
