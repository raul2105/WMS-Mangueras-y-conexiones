import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const contextFields = ["workingPressureBar", "operatingTemperatureC", "medium", "application", "assemblyMethod"];

describe("assembly operating context UI contract", () => {
  it("exposes one accessible, reusable context block with explicit units and fail-closed guidance", () => {
    const component = read("components/AssemblyOperatingContextFields.tsx");
    for (const field of contextFields) expect(component).toContain(`name=\"${field}\"`);
    expect(component).toContain("Presión de trabajo (bar)");
    expect(component).toContain("Temperatura de operación (°C)");
    expect(component).toContain("Si una regla los exige y faltan, el ensamble no podrá avanzar");
    expect(component).toContain("<fieldset");
    expect(component).toContain("<legend");
  });

  it("uses the context in both sales and production assembly configurators", () => {
    const sharedForm = read("components/AssemblyConfiguratorForm.tsx");
    const salesForm = read("components/NewOrderForm.tsx");
    const productionPage = read("app/(shell)/production/orders/new/page.tsx");
    const salesLinePage = read("app/(shell)/production/requests/[id]/assembly/new/page.tsx");
    expect(sharedForm).toContain("<AssemblyOperatingContextFields");
    expect(salesForm).toContain("<AssemblyOperatingContextFields");
    for (const field of contextFields) {
      expect(productionPage).toContain(field);
      expect(salesLinePage).toContain(field);
    }
    expect(productionPage).toContain("getAssemblyCompatibilityDecision");
    expect(salesLinePage).toContain("getAssemblyCompatibilityDecision");
  });

  it("validates and forwards context through the server boundary", () => {
    const schemas = read("lib/schemas/wms.ts");
    const salesService = read("lib/sales/request-service.ts");
    const workOrderService = read("lib/assembly/work-order-service.ts");
    for (const field of contextFields) {
      expect(schemas).toContain(field);
      expect(salesService).toContain(field);
      expect(workOrderService).toContain(field);
    }
  });
});
