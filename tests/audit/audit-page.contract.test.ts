import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("audit page narrative contract", () => {
  it("keeps readable event reconstruction alongside the raw table", () => {
    const content = readWorkspaceFile("app/(shell)/audit/page.tsx");

    expect(content).toContain("describeAuditEvent");
    expect(content).toContain("registró una recepción de inventario");
    expect(content).toContain("confirmó surtido directo");
    expect(content).toContain("Actor:");
  });
});
