import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("fulfillment priority queue contract (KAN-50)", () => {
  it("preserves required operational columns for prioritized queue", () => {
    const content = readWorkspaceFile("components/dashboard/fulfillment-priority-queue.tsx");

    expect(content).toContain("<Th>Pedido</Th>");
    expect(content).toContain("<Th>Cliente</Th>");
    expect(content).toContain("<Th>Almacén</Th>");
    expect(content).toContain("<Th>Fecha compromiso</Th>");
    expect(content).toContain("<Th>Pick</Th>");
    expect(content).toContain("<Th>Ensamble</Th>");
    expect(content).toContain("<Th>Riesgo</Th>");
    expect(content).toContain("<Th>Acción sugerida</Th>");
  });
});
