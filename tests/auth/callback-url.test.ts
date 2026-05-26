import { describe, expect, it } from "vitest";
import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";

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
});
