import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const requestsPage = path.join(
  process.cwd(),
  "app",
  "(shell)",
  "production",
  "requests",
  "page.tsx",
);
const salesHomePage = path.join(
  process.cwd(),
  "app",
  "(shell)",
  "sales",
  "page.tsx",
);
const salesHomeClient = path.join(
  process.cwd(),
  "app",
  "(shell)",
  "sales",
  "sales-home-client.tsx",
);

describe("sales worklist simplification contract", () => {
  it("keeps only the primary sales filters visible and moves attention filters to the detail area", () => {
    const source = fs.readFileSync(requestsPage, "utf8");

    expect(source).toContain('{ label: "Para tomar"');
    expect(source).toContain('{ label: "Listos para entrega"');
    expect(source).toContain('title: "Atención"');
    expect(source).toContain('sp.assignment === "mine"');
    expect(source).toContain('label: "Pedidos a mi cargo"');
    expect(source).not.toContain('{ label: "Urgentes", href: buildHref(1, undefined, undefined, undefined, "urgentes"), active: presetFilter === "urgentes" },');
  });

  it("does not expose terminal orders as current follow-up on the sales home", () => {
    const source = fs.readFileSync(salesHomePage, "utf8");
    const clientSource = fs.readFileSync(salesHomeClient, "utf8");

    expect(source).toContain('{ deliveredToCustomerAt: null }');
    expect(source).toContain('{ status: { not: "CANCELADA" } }');
    expect(clientSource).toContain('title="Pedidos para seguimiento"');
    expect(clientSource).not.toContain('label: "Entregados"');
  });
});
