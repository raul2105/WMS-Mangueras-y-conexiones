import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USERS = {
  MANAGER: { email: "manager@scmayher.com", password: "Manager123*" },
  SALES_EXECUTIVE: { email: "sales@scmayher.com", password: "Sales123*" },
} as const;

async function loginAs(page: import("@playwright/test").Page, email: string, password: string, callbackUrl = "/production/requests/new") {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  if (await page.getByLabel("Email").isVisible()) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contrasena").fill(password);
    await page.getByRole("button", { name: "Iniciar sesion" }).click();
  }
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/production/requests/new");
}

test.describe("KAN-48 customer quick-create", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("customers.view sin customers.manage no ve CTA de creación rápida", async ({ page }) => {
    await loginAs(page, USERS.SALES_EXECUTIVE.email, USERS.SALES_EXECUTIVE.password);
    await expect(page.getByRole("heading", { name: /Nuevo pedido de surtido/i })).toBeVisible();
    await page.getByLabel("Cliente").fill(`KAN48-SALES-${Date.now()}`);
    await expect(page.getByText("Crear cliente rápido")).toHaveCount(0);
  });

  test("customers.manage puede crear cliente y queda seleccionado", async ({ page }) => {
    await loginAs(page, USERS.MANAGER.email, USERS.MANAGER.password);
    await expect(page.getByRole("heading", { name: /Nuevo pedido de surtido/i })).toBeVisible();

    const uniqueName = `KAN48-QC-${Date.now()}`;
    await page.getByLabel("Cliente").fill(uniqueName);
    await expect(page.getByRole("button", { name: "Crear cliente rápido" })).toBeVisible();
    await page.getByRole("button", { name: "Crear cliente rápido" }).click();
    await page.getByRole("button", { name: "Guardar y seleccionar" }).click();

    await expect(page.locator("div").filter({ hasText: uniqueName }).first()).toBeVisible();
    const customerId = await page.locator('input[type="hidden"][name="customerId"]').inputValue();
    expect(customerId.trim().length).toBeGreaterThan(0);
  });

  test("errores API de quick-create se muestran inline y no rompen el formulario", async ({ page }) => {
    await loginAs(page, USERS.MANAGER.email, USERS.MANAGER.password);
    await expect(page.getByRole("heading", { name: /Nuevo pedido de surtido/i })).toBeVisible();

    await page.getByLabel("Cliente").fill(`KAN48-ERR-${Date.now()}`);
    await expect(page.getByRole("button", { name: "Crear cliente rápido" })).toBeVisible();
    await page.getByRole("button", { name: "Crear cliente rápido" }).click();
    await page.locator('input[placeholder="contacto@cliente.com"]').fill("correo-invalido");
    await page.getByRole("button", { name: "Guardar y seleccionar" }).click();

    await expect(page.getByText("Email inválido", { exact: false })).toBeVisible();
    await expect(page.locator('select[name="warehouseId"]')).toBeVisible();
  });
});
