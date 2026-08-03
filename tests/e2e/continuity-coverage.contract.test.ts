import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("continuity validation coverage", () => {
  it("keeps the executable E2E scenarios aligned with the L06 runbook", () => {
    const e2e = read("tests/e2e/mixed-order-continuity.spec.ts");
    const runbook = read("docs/reconciliation/validation-runbook-2026-08-01.md");
    const detail = read("app/(shell)/production/requests/[id]/page.tsx");

    expect(e2e).toContain("completes a direct-product order");
    expect(e2e).toContain("completes an assembly-only order");
    expect(e2e).toContain("maintains one continuous route from a mixed order to delivery");
    expect(detail).toContain('data-testid="prepare-for-delivery-form"');
    expect(detail).toContain('data-testid="prepared-for-delivery-summary"');
    expect(runbook).toContain("| V1 |");
    expect(runbook).toContain("| V8 |");
  });

  it("keeps the negative readiness rules visible in the operator surface", () => {
    const detail = read("app/(shell)/production/requests/[id]/page.tsx");
    const fulfillment = read("app/(shell)/production/fulfillment/[id]/page.tsx");

    expect(detail).toContain("no se puede preparar el pedido todavía");
    expect(detail).toContain("hasWarehouseFulfillmentOwnership");
    expect(detail).toContain("resolveOperationalException");
    expect(fulfillment).toContain("Toma las tareas para continuar");
    expect(fulfillment).toContain("Tareas tomadas por otro operador");
  });
});
