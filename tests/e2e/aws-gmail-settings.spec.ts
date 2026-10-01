import { expect, test } from "@playwright/test";
import { loginAs } from "./lib/auth.helpers";

const origin = "https://d2b1ltxtvypxr4.cloudfront.net";
test.skip(process.env.WMS_AWS_ACCEPTANCE_E2E !== "1", "Requires the authorized AWS acceptance lane");

test("privacy is public while anonymous Gmail access remains protected", async ({ page }) => {
  const privacy = await page.request.get("/privacy-gmail.html", { maxRedirects: 0 });
  expect(privacy.status()).toBe(200);
  expect(await privacy.text()).toContain("rrios@rigentec.com");
  const anonymous = await page.request.post("/api/email/gmail/connect", { headers: { origin }, maxRedirects: 0 });
  expect(anonymous.status()).toBe(401);
});

test("Manager sees their own settings and the unavailable integration cannot authorize or send", async ({ page }) => {
  await loginAs(page, "MANAGER", "/purchasing/email", "/purchasing/email");
  await expect(page.getByRole("heading", { level: 1, name: "Correo para órdenes de compra" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Conexión no disponible" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "política de privacidad de Gmail" })).toHaveAttribute("href", "/privacy-gmail.html");
  const invalidOrigin = await page.request.post("/api/email/gmail/connect", {
    headers: { origin: "https://untrusted.example.invalid" }, maxRedirects: 0,
  });
  expect(invalidOrigin.status()).toBe(403);
  const unavailable = await page.request.post("/api/email/gmail/connect", { headers: { origin }, maxRedirects: 0 });
  expect(unavailable.status()).toBe(303);
  expect(unavailable.headers().location).toBe(`${origin}/purchasing/email?result=unavailable`);
});

test("other profiles cannot connect Gmail for a Manager", async ({ page }) => {
  for (const role of ["SYSTEM_ADMIN", "WAREHOUSE_OPERATOR", "SALES_EXECUTIVE"] as const) {
    await loginAs(page, role);
    const forbidden = await page.request.post("/api/email/gmail/connect", { headers: { origin }, maxRedirects: 0 });
    expect(forbidden.status()).toBe(303);
    expect(forbidden.headers().location).toContain("/forbidden");
  }
});
