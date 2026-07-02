import { expect, test } from "@playwright/test";
import { loginAs, EXPECTED_HOME } from "./lib/auth.helpers";

test.describe("KAN-74: Commercial catalog mode for SALES_EXECUTIVE", () => {
  test("SALES_EXECUTIVE sees simple search-first catalog with collapsed advanced filters", async ({
    page,
  }) => {
    // Login to home first (SALES_EXECUTIVE goes to /home/sales), then navigate to catalog
    await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE, EXPECTED_HOME.SALES_EXECUTIVE);
    await page.goto("/catalog");

    // Should land on catalog page with commercial heading
    await expect(page.getByRole("heading", { name: /Catálogo comercial/i })).toBeVisible();

    // Primary search input should be prominent and accessible
    const searchInput = page.getByLabel("Buscar producto");
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute("placeholder", /SKU, nombre, referencia, descripción/i);

    // Type filter pills should be visible (Todos, Mangueras, Conexiones, Ensambles)
    await expect(page.getByRole("button", { name: /Todos/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Mangueras/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Conexiones/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ensambles/i })).toBeVisible();

    // Advanced filters (categoria, marca, subcategoria, atributo) should be COLLAPSED initially
    // For SALES_EXECUTIVE, advanced filters are in a conditional div that's hidden when collapsed
    // Check that the advanced filter labels are not visible
    await expect(page.getByLabel("Categoria", { exact: true })).toBeHidden();
    await expect(page.getByLabel("Marca", { exact: true })).toBeHidden();
    await expect(page.getByLabel("Subcategoria", { exact: true })).toBeHidden();
    await expect(page.getByLabel("Atributo", { exact: true })).toBeHidden();

    // "Más filtros" button should be visible to expand advanced filters
    const moreFiltersBtn = page.getByRole("button", { name: /Más filtros/i });
    await expect(moreFiltersBtn).toBeVisible();

    // Click "Más filtros" should expand advanced filters
    await moreFiltersBtn.click();
    await expect(page.getByLabel("Categoria", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Marca", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Subcategoria", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Atributo", { exact: true })).toBeVisible();

    // "Aplicar" and "Limpiar todo" buttons should appear in expanded state
    await expect(page.getByRole("button", { name: /Aplicar/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Limpiar todo/i })).toBeVisible();

    // Commercial flow shortcuts should be visible (disponibilidad, equivalencias, crear pedido)
    // Use .first() since there are multiple per product row
    await expect(page.getByRole("link", { name: /Ver disponibilidad/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Revisar equivalencias/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Crear pedido/i }).first()).toBeVisible();
  });

  test("SALES_EXECUTIVE can search by SKU, name, reference without opening advanced filters", async ({
    page,
  }) => {
    // Login to home first, then navigate to catalog
    await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE, EXPECTED_HOME.SALES_EXECUTIVE);
    await page.goto("/catalog");

    const searchInput = page.getByLabel("Buscar producto");
    await searchInput.fill("MANGUERA");
    await page.keyboard.press("Enter");

    // Should navigate with search query in URL
    await expect(page).toHaveURL(/\/catalog\?q=MANGUERA/);

    // Results area should be visible
    await expect(page.getByText(/Productos del catálogo/i)).toBeVisible();

    // Advanced filters should remain collapsed after search
    // Check they are still hidden
    await expect(page.getByLabel("Categoria", { exact: true })).toBeHidden();
    await expect(page.getByLabel("Marca", { exact: true })).toBeHidden();
    await expect(page.getByLabel("Subcategoria", { exact: true })).toBeHidden();
  });

  test("SALES_EXECUTIVE can filter by type pills (Mangueras, Conexiones, Ensambles)", async ({
    page,
  }) => {
    // Login to home first, then navigate to catalog
    await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE, EXPECTED_HOME.SALES_EXECUTIVE);
    await page.goto("/catalog");

    // Click Mangueras pill
    await page.getByRole("button", { name: /Mangueras/i }).click();
    await expect(page).toHaveURL(/\/catalog\?type=HOSE/);

    // Click Conexiones pill
    await page.getByRole("button", { name: /Conexiones/i }).click();
    await expect(page).toHaveURL(/\/catalog\?type=FITTING/);

    // Click Ensambles pill
    await page.getByRole("button", { name: /Ensambles/i }).click();
    await expect(page).toHaveURL(/\/catalog\?type=ASSEMBLY/);

    // Click Todos to clear type filter
    await page.getByRole("button", { name: /Todos/i }).click();
    await expect(page).toHaveURL(/\/catalog$/);
  });

  test("Admin/Manager sees full technical filters expanded by default", async ({ page }) => {
    // Login to home first, then navigate to catalog
    await loginAs(page, "MANAGER", EXPECTED_HOME.MANAGER, EXPECTED_HOME.MANAGER);
    await page.goto("/catalog");

    // For non-SALES_EXECUTIVE, there are TWO category dropdowns rendered (one in each form section)
    // Use .first() to get the first one
    await expect(page.getByLabel("Categoria", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Marca", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Subcategoria", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Atributo", { exact: true }).first()).toBeVisible();

    // Should NOT see "Más filtros" button (it's only for SALES_EXECUTIVE)
    await expect(page.getByRole("button", { name: /Más filtros/i })).toBeHidden();

    // Should see "Limpiar" and "Aplicar filtros" buttons (use .first() since there are two of each)
    await expect(page.getByRole("button", { name: /Limpiar/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Aplicar filtros/i }).first()).toBeVisible();
  });

  test("Warehouse operator sees full technical filters expanded by default", async ({ page }) => {
    // Login to home first, then navigate to catalog
    await loginAs(page, "WAREHOUSE_OPERATOR", EXPECTED_HOME.WAREHOUSE_OPERATOR, EXPECTED_HOME.WAREHOUSE_OPERATOR);
    await page.goto("/catalog");

    // For non-SALES_EXECUTIVE, there are TWO category dropdowns rendered (one in each form section)
    // Use .first() to get the first one
    await expect(page.getByLabel("Categoria", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Marca", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Subcategoria", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Atributo", { exact: true }).first()).toBeVisible();

    // Should NOT see "Más filtros" button
    await expect(page.getByRole("button", { name: /Más filtros/i })).toBeHidden();
  });

  test("Catalog results show commercial fields for sales: name, SKU, type, category, brand, stock, price, actions", async ({
    page,
  }) => {
    // Login to home first, then navigate to catalog
    await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE, EXPECTED_HOME.SALES_EXECUTIVE);
    await page.goto("/catalog");

    // Should see results table or cards with commercial info
    await expect(page.getByText(/Productos del catálogo/i)).toBeVisible();

    // Table headers should exist (desktop)
    const tableHeaders = [
      "Articulo",
      "Tipo",
      "Marca",
      "Categoria",
      "Stock",
      "Precio",
      "Siguiente acción",
    ];

    for (const header of tableHeaders) {
      await expect(page.getByRole("columnheader", { name: new RegExp(header, "i") })).toBeVisible();
    }

    // At least one product should show with commercial action links
    await expect(page.getByRole("link", { name: /Ver disponibilidad/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Revisar equivalencias/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Crear pedido/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver detalle/i }).first()).toBeVisible();
  });
});