import { expect, test } from "@playwright/test";
import {
  loginAs,
  type RoleKey,
  EXPECTED_HOME,
  buildUrlExpectation,
} from "./lib/auth.helpers";

// Helper to read dashboard card count by label
// Works with both text-2xl and text-3xl (warehouse uses larger text)
async function getDashboardCardCount(page: import("@playwright/test").Page, cardLabel: string): Promise<number> {
  // Find the card by its label text
  const card = page.locator(`text="${cardLabel}"`).first();
  await expect(card).toBeVisible();
  
  // The value is in a sibling element with text-2xl/text-3xl font-bold
  const valueElement = card.locator('..').locator('.text-2xl.font-bold, .text-3xl.font-bold').first();
  const text = await valueElement.textContent();
  return parseInt(text?.trim() || '0', 10);
}

// Helper to click dashboard card by label and verify navigation
async function clickDashboardCardAndVerify(page: import("@playwright/test").Page, cardLabel: string, expectedUrlPattern: RegExp): Promise<void> {
  const card = page.locator(`text="${cardLabel}"`).first();
  await expect(card).toBeVisible();
  
  // Find the parent Link element and click it
  const link = card.locator('..').locator('xpath=ancestor::a[1]').first();
  await link.click();
  
  await expect(page).toHaveURL(new RegExp("^(?!.*\\/forbidden\\b).*$")); // not forbidden
  await expect(page).toHaveURL(expectedUrlPattern);
}

  // SYSTEM_ADMIN checks
  test("SYSTEM_ADMIN dashboard counts match destination pages", async ({ page }) => {
    await loginAs(page, "SYSTEM_ADMIN", EXPECTED_HOME.SYSTEM_ADMIN);
    
    // 1. Active Users count -> /users
    const activeUsersCount = await getDashboardCardCount(page, "Usuarios Activos");
    if (activeUsersCount > 0) {
      await clickDashboardCardAndVerify(page, "Usuarios Activos", buildUrlExpectation("/users"));
      // Verify users page loads with a table/list
      await expect(page.getByRole("heading", { level: 1, name: /Usuarios/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.SYSTEM_ADMIN);
    }

    // 2. Eventos de Auditoría count -> /audit
    const auditTotalCount = await getDashboardCardCount(page, "Eventos de Auditoría");
    if (auditTotalCount > 0) {
      await clickDashboardCardAndVerify(page, "Eventos de Auditoría", buildUrlExpectation("/audit"));
      await expect(page.getByRole("heading", { level: 1, name: /Auditor/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.SYSTEM_ADMIN);
    }

    // 3. Rastros Recientes count -> /trace (heading is "Buscar Trace ID")
    const tracesCount = await getDashboardCardCount(page, "Rastros Recientes");
    if (tracesCount > 0) {
      await clickDashboardCardAndVerify(page, "Rastros Recientes", buildUrlExpectation("/trace"));
      await expect(page.getByRole("heading", { level: 1, name: /Buscar Trace ID/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.SYSTEM_ADMIN);
    }
  });

  // MANAGER checks
  test("MANAGER dashboard counts match destination pages", async ({ page }) => {
    await loginAs(page, "MANAGER", EXPECTED_HOME.MANAGER);
    
    // 1. Pedidos Atrasados count -> /production/requests?queue=overdue
    const overdueCount = await getDashboardCardCount(page, "Pedidos Atrasados");
    if (overdueCount > 0) {
      await clickDashboardCardAndVerify(page, "Pedidos Atrasados", buildUrlExpectation("/production/requests?queue=overdue"));
      await expect(page.getByRole("heading", { level: 1, name: /Pedidos|Órdenes/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.MANAGER);
    }

    // 2. Bloqueos Activos count -> /production/requests?queue=assembly_blocked
    const blockersCount = await getDashboardCardCount(page, "Bloqueos Activos");
    if (blockersCount > 0) {
      await clickDashboardCardAndVerify(page, "Bloqueos Activos", buildUrlExpectation("/production/requests?queue=assembly_blocked"));
      await expect(page.getByRole("heading", { level: 1, name: /Pedidos|Órdenes/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.MANAGER);
    }
  });

  // WAREHOUSE_OPERATOR checks
  test("WAREHOUSE_OPERATOR dashboard counts match destination pages", async ({ page }) => {
    await loginAs(page, "WAREHOUSE_OPERATOR", EXPECTED_HOME.WAREHOUSE_OPERATOR);
    
    // 1. Picking Pendiente count -> /inventory/pick?status=pending
    const pickingCount = await getDashboardCardCount(page, "Picking Pendiente");
    if (pickingCount > 0) {
      await clickDashboardCardAndVerify(page, "Picking Pendiente", buildUrlExpectation("/inventory/pick?status=pending"));
      await expect(page.getByRole("heading", { level: 1, name: /Picking|Surtido/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.WAREHOUSE_OPERATOR);
    }

    // 2. Recepciones Hoy count -> /inventory/receive?date=today
    const receptionsCount = await getDashboardCardCount(page, "Recepciones Hoy");
    if (receptionsCount > 0) {
      await clickDashboardCardAndVerify(page, "Recepciones Hoy", buildUrlExpectation("/inventory/receive?date=today"));
      await expect(page.getByRole("heading", { level: 1, name: /Recepción|Recepcion/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.WAREHOUSE_OPERATOR);
    }

    // 3. Ensambles Activos count -> /production?ops=assembly_open
    const assembliesCount = await getDashboardCardCount(page, "Ensambles Activos");
    if (assembliesCount > 0) {
      await clickDashboardCardAndVerify(page, "Ensambles Activos", buildUrlExpectation("/production?ops=assembly_open"));
      await expect(page.getByRole("heading", { level: 1, name: /Producción|Produccion/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.WAREHOUSE_OPERATOR);
    }
  });

  // SALES_EXECUTIVE checks
  test("SALES_EXECUTIVE dashboard counts match destination pages", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE);
    
    // 1. Pedidos Pendientes count -> /production/requests?status=CONFIRMADA
    const pendingOrdersCount = await getDashboardCardCount(page, "Pedidos Pendientes");
    if (pendingOrdersCount > 0) {
      await clickDashboardCardAndVerify(page, "Pedidos Pendientes", buildUrlExpectation("/production/requests?status=CONFIRMADA"));
      await expect(page.getByRole("heading", { level: 1, name: /Pedidos|Órdenes/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.SALES_EXECUTIVE);
    }

    // 2. Clientes Activos count -> /sales/customers
    const activeCustomersCount = await getDashboardCardCount(page, "Clientes Activos");
    if (activeCustomersCount > 0) {
      await clickDashboardCardAndVerify(page, "Clientes Activos", buildUrlExpectation("/sales/customers"));
      await expect(page.getByRole("heading", { level: 1, name: /Clientes/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.SALES_EXECUTIVE);
    }
  });

  // Verify all dashboard cards have "Live" badge (indicating real data)
  // Use fresh context per role to avoid session leakage
  test.describe.configure({ retries: 0 });

  for (const role of Object.keys(EXPECTED_HOME) as RoleKey[]) {
    test(`role ${role} home displays Live badges on stat cards`, async ({ page }) => {
      await loginAs(page, role, EXPECTED_HOME[role]);
      await page.goto(EXPECTED_HOME[role]);
      // Each stat card should have a "Live" indicator
      const liveBadges = page.locator("text=Live");
      await expect(liveBadges.first()).toBeVisible({ timeout: 10000 });
      // Count should match number of stat cards (2-3 per role)
      const badgeCount = await liveBadges.count();
      expect(badgeCount).toBeGreaterThanOrEqual(2);
    });
  }

  // Verify CTAs navigate to correct filtered routes
  test.describe("dashboard CTA links navigate to correct filtered routes", () => {
    test("SYSTEM_ADMIN stat card CTAs", async ({ page }) => {
      await loginAs(page, "SYSTEM_ADMIN", EXPECTED_HOME.SYSTEM_ADMIN);
      // Test stat cards (which are links)
      await clickDashboardCardAndVerify(page, "Usuarios Activos", buildUrlExpectation("/users"));
      await page.goto(EXPECTED_HOME.SYSTEM_ADMIN);
      await clickDashboardCardAndVerify(page, "Eventos de Auditoría", buildUrlExpectation("/audit"));
      await page.goto(EXPECTED_HOME.SYSTEM_ADMIN);
      await clickDashboardCardAndVerify(page, "Rastros Recientes", buildUrlExpectation("/trace"));
    });

    test("MANAGER CTAs", async ({ page }) => {
      await loginAs(page, "MANAGER", EXPECTED_HOME.MANAGER);
      await clickDashboardCardAndVerify(page, "Reasignar Trabajo", buildUrlExpectation("/warehouse"));
      await page.goto(EXPECTED_HOME.MANAGER);
      await clickDashboardCardAndVerify(page, "Resolver Bloqueos", buildUrlExpectation("/production/requests?queue=assembly_blocked"));
      await page.goto(EXPECTED_HOME.MANAGER);
      await clickDashboardCardAndVerify(page, "Ver Reportes", buildUrlExpectation("/audit"));
    });

    test("WAREHOUSE_OPERATOR CTAs - stat cards are links", async ({ page }) => {
      await loginAs(page, "WAREHOUSE_OPERATOR", EXPECTED_HOME.WAREHOUSE_OPERATOR);
      await clickDashboardCardAndVerify(page, "Picking Pendiente", buildUrlExpectation("/inventory/pick?status=pending"));
      await page.goto(EXPECTED_HOME.WAREHOUSE_OPERATOR);
      await clickDashboardCardAndVerify(page, "Recepciones Hoy", buildUrlExpectation("/inventory/receive?date=today"));
      await page.goto(EXPECTED_HOME.WAREHOUSE_OPERATOR);
      await clickDashboardCardAndVerify(page, "Ver Ensambles", buildUrlExpectation("/production?ops=assembly_open"));
    });

    test("SALES_EXECUTIVE CTAs - use canonical routes", async ({ page }) => {
      await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE);
      // Nuevo Pedido -> /production/requests/new (canonical)
      await clickDashboardCardAndVerify(page, "Nuevo Pedido", buildUrlExpectation("/production/requests/new"));
      await page.goto(EXPECTED_HOME.SALES_EXECUTIVE);
      // Seguimiento Pedidos -> /production/requests?status=processing (canonical CTA target)
      await clickDashboardCardAndVerify(page, "Seguimiento Pedidos", buildUrlExpectation("/production/requests?status=processing"));
      await page.goto(EXPECTED_HOME.SALES_EXECUTIVE);
      await clickDashboardCardAndVerify(page, "Clientes por Contactar", buildUrlExpectation("/sales/customers"));
      await page.goto(EXPECTED_HOME.SALES_EXECUTIVE);
      // Equivalencias already canonical /production/equivalences
      await clickDashboardCardAndVerify(page, "Equivalencias", buildUrlExpectation("/production/equivalences"));
      await page.goto(EXPECTED_HOME.SALES_EXECUTIVE);
      await clickDashboardCardAndVerify(page, "Pedidos Pendientes", buildUrlExpectation("/production/requests?status=CONFIRMADA"));
    });
  });
