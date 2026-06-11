import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { loginAs } from "./lib/auth.helpers";
import { createSalesRequestDraftHeader } from "@/lib/sales/request-service";
import { ensureDefaultLabelTemplates } from "@/lib/labeling-service";

const prisma = new PrismaClient();

function walkPageFiles(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkPageFiles(full, out);
      continue;
    }
    if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

function fileToRoute(filePath: string) {
  const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  const withoutApp = relative.replace(/^app\//, "");
  const routeSegments = withoutApp
    .split("/")
    .filter((segment) => segment && segment !== "page.tsx")
    .filter((segment) => !segment.startsWith("("));
  return `/${routeSegments.join("/")}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function replaceDynamicSegments(route: string, ids: Record<string, string>) {
  return route
    .replace("/catalog/[id]/edit", `/catalog/${ids.productId}/edit`)
    .replace("/catalog/[id]", `/catalog/${ids.productId}`)
    .replace("/inventory/[id]", `/inventory/${ids.productId}`)
    .replace("/warehouse/[id]/locations/new", `/warehouse/${ids.warehouseId}/locations/new`)
    .replace("/warehouse/[id]/edit", `/warehouse/${ids.warehouseId}/edit`)
    .replace("/warehouse/[id]", `/warehouse/${ids.warehouseId}`)
    .replace("/production/requests/[id]/assembly/new", `/production/requests/${ids.salesOrderId}/assembly/new`)
    .replace("/production/requests/[id]", `/production/requests/${ids.salesOrderId}`)
    .replace("/production/fulfillment/[id]", `/production/fulfillment/${ids.productionOrderId}`)
    .replace("/production/orders/[id]", `/production/orders/${ids.productionOrderId}`)
    .replace("/purchasing/orders/[id]/receive", `/purchasing/orders/${ids.purchaseOrderId}/receive`)
    .replace("/purchasing/orders/[id]/document", `/purchasing/orders/${ids.purchaseOrderId}/document`)
    .replace("/purchasing/orders/[id]", `/purchasing/orders/${ids.purchaseOrderId}`)
    .replace("/purchasing/suppliers/[id]", `/purchasing/suppliers/${ids.supplierId}`)
    .replace("/sales/customers/[id]/edit", `/sales/customers/${ids.customerId}/edit`)
    .replace("/sales/customers/[id]", `/sales/customers/${ids.customerId}`)
    .replace("/sales/orders/[id]", `/sales/orders/${ids.salesOrderId}`)
    .replace("/trace/[traceId]", `/trace/${ids.traceId}`)
    .replace("/labels/document/[documentType]/[documentId]", `/labels/document/${ids.documentType}/${ids.documentId}`)
    .replace("/labels/jobs/[id]", `/labels/jobs/${ids.labelJobId}`)
    .replace("/labels/location/[locationId]", `/labels/location/${ids.locationId}`)
    .replace("/users/[id]/edit", `/users/${ids.userId}/edit`)
    .replace("/users/[id]", `/users/${ids.userId}`);
}

test.describe.serial("full route smoke", () => {
  let ids: {
    productId: string;
    warehouseId: string;
    productionOrderId: string;
    salesOrderId: string;
    purchaseOrderId: string;
    supplierId: string;
    customerId: string;
    traceId: string;
    labelJobId: string;
    locationId: string;
    documentType: string;
    documentId: string;
    userId: string;
  };
  const createdCustomerIds: string[] = [];
  const createdSalesOrderIds: string[] = [];
  const createdProductionOrderIds: string[] = [];
  const createdTraceRecordIds: string[] = [];
  const createdLabelJobIds: string[] = [];

  test.beforeAll(async () => {
    const [product, warehouse, productionOrder, salesOrder, purchaseOrder, supplier, customer, traceRecord, labelJob, location, user, docTrace] =
      await Promise.all([
        prisma.product.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } }),
        prisma.warehouse.findFirst({ orderBy: { code: "asc" }, select: { id: true } }),
        prisma.productionOrder.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } }),
        prisma.salesInternalOrder.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } }),
        prisma.purchaseOrder.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } }),
        prisma.supplier.findFirst({ orderBy: { code: "asc" }, select: { id: true } }),
        prisma.customer.findFirst({ orderBy: { code: "asc" }, select: { id: true } }),
        prisma.traceRecord.findFirst({ orderBy: { createdAt: "desc" }, select: { traceId: true } }),
        prisma.labelPrintJob.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } }),
        prisma.location.findFirst({ orderBy: { code: "asc" }, select: { id: true } }),
        prisma.user.findFirst({ orderBy: { email: "asc" }, select: { id: true } }),
        prisma.traceRecord.findFirst({
          where: { sourceDocumentType: { not: null }, sourceDocumentId: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { sourceDocumentType: true, sourceDocumentId: true },
        }),
      ]);

    if (!product || !warehouse || !purchaseOrder || !supplier || !location || !user) {
      throw new Error("Missing seeded fixtures for route smoke");
    }

    let productionOrderId = productionOrder?.id ?? "";
    if (!productionOrderId) {
      const createdProduction = await prisma.productionOrder.create({
        data: {
          code: `E2E-PO-${Date.now()}`,
          kind: "GENERIC",
          status: "BORRADOR",
          warehouseId: warehouse.id,
          priority: 3,
        },
        select: { id: true },
      });
      productionOrderId = createdProduction.id;
      createdProductionOrderIds.push(createdProduction.id);
    }

    let customerId = customer?.id ?? "";
    if (!customerId) {
      const createdCustomer = await prisma.customer.create({
        data: {
          code: `E2E-CUST-${Date.now()}`,
          name: "Cliente Route Smoke",
          isActive: true,
        },
        select: { id: true },
      });
      customerId = createdCustomer.id;
      createdCustomerIds.push(createdCustomer.id);
    }

    let salesOrderId = salesOrder?.id ?? "";
    if (!salesOrderId) {
      const createdSalesOrder = await createSalesRequestDraftHeader(prisma, {
        customerId,
        warehouseId: warehouse.id,
        dueDate: new Date(Date.now() + 86400000),
        notes: "Route smoke fixture",
      });
      salesOrderId = createdSalesOrder.id;
      createdSalesOrderIds.push(createdSalesOrder.id);
    }

    let traceId = traceRecord?.traceId ?? "";
    let documentType = docTrace?.sourceDocumentType ?? "";
    let documentId = docTrace?.sourceDocumentId ?? "";
    let labelJobId = labelJob?.id ?? "";

    if (!traceId || !documentType || !documentId || !labelJobId) {
      await ensureDefaultLabelTemplates(prisma);
      const labelTemplate = await prisma.labelTemplate.findFirst({
        where: { labelType: "LOCATION", isActive: true },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: { id: true },
      });
      if (!labelTemplate) {
        throw new Error("Missing label template fixture for route smoke");
      }

      const createdTrace = await prisma.traceRecord.create({
        data: {
          traceId: traceId || `TRC-E2E-${Date.now()}`,
          labelType: "LOCATION",
          sourceEntityType: "ROUTE_SMOKE",
          sourceEntityId: `ROUTE_SMOKE-${Date.now()}`,
          sourceDocumentType: documentType || "ROUTE_SMOKE_DOC",
          sourceDocumentId: documentId || `DOC-${Date.now()}`,
          companyName: "SCMayher",
          operatorName: "Route Smoke",
          reference: "Route smoke fixture",
          quantity: 1,
          unitLabel: "u",
          payloadJson: JSON.stringify({ routeSmoke: true }),
          productId: product.id,
          warehouseId: warehouse.id,
          locationId: location.id,
        },
        select: { id: true, traceId: true, sourceDocumentType: true, sourceDocumentId: true },
      });
      createdTraceRecordIds.push(createdTrace.id);
      traceId = createdTrace.traceId;
      documentType = createdTrace.sourceDocumentType ?? "ROUTE_SMOKE_DOC";
      documentId = createdTrace.sourceDocumentId ?? `DOC-${Date.now()}`;

      const createdJob = await prisma.labelPrintJob.create({
        data: {
          traceRecordId: createdTrace.id,
          labelTemplateId: labelTemplate.id,
          status: "RENDERED",
          outputFormat: "html",
          payloadJson: JSON.stringify({ routeSmoke: true }),
          htmlSnapshot: "<html><body>Route smoke fixture</body></html>",
          requestedBy: "Route Smoke",
        },
        select: { id: true },
      });
      createdLabelJobIds.push(createdJob.id);
      labelJobId = createdJob.id;
    }

    ids = {
      productId: product.id,
      warehouseId: warehouse.id,
      productionOrderId,
      salesOrderId,
      purchaseOrderId: purchaseOrder.id,
      supplierId: supplier.id,
      customerId,
      traceId,
      labelJobId,
      locationId: location.id,
      documentType,
      documentId,
      userId: user.id,
    };
  });

  test.afterAll(async () => {
    if (createdSalesOrderIds.length > 0) {
      await prisma.salesInternalOrder.deleteMany({ where: { id: { in: createdSalesOrderIds } } });
    }
    if (createdCustomerIds.length > 0) {
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    if (createdLabelJobIds.length > 0) {
      await prisma.labelPrintJob.deleteMany({ where: { id: { in: createdLabelJobIds } } });
    }
    if (createdTraceRecordIds.length > 0) {
      await prisma.traceRecord.deleteMany({ where: { id: { in: createdTraceRecordIds } } });
    }
    if (createdProductionOrderIds.length > 0) {
      await prisma.productionOrder.deleteMany({ where: { id: { in: createdProductionOrderIds } } });
    }
    await prisma.$disconnect();
  });

  test("authenticated route tree responds without runtime failures", async ({ page }) => {
    await loginAs(page, "SYSTEM_ADMIN", "/");

    const discoveredRoutes = walkPageFiles(path.join(process.cwd(), "app"))
      .filter((file) => !file.includes(`${path.sep}api${path.sep}`))
      .filter((file) => !file.endsWith(`${path.sep}app${path.sep}layout.tsx`))
      .filter((file) => !file.endsWith(`${path.sep}app${path.sep}globals.css`))
      .map(fileToRoute)
      .filter((route) => route !== "/login" && route !== "/forbidden")
      .sort();

    const routes = discoveredRoutes.map((route) => replaceDynamicSegments(route, ids));

    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: "commit", timeout: 90000 });
      expect(response, `No hubo respuesta HTTP para ${route}`).not.toBeNull();
      expect(response?.ok(), `Respuesta no OK para ${route}: ${response?.status()}`).toBeTruthy();
      await expect(page.locator("body")).toBeVisible();

      if (route.startsWith("/sales/orders")) {
        await expect(page).toHaveURL(/\/production\/requests(?:\/[^/?]+)?(?:\?.*)?$/);
      }
      if (route === "/sales") {
        await expect(page).toHaveURL(/\/production\/requests(?:\?.*)?$/);
      }
    }
  });

  test("public entry pages remain reachable without authentication", async ({ page }) => {
    await page.context().clearCookies();

    const loginResponse = await page.goto("/login", { waitUntil: "commit", timeout: 90000 });
    expect(loginResponse, "No hubo respuesta HTTP en /login").not.toBeNull();
    expect(loginResponse?.ok(), `Respuesta no OK en /login: ${loginResponse?.status()}`).toBeTruthy();
    await expect(page.getByRole("heading", { name: /Acceso WMS/i })).toBeVisible();

    const forbiddenResponse = await page.goto("/forbidden", { waitUntil: "commit", timeout: 90000 });
    expect(forbiddenResponse, "No hubo respuesta HTTP en /forbidden").not.toBeNull();
    expect(forbiddenResponse?.ok(), `Respuesta no OK en /forbidden: ${forbiddenResponse?.status()}`).toBeTruthy();
    await expect(page.getByRole("heading", { name: /Acceso denegado/i })).toBeVisible();
  });
});
