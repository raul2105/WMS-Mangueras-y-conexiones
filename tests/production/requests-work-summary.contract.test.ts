import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = path.join(process.cwd(), "app", "(shell)", "production", "requests", "page.tsx");

describe("production requests work summary contract", () => {
  it("uses role-specific work language and excludes terminal orders from active work", () => {
    const source = fs.readFileSync(pagePath, "utf8");

    expect(source).toContain('"Pedidos a tu cargo"');
    expect(source).toContain('"Asignación comercial"');
    expect(source).not.toContain('"Mi cola"');
    expect(source).toContain('deliveredToCustomerAt: null');
  });
});
