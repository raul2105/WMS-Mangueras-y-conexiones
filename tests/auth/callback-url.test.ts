import { describe, expect, it } from "vitest";
import { resolvePostLoginRedirect, sanitizeCallbackUrl } from "@/lib/auth/callback-url";

describe("sanitizeCallbackUrl", () => {
  it("acepta rutas internas", () => {
    expect(sanitizeCallbackUrl("/production/requests?stage=en_surtido")).toBe("/production/requests?stage=en_surtido");
  });

  it("rechaza urls absolutas", () => {
    expect(sanitizeCallbackUrl("https://evil.example/steal")).toBe("/");
  });

  it("rechaza protocol-relative", () => {
    expect(sanitizeCallbackUrl("//evil.example/steal")).toBe("/");
  });

  it("normaliza vacio a root", () => {
    expect(sanitizeCallbackUrl(" ")).toBe("/");
  });

  it("preserva querystrings internos", () => {
    expect(sanitizeCallbackUrl("/production/requests?queue=assembly_blocked")).toBe("/production/requests?queue=assembly_blocked");
  });
});

describe("resolvePostLoginRedirect", () => {
  it("envia al callback permitido para el rol", () => {
    expect(resolvePostLoginRedirect("/production/requests?queue=assembly_blocked", ["MANAGER"]))
      .toBe("/production/requests?queue=assembly_blocked");
  });

  it("usa home del rol cuando falta callback", () => {
    expect(resolvePostLoginRedirect("/", ["MANAGER"])).toBe("/home/manager");
  });

  it("rechaza callbacks externos y vuelve al home del rol", () => {
    expect(resolvePostLoginRedirect("https://evil.example/steal", ["MANAGER"])).toBe("/home/manager");
    expect(resolvePostLoginRedirect("//evil.example/steal", ["MANAGER"])).toBe("/home/manager");
  });

  it("rechaza callbacks no autorizados para el rol", () => {
    expect(resolvePostLoginRedirect("/users", ["MANAGER"])).toBe("/home/manager");
    expect(resolvePostLoginRedirect("/production/fulfillment", ["SALES_EXECUTIVE"])).toBe("/home/sales");
    expect(resolvePostLoginRedirect("/production/requests/new", ["WAREHOUSE_OPERATOR"])).toBe("/home/warehouse");
  });

  it("preserva las rutas comerciales de captura y configuracion para ventas", () => {
    expect(resolvePostLoginRedirect("/production/requests/new", ["SALES_EXECUTIVE"])).toBe("/production/requests/new");
    expect(resolvePostLoginRedirect("/production/requests/order-1/assembly/new", ["SALES_EXECUTIVE"])).toBe("/production/requests/order-1/assembly/new");
  });

  it("permite callback al home propio del rol", () => {
    expect(resolvePostLoginRedirect("/home/sales", ["SALES_EXECUTIVE"])).toBe("/home/sales");
  });
});
