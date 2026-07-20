import { describe, expect, it } from "vitest";
import { resolveSalesOrderPrimaryCta } from "@/lib/sales/internal-orders";

describe("configured assembly continuation", () => {
  it("opens the exact linked assembly for a mixed order", () => {
    const cta = resolveSalesOrderPrimaryCta({
      orderId: "ord-mixed",
      roles: ["WAREHOUSE_OPERATOR"],
      flowStage: "en_surtido",
      hasProductLines: true,
      latestPickStatus: "COMPLETED",
      hasAssemblyLines: true,
      hasCompletedConfiguredAssembly: false,
      assemblyHref: "/production/orders/assembly-for-ord-mixed",
    });

    expect(cta.code).toBe("COMPLETE_ASSEMBLY");
    expect(cta.action.href).toBe("/production/orders/assembly-for-ord-mixed");
  });

  it("keeps multiple pending assemblies in their parent order for explicit selection", () => {
    const cta = resolveSalesOrderPrimaryCta({
      orderId: "ord-many-assemblies",
      roles: ["WAREHOUSE_OPERATOR"],
      flowStage: "en_surtido",
      hasAssemblyLines: true,
      hasCompletedConfiguredAssembly: false,
    });

    expect(cta.action.href).toBe("/production/requests/ord-many-assemblies#ensambles");
  });
});
