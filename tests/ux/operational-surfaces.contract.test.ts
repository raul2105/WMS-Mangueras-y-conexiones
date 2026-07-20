import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("operational surfaces UI contract", () => {
  it("keeps Nuevo Pedido focused on one next requirement", () => {
    const summary = read("components/OrderSummary.tsx");
    const form = read("components/NewOrderForm.tsx");

    expect(summary).toContain('data-testid="next-required-action"');
    expect(summary).toContain("Siguiente acción");
    expect(summary).toContain("getFieldLabel(missingFields[0])");
    expect(form).toContain('data-testid="create-order-button"');
    expect(form).toContain('data-testid="sales-order-stepper"');
    expect(form).toContain("¿Quién es el cliente?");
    expect(form).toContain("¿Qué necesita el cliente?");
    expect(form).toContain("Manguera");
    expect(form).toContain("Conexión de entrada");
    expect(form).toContain("Ensamble");
    expect(form).toContain("Producto directo");
    expect(form).not.toContain(">Buscar pieza<");
    expect(form).toContain("lineProductId");
    expect(form).toContain("sales-order-assembly-configurator");
    expect(form).toContain("<form action={action}");
    expect(form).toContain('name="lineKind"');
  });

  it("creates a configured assembly atomically from Nuevo Pedido", () => {
    const page = read("app/(shell)/production/requests/new/page.tsx");
    const service = read("lib/sales/request-service.ts");

    expect(page).toContain("createSalesRequestWithAssembly");
    expect(page).toContain('lineKind === "ASSEMBLY"');
    expect(service).toContain("createSalesRequestDraftHeaderInTx");
    expect(service).toContain("addSalesRequestAssemblyLineInTx");
    expect(service).toContain("createSalesRequestWithAssembly");
  });

  it("keeps the operator queue on physical buckets and tokenized focus styles", () => {
    const queue = read("app/(shell)/production/requests/page.tsx");

    for (const label of ["Por surtir", "En proceso", "Bloqueados", "Verificar", "Listos para entrega"]) {
      expect(queue).toContain(`label: "${label}"`);
    }
    expect(queue).toContain("Trabajo asignado");
    expect(queue).toContain('data-testid="requests-work-summary"');
    expect(queue).toContain('label: "Para tomar"');
    expect(queue).not.toContain('hidden gap-3 md:grid sm:grid-cols-2 xl:grid-cols-4');
    expect(queue).not.toContain("Pedidos sin responsable");
    expect(queue).toContain("focus-visible:ring-[var(--focus-ring)]");
    expect(queue).not.toContain('variant: "primary",\n                        fullWidth: true,\n                      })}\n                    >\n                      Ver detalle');
  });

  it("keeps a created order focused on its next step and hides secondary actions", () => {
    const detail = read("app/(shell)/production/requests/[id]/page.tsx");

    expect(detail).toContain('data-testid="request-work-summary"');
    expect(detail).toContain("Siguiente paso");
    expect(detail).toContain("Ver información y acciones adicionales");
    expect(detail).toContain("Seguimiento del pedido");
    expect(detail).not.toContain("Estado y siguiente acción");
    expect(detail).not.toContain("Timeline operativo");
  });

  it("gives managers a direct, auditable sales assignment control", () => {
    const detail = read("app/(shell)/production/requests/[id]/page.tsx");
    const service = read("lib/sales/request-service.ts");

    expect(detail).toContain('data-testid="manager-assign-order"');
    expect(detail).toContain("Asignar vendedor");
    expect(service).toContain("assignSalesRequestOrder");
    expect(service).toContain("ASSIGN_SALES_REQUEST");
    expect(service).toContain("El pedido ya fue tomado; la reasignación requiere una excepción operativa");
  });

  it("provides shared token primitives for compact progress and next actions", () => {
    const primitives = read("app/styles/primitives.css");
    expect(primitives).toContain(".op-next-action");
    expect(primitives).toContain(".op-progress-list");
    expect(primitives).toContain(".op-progress-marker");
    expect(primitives).toContain(".op-card");
  });
});
