import { describe, expect, it } from "vitest";
import { assemblyComponentRoleLabel, assemblyWorkflowStatusLabel } from "@/lib/assembly/presentation";

describe("assembly operational labels", () => {
  it("translates component roles into warehouse language", () => {
    expect(assemblyComponentRoleLabel("ENTRY_FITTING")).toBe("Conexión de entrada");
    expect(assemblyComponentRoleLabel("HOSE")).toBe("Manguera");
    expect(assemblyComponentRoleLabel("EXIT_FITTING")).toBe("Conexión de salida");
  });

  it("does not leak unknown internal codes", () => {
    expect(assemblyComponentRoleLabel("UNEXPECTED_ROLE")).toBe("Componente de ensamble");
    expect(assemblyWorkflowStatusLabel("UNEXPECTED_STATUS")).toBe("Estado no disponible");
  });

  it("translates operational workflow states", () => {
    expect(assemblyWorkflowStatusLabel("PENDING")).toBe("Pendiente");
    expect(assemblyWorkflowStatusLabel("IN_WIP")).toBe("En área de ensamble");
    expect(assemblyWorkflowStatusLabel("NOT_CONSUMED")).toBe("Pendiente de consumo");
  });
});
