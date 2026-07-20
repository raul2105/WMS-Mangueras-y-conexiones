import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("role-specific operational surfaces", () => {
  it("keeps the warehouse home tied to execution work instead of raw reservations", () => {
    const page = read("app/(shell)/home/warehouse/page.tsx");
    const content = read("components/home/WarehouseHomeContent.tsx");

    expect(page).toContain("buildSalesRequestVisibilityWhere");
    expect(page).not.toContain("prisma.inventory.count");
    expect(content).toContain("Por surtir");
    expect(content).toContain("Ensambles pendientes");
    expect(content).toContain("/production/requests?queue=unreleased");
    expect(content).toContain("/production/requests?queue=assembly_blocked");
  });

  it("keeps manager purchasing visible and operator purchasing reception-focused", () => {
    const managerHome = read("components/home/ManagerHomeContent.tsx");
    const purchasing = read("app/(shell)/purchasing/page.tsx");

    expect(managerHome).toContain("OC por confirmar");
    expect(managerHome).toContain("Crear OC");
    expect(purchasing).toContain("Compras y abastecimiento");
    expect(purchasing).toContain("Recepciones");
    expect(purchasing).toContain("isOperatorView");
  });

  it("removes commercial order creation from the operator material lookup", () => {
    const catalog = read("app/(shell)/catalog/page.tsx");
    const inventory = read("app/(shell)/inventory/page.tsx");

    expect(catalog).toContain("Consulta de materiales");
    expect(catalog).toContain("!isSalesExecutive && !isOperatorView");
    expect(catalog).toContain("!isOperatorView ? (");
    expect(read("components/CatalogFilters.tsx")).toContain("Más filtros técnicos");
    expect(inventory).toContain("Inventario físico");
    expect(inventory).toContain("traceCollapsed={isOperatorView}");
  });
});
