import { describe, expect, it } from "vitest";
import { buildTechnicalSpecRows, getTechnicalCompleteness, syncProductTechnicalSpecs, validateTechnicalSpecRows } from "@/lib/catalog/technical-specs";

describe("technical product specification contract", () => {
  it("maps legacy hose attributes into comparable canonical fields", () => {
    const rows = buildTechnicalSpecRows("HOSE", JSON.stringify({
      Diametro: 12,
      Presion: 300,
      Temperatura_maxima: 100,
      Uso: "Aceite",
      Material: "NBR",
    }));

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "inner_diameter", value: "12", unit: "mm", isSafetyCritical: true }),
      expect.objectContaining({ key: "working_pressure", value: "300", unit: "bar" }),
      expect.objectContaining({ key: "media", value: "Aceite" }),
    ]));
  });

  it("reports missing safety fields by product family", () => {
    const result = getTechnicalCompleteness("FITTING", [
      { key: "material" },
      { key: "thread" },
    ]);

    expect(result.complete).toBe(false);
    expect(result.missing).toContain("Serie de conexión");
    expect(result.missing).toContain("Presión de trabajo");
  });

  it("rejects contradictory dimensional and pressure values", () => {
    const rows = buildTechnicalSpecRows("HOSE", JSON.stringify({
      inner_diameter: 20,
      outer_diameter: 10,
      working_pressure: 300,
      burst_pressure: 200,
    }));

    const result = validateTechnicalSpecRows(rows);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "El diámetro exterior no puede ser menor que el diámetro interior",
      "La presión de ruptura no puede ser menor que la presión de trabajo",
    ]));
  });

  it("persists technical fields idempotently without deleting the product history", async () => {
    const upserts: unknown[] = [];
    const db = {
      productTechnicalSpec: {
        upsert: async (args: unknown) => { upserts.push(args); },
      },
    };

    await syncProductTechnicalSpecs(
      db,
      "product-1",
      "HOSE",
      JSON.stringify({ inner_diameter: 12, working_pressure: 300, temperature_max: 100, media: "Aceite", material: "NBR" }),
      "source-1",
    );

    expect(upserts.length).toBeGreaterThan(0);
    expect(upserts).toEqual(expect.arrayContaining([
      expect.objectContaining({ where: { productId_key: { productId: "product-1", key: "inner_diameter" } } }),
    ]));
  });
});
