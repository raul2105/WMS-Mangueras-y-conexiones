import { test, expect } from '@playwright/test';

const criticalRoutes = [
  '/',
  '/catalog',
  '/inventory',
  '/warehouse',
  '/production/orders',
  '/purchasing',
];

test.describe('Auditoria smoke de procesos WMS', () => {
  for (const route of criticalRoutes) {
    test(`debe responder correctamente en ${route}`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'commit', timeout: 90000 });

      expect(response, `No hubo respuesta HTTP en ${route}`).not.toBeNull();
      expect(response?.ok(), `Respuesta no OK en ${route}: ${response?.status()}`).toBeTruthy();
      await expect(page.locator('body')).toBeVisible();
    });
  }
});
