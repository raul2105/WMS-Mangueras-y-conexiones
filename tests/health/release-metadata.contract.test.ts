import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release metadata contract", () => {
  it("exposes environment, commit SHA and release id from health", () => {
    const route = readFileSync("app/api/health/route.ts", "utf8");

    expect(route).toContain("WMS_ENVIRONMENT");
    expect(route).toContain("WMS_COMMIT_SHA");
    expect(route).toContain("WMS_RELEASE_ID");
    expect(route).toContain("environment,");
    expect(route).toContain("commitSha,");
    expect(route).toContain("releaseId,");
  });

  it("wires release metadata into the AWS runtime and deploy reconciliation", () => {
    const stack = readFileSync("infra/cdk/lib/wms-web-stack.js", "utf8");
    const deploy = readFileSync("scripts/deploy/aws-web.ps1", "utf8");

    for (const key of ["WMS_ENVIRONMENT", "WMS_COMMIT_SHA", "WMS_RELEASE_ID"]) {
      expect(stack).toContain(key);
      expect(deploy).toContain(key);
    }
  });
});
