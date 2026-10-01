import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

if (process.env.WMS_AWS_ACCEPTANCE_E2E !== "1") {
  throw new Error("Set WMS_AWS_ACCEPTANCE_E2E=1 for the authorized canonical AWS acceptance lane.");
}

const baseURL = process.env.WMS_LIVE_BASE_URL ?? "https://d2b1ltxtvypxr4.cloudfront.net";
if (new URL(baseURL).origin !== "https://d2b1ltxtvypxr4.cloudfront.net") {
  throw new Error("The acceptance lane must target the canonical AWS runtime.");
}

const writeEnabled = process.env.WMS_AWS_WRITE_E2E === "1";
if (writeEnabled) {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    database.hostname !== "wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com" ||
    database.pathname !== "/wms" ||
    ![null, "public"].includes(database.searchParams.get("schema"))
  ) {
    throw new Error("Browser writes require the canonical AWS database and public schema.");
  }
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: [
    "a11y-smoke.spec.ts",
    "full-role-matrix.spec.ts",
    "rbac-browser.spec.ts",
    "mobile-smoke.spec.ts",
    "aws-role-visual-audit.spec.ts",
    ...(process.env.WMS_E2E_INCLUDE_GMAIL === "1" ? ["aws-gmail-settings.spec.ts"] : []),
    "kan128-aws-readonly-evidence.spec.ts",
    ...(writeEnabled ? [
      "mixed-order-continuity.spec.ts",
      "sales-configured-assembly.spec.ts",
      "aws-v1-v5-v7-v8-browser.spec.ts",
      "purchasing-pdf-flow.spec.ts",
      "purchasing-replenishment-receipt.spec.ts",
      "aws-audit-actor-filter.spec.ts",
      "aws-warehouse-ownership-summary.spec.ts",
      "aws-server-action-permissions.spec.ts",
      "aws-inventory-operations-browser.spec.ts",
    ] : []),
  ],
  timeout: 240000,
  expect: { timeout: 20000 },
  forbidOnly: true,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  outputDir: process.env.WMS_AWS_ARTIFACT_DIR ?? "output/aws-acceptance/artifacts",
  reporter: [
    ["html", { open: "never", outputFolder: "output/aws-acceptance/report" }],
    ["json", { outputFile: "output/aws-acceptance/results.json" }],
    ["list"],
  ],
  use: { baseURL, trace: "off", screenshot: "on", video: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["iPhone 12"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
