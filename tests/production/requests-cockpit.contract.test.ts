import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("production requests cockpit contract", () => {
  it("keeps the list page on shared flow helpers and cockpit primitives", () => {
    const listContent = readWorkspaceFile(
      "app/(shell)/production/requests/page.tsx",
    );
    const consoleContent = readWorkspaceFile("lib/sales/console.ts");

    expect(listContent).toContain("hasProductionCockpitAccess");
    expect(listContent).toContain("getSalesOrderFlowNarrative");
    expect(listContent).toContain("takeRequestFromList");
    expect(listContent).toContain("Pedidos comerciales");
    expect(listContent).toContain("Mis pedidos");
    expect(listContent).toContain("Disponibles para asignarme");
    expect(listContent).toContain("requests-active-filters");
    expect(listContent).toContain("request-card");
    expect(listContent).toContain("Ver seguimiento operativo");
    expect(listContent).toContain("Siguiente acción");
    expect(listContent).toContain("Seguimiento");
    expect(listContent).toContain("Seguimiento comercial");
    expect(listContent).toContain("Ver detalle");
    expect(listContent).toContain("Vista administrativa");
    expect(listContent).toContain("Clientes");
    expect(listContent).toContain("buttonStyles");
    expect(listContent).toContain("Badge");
    expect(listContent).toContain("buildHref");
    expect(consoleContent).toContain("resolveSalesConsolePrimaryActionState");
    expect(consoleContent).toContain("getSalesConsoleStageProgress");
    expect(consoleContent).toContain("getSalesConsoleWorkType");
    expect(listContent).not.toContain("text-cyan-300");
    expect(listContent).not.toContain("border-white/10");
    expect(listContent).not.toContain("bg-white/5");
  });

  it("keeps the detail page on shared write guards and tokenized controls", () => {
    const detailContent = readWorkspaceFile(
      "app/(shell)/production/requests/[id]/page.tsx",
    );

    expect(detailContent).toContain("hasProductionCockpitAccess");
    expect(detailContent).toContain("requireSalesWriteAccess()");
    expect(detailContent).toContain("getSalesOrderFlowNarrative");
    expect(detailContent).toContain("buttonStyles");
    expect(detailContent).toContain("Badge");
    expect(detailContent).toContain("canRenderWriteActions");
    expect(detailContent).not.toContain("text-cyan-300");
    expect(detailContent).not.toContain("border-white/10");
    expect(detailContent).not.toContain("bg-white/5");
  });
});
