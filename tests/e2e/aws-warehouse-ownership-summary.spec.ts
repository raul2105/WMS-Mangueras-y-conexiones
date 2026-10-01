import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginAs, USERS } from "./lib/auth.helpers";

test("warehouse workload matches physical ownership despite commercial assignment", async ({ page }, testInfo) => {
  test.skip(process.env.WMS_AWS_WRITE_E2E !== "1", "Requires the authorized canonical AWS database session.");
  const connection = new URL(process.env.DATABASE_URL ?? "");
  expect(connection.hostname).toBe("wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com");
  expect(connection.pathname).toBe("/wms");
  expect(connection.searchParams.get("schema")).toBe("public");
  const db = new PrismaClient();
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: USERS.WAREHOUSE_OPERATOR.email }, select: { id: true, isActive: true } });
    expect(user.isActive).toBe(true);
    const orders = await db.salesInternalOrder.findMany({
      where: { status: "CONFIRMADA", deliveredToCustomerAt: null },
      select: { id: true, code: true, warehouseClaimedByUserId: true, warehouseAssigneeUserId: true, assignedToUserId: true, pulledAt: true },
    });
    const physicallyOwned = orders.filter(order =>
      (order.warehouseClaimedByUserId ?? order.warehouseAssigneeUserId ?? (order.pulledAt ? order.assignedToUserId : null)) === user.id,
    );
    const preservedOrder = physicallyOwned.find(order => order.code === process.env.WMS_KAN128_ORDER_CODE);
    expect(preservedOrder, "Preserved handoff must belong physically to the warehouse operator").toBeTruthy();
    expect(preservedOrder!.assignedToUserId, "Commercial owner differs from physical owner").not.toBe(user.id);
    await loginAs(page, "WAREHOUSE_OPERATOR", "/production/requests", "/production/requests");
    await expect(page.getByTestId("requests-work-summary").getByText(`${physicallyOwned.length} asignados`, { exact: true })).toBeVisible();
    await expect(page.getByTestId("request-card").filter({ hasText: preservedOrder!.code })).toContainText("Operador Almacen");
    await testInfo.attach("physical-workload-evidence.json", {
      body: Buffer.from(JSON.stringify({ readOnly: true, visibleActiveOrders: orders.length, physicallyOwned: physicallyOwned.length, preservedOrder: preservedOrder!.code, commercialOwnerDiffers: true })),
      contentType: "application/json",
    });
  } finally {
    await db.$disconnect();
  }
});
