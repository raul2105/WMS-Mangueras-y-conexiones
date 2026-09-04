import { defineConfig, devices } from "@playwright/test";

if (process.env.WMS_AWS_WRITE_E2E !== "1") {
  throw new Error(
    "AWS write E2E is disabled. Set WMS_AWS_WRITE_E2E=1 only for an explicitly authorized test environment.",
  );
}

const baseURL = process.env.WMS_LIVE_BASE_URL ?? "https://d2b1ltxtvypxr4.cloudfront.net";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["sales-configured-assembly.spec.ts", "aws-v1-v5-v7-v8-browser.spec.ts"],
  timeout: 240000,
  expect: { timeout: 20000 },
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  outputDir: "test-results/aws-write",
  use: {
    baseURL,
    trace: "on",
    screenshot: "on",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
