import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const seed = path.resolve("prisma/seed.cjs");
const canonical = "postgresql://unused:unused@wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com:5432/wms?schema=public";

function blockedSeed(overrides: Record<string, string>) {
  return spawnSync(process.execPath, [seed], {
    env: { ...process.env, NODE_ENV: "test", WMS_ENV: "dev", WMS_ENVIRONMENT: "dev", WMS_ALLOW_REMOTE_DEMO_SEED: "", DATABASE_URL: canonical, ...overrides },
    encoding: "utf8",
    timeout: 5000,
  });
}

describe("demo seed safety", () => {
  it("refuses canonical DEV/public even with remote opt-in", () => {
    const result = blockedSeed({ WMS_ALLOW_REMOTE_DEMO_SEED: "1" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("prohibited against canonical AWS DEV/public");
  });

  it("refuses a remote disposable schema without explicit opt-in", () => {
    const result = blockedSeed({ DATABASE_URL: canonical.replace("schema=public", "schema=disposable_seed_validation") });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("requires WMS_ALLOW_REMOTE_DEMO_SEED=1");
  });

  it("refuses a production environment even for a local database", () => {
    const result = blockedSeed({ WMS_ENVIRONMENT: "prod", DATABASE_URL: "file:./never-created.db" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("prohibited in production");
  });

  it("refuses NODE_ENV production even if DEV and remote opt-in are set", () => {
    const result = blockedSeed({ NODE_ENV: "production", WMS_ALLOW_REMOTE_DEMO_SEED: "1" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("prohibited in production");
  });
});
