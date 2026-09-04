import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { EXPECTED_HOME, loginAs, type RoleKey } from "./lib/auth.helpers";

const enabled = process.env.WMS_AWS_READONLY_E2E === "1";
const roles: RoleKey[] = ["SALES_EXECUTIVE", "WAREHOUSE_OPERATOR", "MANAGER", "SYSTEM_ADMIN"];
const viewports = [
  { name: "desktop-1440", width: 1440, height: 1000 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
] as const;
const themes = ["dark", "light"] as const;

const roleAcceptance: Record<RoleKey, { heading: RegExp; actions: RegExp[]; purpose: string }> = {
  SALES_EXECUTIVE: {
    heading: /^Ventas$/i,
    actions: [/Nuevo pedido/i, /Buscar producto/i],
    purpose: "Crear y dar seguimiento a pedidos comerciales.",
  },
  WAREHOUSE_OPERATOR: {
    heading: /^Trabajo de hoy$/i,
    actions: [/Ver trabajo|No hay trabajo pendiente/i, /Recibir mercancía/i],
    purpose: "Identificar y ejecutar el siguiente trabajo físico.",
  },
  MANAGER: {
    heading: /^Inicio Gerencial$/i,
    actions: [/Decisiones del día/i, /Revisar pedidos/i],
    purpose: "Priorizar excepciones, asignaciones y aprobaciones.",
  },
  SYSTEM_ADMIN: {
    heading: /^Inicio Administración$/i,
    actions: [/Administración/i, /Gestionar Usuarios/i],
    purpose: "Gobernar usuarios, auditoría y trazabilidad.",
  },
};

async function assertRoleAcceptance(page: Page, role: RoleKey) {
  const acceptance = roleAcceptance[role];
  await expect(page.getByRole("heading", { level: 1, name: acceptance.heading })).toBeVisible();
  for (const expected of acceptance.actions) {
    await expect(page.getByText(expected).first()).toBeVisible();
  }
  const reflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(reflow.scrollWidth).toBeLessThanOrEqual(reflow.clientWidth);
}

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
        await assertRoleAcceptance(page, role);
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
      await testInfo.attach(`${role.toLowerCase()}-pm-uat.json`, {
        body: Buffer.from(JSON.stringify({
          role,
          result: "ACCEPTED_BY_PM_PROXY",
          purpose: roleAcceptance[role].purpose,
          checkedViewports: viewports.map((viewport) => viewport.name),
          checkedThemes: themes,
          conditions: ["home visible", "next actions visible", "role navigation verified", "no horizontal overflow"],
        }, null, 2)),
        contentType: "application/json",
      });
    });
  }
});
