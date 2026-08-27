import { expect, test, type Browser, type TestInfo } from "@playwright/test";
import { EXPECTED_HOME, loginAs, type RoleKey } from "./lib/auth.helpers";

const enabled = process.env.WMS_AWS_READONLY_E2E === "1";
const roles: RoleKey[] = ["SALES_EXECUTIVE", "WAREHOUSE_OPERATOR", "MANAGER", "SYSTEM_ADMIN"];
const viewports = [
  { name: "desktop-1440", width: 1440, height: 1000 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
] as const;
const themes = ["dark", "light"] as const;

async function captureRoleHome(browser: Browser, role: RoleKey, testInfo: TestInfo) {
  for (const viewport of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript((selectedTheme) => {
        window.localStorage.setItem("wms-theme", selectedTheme);
      }, theme);
      const page = await context.newPage();
      try {
        await loginAs(page, role, EXPECTED_HOME[role], EXPECTED_HOME[role]);
        await expect(page.locator("main")).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.screenshot({
          path: testInfo.outputPath(`${role.toLowerCase()}-${viewport.name}-${theme}.png`),
          fullPage: true,
        });
      } finally {
        await context.close();
      }
    }
  }
}

test.describe("AWS DEV role visual baseline", () => {
  test.skip(!enabled, "Set WMS_AWS_READONLY_E2E=1 to capture the authenticated AWS role baseline.");

  for (const role of roles) {
    test(`${role} home at desktop, tablet and mobile in both themes`, async ({ browser }, testInfo) => {
      await captureRoleHome(browser, role, testInfo);
    });
  }
});
