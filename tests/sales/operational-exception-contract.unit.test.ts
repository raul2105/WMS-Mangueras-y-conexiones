import { describe, expect, it } from "vitest";
import {
  salesInternalOrderAssignmentSchema,
  salesInternalOrderDeliverySchema,
  salesInternalOrderPreparationSchema,
} from "@/lib/schemas/wms";

describe("KAN-133 operational evidence contracts", () => {
  it("requires a reason for a direct Manager/Admin assignment", () => {
    expect(salesInternalOrderAssignmentSchema.safeParse({ orderId: "order-1", assigneeUserId: "sales-1" }).success).toBe(false);
    expect(salesInternalOrderAssignmentSchema.safeParse({ orderId: "order-1", assigneeUserId: "sales-1", reason: "Pedido urgente" }).success).toBe(true);
  });

  it("requires recipient and delivery method while allowing optional evidence", () => {
    expect(salesInternalOrderDeliverySchema.safeParse({ orderId: "order-1", recipientName: "", deliveryMethod: "Entrega directa" }).success).toBe(false);
    expect(salesInternalOrderDeliverySchema.safeParse({
      orderId: "order-1",
      recipientName: "Ana Cliente",
      deliveryMethod: "Entrega directa",
      evidenceUrl: "https://evidence.example/delivery/1",
    }).success).toBe(true);
  });

  it("keeps the preparation location mandatory and validates optional evidence URLs", () => {
    expect(salesInternalOrderPreparationSchema.safeParse({ orderId: "order-1", preparedLocationId: "" }).success).toBe(false);
    expect(salesInternalOrderPreparationSchema.safeParse({ orderId: "order-1", preparedLocationId: "stage-1", evidenceUrl: "not-a-url" }).success).toBe(false);
    expect(salesInternalOrderPreparationSchema.safeParse({ orderId: "order-1", preparedLocationId: "stage-1", evidenceUrl: "https://evidence.example/prepared/1" }).success).toBe(true);
  });
});
