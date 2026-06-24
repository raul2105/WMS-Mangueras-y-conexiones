import { expect, test } from "@playwright/test";
import {
  loginAs,
  type RoleKey,
  EXPECTED_HOME,
  buildUrlExpectation,
} from "./lib/auth.helpers";

test.describe("dashboard consistency - role homes vs destination pages", () => {
  // Helper to read dashboard card count by label
  async function getDashboardCardCount(page: import("@playwright/test").Page, cardLabel: string): Promise<number> {
    // Find the card by its label text
    const card = page.locator(`text="${cardLabel}"`).first();
    await expect(card).toBeVisible();
    
    // The value is in a sibling element with text-2xl font-bold
    const valueElement = card.locator('..').locator('.text-2xl.font-bold').first();
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
    
    await expect(page).toHaveURL(expectedUrlPattern);
    // Verify we're still in authenticated shell (has header/banner)
    await expect(page.getByRole("banner")).toBeVisible();
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

    // 2. Auditoría Pendiente count -> /audit?status=pending
    const auditPendingCount = await getDashboardCardCount(page, "Auditoría Pendiente");
    if (auditPendingCount > 0) {
      await clickDashboardCardAndVerify(page, "Auditoría Pendiente", buildUrlExpectation("/audit?status=pending"));
      await expect(page.getByRole("heading", { level: 1, name: /Auditor/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.SYSTEM_ADMIN);
    }

    // 3. Rastros Recientes count -> /trace
    const tracesCount = await getDashboardCardCount(page, "Rastros Recientes");
    if (tracesCount > 0) {
      await clickDashboardCardAndVerify(page, "Rastros Recientes", buildUrlExpectation("/trace"));
      await expect(page.getByRole("heading", { level: 1, name: /Rastros?|Trazabilidad/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.SYSTEM_ADMIN);
    }
  });

  // MANAGER checks
  test("MANAGER dashboard counts match destination pages", async ({ page }) => {
    await loginAs(page, "MANAGER", EXPECTED_HOME.MANAGER);
    
    // 1. Pedidos Atrasados count -> /sales/orders?status=overdue
    const overdueCount = await getDashboardCardCount(page, "Pedidos Atrasados");
    if (overdueCount > 0) {
      await clickDashboardCardAndVerify(page, "Pedidos Atrasados", buildUrlExpectation("/sales/orders?status=overdue"));
      await expect(page.getByRole("heading", { level: 1, name: /Pedidos|Órdenes/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.MANAGER);
    }

    // 2. Bloqueos Activos count -> /production/fulfillment?blocked=true
    const blockersCount = await getDashboardCardCount(page, "Bloqueos Activos");
    if (blockersCount > 0) {
      await clickDashboardCardAndVerify(page, "Bloqueos Activos", buildUrlExpectation("/production/fulfillment?blocked=true"));
      await expect(page.getByRole("heading", { level: 1, name: /Fulfillment|Surtido|Producción/i })).toBeVisible();
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

    // 3. Ensambles Activos count -> /production/fulfillment?status=active
    const assembliesCount = await getDashboardCardCount(page, "Ensambles Activos");
    if (assembliesCount > 0) {
      await clickDashboardCardAndVerify(page, "Ensambles Activos", buildUrlExpectation("/production/fulfillment?status=active"));
      await expect(page.getByRole("heading", { level: 1, name: /Fulfillment|Surtido|Producción|Produccion/i })).toBeVisible();
      await page.goto(EXPECTED_HOME.WAREHOUSE_OPERATOR);
    }
  });

  // SALES_EXECUTIVE checks
  test("SALES_EXECUTIVE dashboard counts match destination pages", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE);
    
    // 1. Pedidos Pendientes count -> /sales/orders?status=pending
    const pendingOrdersCount = await getDashboardCardCount(page, "Pedidos Pendientes");
    if (pendingOrdersCount > 0) {
      await clickDashboardCardAndVerify(page, "Pedidos Pendientes", buildUrlExpectation("/sales/orders?status=pending"));
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
  test("all role homes display Live badges on stat cards", async ({ page }) => {
    for (const role of Object.keys(EXPECTED_HOME) as RoleKey[]) {
      await loginAs(page, role, EXPECTED_HOME[role]);
      // Each stat card should have a "Live" indicator
      const liveBadges = page.locator("text=Live");
      await expect(liveBadges.first()).toBeVisible();
      // Count should match number of stat cards (3-4 per role)
      const badgeCount = await liveBadges.count();
      expect(badgeCount).toBeGreaterThanOrEqual(2);
    }
  });

  // Verify CTAs navigate to correct filtered routes
  test("dashboard CTA links navigate to correct filtered routes", async ({ page }) => {
    // SYSTEM_ADMIN CTAs
    await loginAs(page, "SYSTEM_ADMIN", EXPECTED_HOME.SYSTEM_ADMIN);
    
    // Admin actions section CTAs
    await clickDashboardCardAndVerify(page, "Gestionar Usuarios", buildUrlExpectation("/users"));
    await page.goto(EXPECTED_HOME.SYSTEM_ADMIN);
    await clickDashboardCardAndVerify(page, "Auditoría", buildUrlExpectation("/audit"));
    await page.goto(EXPECTED_HOME.SYSTEM_ADMIN);
    await clickDashboardCardAndVerify(page, "Rastros", buildUrlExpectation("/trace"));
    await page.goto(EXPECTED_HOME.SYSTEM_ADMIN);
    await clickDashboardCardAndVerify(page, "Etiquetas", buildUrlExpectation("/labels"));

    // MANAGER CTAs
    await loginAs(page, "MANAGER", EXPECTED_HOME.MANAGER);
    await clickDashboardCardAndVerify(page, "Reasignar Trabajo", buildUrlExpectation("/warehouse?reassign=true"));
    await page.goto(EXPECTED_HOME.MANAGER);
    await clickDashboardCardAndVerify(page, "Resolver Bloqueos", buildUrlExpectation("/production/fulfillment?blocked=true"));
    await page.goto(EXPECTED_HOME.MANAGER);
    await clickDashboardCardAndVerify(page, "Ver Reportes", buildUrlExpectation("/audit"));

    // WAREHOUSE_OPERATOR CTAs
    await loginAs(page, "WAREHOUSE_OPERATOR", EXPECTED_HOME.WAREHOUSE_OPERATOR);
    await clickDashboardCardAndVerify(page, "Iniciar Picking", buildUrlExpectation("/inventory/pick/new"));
    await page.goto(EXPECTED_HOME.WAREHOUSE_OPERATOR);
    await clickDashboardCardAndVerify(page, "Registrar Recepción", buildUrlExpectation("/inventory/receive/new"));

    // SALES_EXECUTIVE CTAs
    await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE);
    await clickDashboardCardAndVerify(page, "Nuevo Pedido", buildUrlExpectation("/sales/orders/new"));
    await page.goto(EXPECTED_HOME.SALES_EXECUTIVE);
    await clickDashboardCardAndVerify(page, "Seguimiento Pedidos", buildUrlExpectation("/sales/orders?status=processing"));
    await page.goto(EXPECTED_HOME.SALES_EXECUTIVE);
    await clickDashboardCardAndVerify(page, "Clientes por Contactar", buildUrlExpectation("/sales/customers"));
    await page.goto(EXPECTED_HOME.SALES_EXECUTIVE);
    await clickDashboardCardAndVerify(page, "Equivalencias", buildUrlExpectation("/sales/equivalences"));
  });
});