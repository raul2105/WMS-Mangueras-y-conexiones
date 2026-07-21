import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("operator work today experience", () => {
  it("uses direct activity language instead of a technical cockpit", () => {
    const home = read("app/(shell)/home/warehouse/page.tsx");
    const nav = read("components/layout/nav-config.ts");
    const requests = read("app/(shell)/production/requests/page.tsx");

    expect(home).toContain("Trabajo de hoy");
    expect(nav).toContain('"Trabajo de hoy"');
    expect(requests).toContain('"Trabajo de almacén"');
    expect(requests).toContain('{!isOperatorView ? <details');
    expect(requests).not.toContain('title={isOperatorView ? "Cockpit de ejecución"');
  });

  it("presents one next task before secondary work buckets", () => {
    const content = read("components/home/WarehouseHomeContent.tsx");

    expect(content).toContain("Siguiente trabajo");
    expect(content).toContain("Ver trabajo");
    expect(content).toContain("Trabajo pendiente");
  });

  it("closes purchase receipt work with labels and a prefilled material transfer", () => {
    const labels = read("app/(shell)/labels/document/[documentType]/[documentId]/page.tsx");
    const transfer = read("app/(shell)/inventory/transfer/page.tsx");

    expect(labels).toContain("Siguiente paso: mover material");
    expect(labels).toContain("/inventory/transfer?from=");
    expect(transfer).toContain("defaultFromLocation");
    expect(transfer).toContain("defaultValue={defaultFromLocation}");
  });

  it("keeps the legacy fulfillment route out of the operator path", () => {
    const page = read("app/(shell)/production/fulfillment/page.tsx");

    expect(page).toContain('redirect("/production/requests")');
  });
});
