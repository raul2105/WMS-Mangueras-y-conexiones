import { expect, test } from "@playwright/test";

test.describe("Modo claro", () => {
  test("login respeta tema persistido y permite alternarlo", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("wms-theme", "light");
    });

    await page.goto("/login");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("button", { name: "Cambiar tema" })).toBeVisible();

    const storedTheme = await page.evaluate(() => window.localStorage.getItem("wms-theme"));
    expect(storedTheme).toBe("light");

    await page.getByRole("button", { name: "Cambiar tema" }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    const darkTheme = await page.evaluate(() => window.localStorage.getItem("wms-theme"));
    expect(darkTheme).toBe("dark");
  });
});
