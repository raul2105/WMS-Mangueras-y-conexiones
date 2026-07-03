import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("production availability page contract", () => {
  it("keeps the sales availability screen focused on compact commercial results", () => {
    const content = readWorkspaceFile("app/(shell)/production/availability/page.tsx");

    expect(content).toContain('title="Disponibilidad comercial"');
    expect(content).toContain("Consulta rápida para promesa comercial.");
    expect(content).toContain("Disponible para vender");
    expect(content).toContain("Estado comercial");
    expect(content).toContain("Dónde hay");
    expect(content).toContain("Crear pedido");
    expect(content).toContain("Revisar equivalencias");
    expect(content).toContain("Ver producto");
    expect(content).toContain("Sin disponibilidad");
    expect(content).toContain("Limitado");
    expect(content).toContain("Disponible");

    expect(content).not.toContain("Siguiente acción");
    expect(content).not.toContain("Ir al catálogo");
    expect(content).not.toContain(">Total<");
    expect(content).not.toContain(">Reservado<");
  });
});
