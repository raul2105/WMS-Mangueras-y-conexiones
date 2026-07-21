import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("mixed order work surface", () => {
  it("keeps direct products and each assembly in one request work board", () => {
    const detail = read("app/(shell)/production/requests/[id]/page.tsx");

    expect(detail).toContain('data-testid="request-work-board"');
    expect(detail).toContain("Productos directos");
    expect(detail).toContain("Ensamble {index + 1}");
    expect(detail).toContain("Surtir productos");
    expect(detail).toContain("Continuar ensamble");
  });

  it("keeps the next physical step visible when direct picking finishes", () => {
    const fulfillment = read("app/(shell)/production/fulfillment/[id]/page.tsx");

    expect(fulfillment).toContain('data-testid="fulfillment-next-action"');
    expect(fulfillment).toContain("Continuar ensamble");
    expect(fulfillment).toContain("Productos por recoger");
  });

  it("uses three clear assembly steps and moves technical details out of the main task", () => {
    const assembly = read("app/(shell)/production/orders/[id]/page.tsx");

    expect(assembly).toContain('data-testid="assembly-work-steps"');
    expect(assembly).toContain("Paso 1: libera. Paso 2: recoge y confirma. Paso 3:");
    expect(assembly).toContain("Ver datos de operación");
    expect(assembly).toContain("Confirmar materiales y cerrar si aplica");
  });
});
