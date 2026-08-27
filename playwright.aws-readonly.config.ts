import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.WMS_LIVE_BASE_URL ?? "https://d2b1ltxtvypxr4.cloudfront.net";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["kan128-aws-readonly-evidence.spec.ts", "aws-role-visual-audit.spec.ts"],
  timeout: 240000,
  expect: { timeout: 20000 },
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
