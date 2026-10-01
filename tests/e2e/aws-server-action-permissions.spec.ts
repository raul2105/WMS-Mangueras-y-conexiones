import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { loginAs, USERS } from "./lib/auth.helpers";
import { createLocationTraceAndLabelJob } from "@/lib/labeling-service";

type MultipartValue = string | { name: string; mimeType: string; buffer: Buffer };
type ProbeRole = "SALES_EXECUTIVE" | "WAREHOUSE_OPERATOR";

async function actionFields(page: Page, button: RegExp) {
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: button }) });
  await expect(form).toHaveCount(1);
  const descriptor = await form.evaluate(element => ({
    actionUrl: (element as HTMLFormElement).action,
    hiddenEntries: Array.from(element.querySelectorAll<HTMLInputElement>('input[type="hidden"]'))
      .filter(input => input.name)
      .map(input => [input.name, input.value] as [string, string]),
  }));
  expect(descriptor.hiddenEntries.some(([key]) => key.startsWith("$ACTION_")), "Real server-rendered action metadata is required").toBe(true);
  return descriptor;
}

function safeActionDiagnostic(actionUrl: string, hiddenEntries: Array<[string, string]>) {
  const actionIdField = hiddenEntries.find(([key]) => key.startsWith("$ACTION_ID_"))?.[0];
  const actionRef = hiddenEntries.find(([key]) => key.startsWith("$ACTION_REF_"));
  let actionId = actionIdField?.slice("$ACTION_ID_".length);
  if (!actionId && actionRef) {
    const prefix = actionRef[0].slice("$ACTION_REF_".length);
    const descriptor = hiddenEntries.find(([key]) => key === `$ACTION_${prefix}:0`)?.[1];
    if (descriptor) {
      try {
        const parsed = JSON.parse(descriptor) as { id?: unknown };
        if (typeof parsed.id === "string") actionId = parsed.id;
      } catch {
        // Keep diagnostics limited to field names when the descriptor is malformed.
      }
    }
  }
  const { pathname, search } = new URL(actionUrl);
  return {
    actionPath: `${pathname}${search}`,
    hiddenFieldNames: hiddenEntries.map(([key]) => key),
    actionId: actionId ?? null,
    hasNextActionHeader: false,
    transport: "multipart-form-post",
  };
}

function multipartActionData(hiddenEntries: Array<[string, string]>, overrides: Record<string, MultipartValue>) {
  const data = new FormData();
  for (const [key, value] of hiddenEntries) data.append(key, value);
  for (const [key, value] of Object.entries(overrides)) {
    data.delete(key);
    if (typeof value === "object") {
      data.append(key, new File([new Uint8Array(value.buffer)], value.name, { type: value.mimeType }));
    } else {
      data.append(key, value);
    }
  }
  return data;
}

async function encodeMultipartAction(actionUrl: string, hiddenEntries: Array<[string, string]>, overrides: Record<string, MultipartValue>) {
  const request = new Request(actionUrl, {
    method: "POST",
    body: multipartActionData(hiddenEntries, overrides),
  });
  const contentType = request.headers.get("content-type");
  if (!contentType?.startsWith("multipart/form-data; boundary=")) {
    throw new Error("WHATWG Request did not produce a multipart boundary");
  }
  return { body: Buffer.from(await request.arrayBuffer()), contentType };
}

function addRenderNonce(actionUrl: string, renderedPageUrl: string) {
  const target = new URL(actionUrl, renderedPageUrl);
  const nonce = new URL(renderedPageUrl).searchParams.get("e2eNonce");
  if (nonce && !target.searchParams.has("e2eNonce")) target.searchParams.set("e2eNonce", nonce);
  return target.toString();
}

function cacheBustedRoute(route: string) {
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}e2eNonce=${randomUUID()}`;
}

test("direct Server Action requests enforce permissions before import, warehouse, location and label mutations", async ({ browser }, testInfo) => {
  test.skip(process.env.WMS_AWS_WRITE_E2E !== "1", "Requires the authorized canonical AWS database session.");
  const connection = new URL(process.env.DATABASE_URL ?? "");
  expect(connection.hostname).toBe("wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com");
  expect(connection.pathname).toBe("/wms");
  expect(connection.searchParams.get("schema")).toBe("public");

  const db = new PrismaClient();
  const tag = `QA-ACTION-${randomUUID().slice(0, 8).toUpperCase()}`;
  const deniedRoles: ProbeRole[] = ["SALES_EXECUTIVE", "WAREHOUSE_OPERATOR"];
  const warehouseCodes = [tag, `${tag}-NEW-ADMIN`, ...deniedRoles.map(role => `${tag}-NEW-${role}`)];
  const locationCodes = [
    `${tag}-LOC`, `${tag}-LABEL-LOC`, `${tag}-LOC-ADMIN`,
    ...deniedRoles.map(role => `${tag}-LOC-${role}`),
  ];
  const contexts: Array<Awaited<ReturnType<typeof browser.newContext>>> = [];
  const evidence: Array<{ route: string; actor: string; controlStatus: number; deniedStatus: number }> = [];
  const importSku = `${tag}-IMPORT-SKU`;
  const importWriteFileName = `${tag}-admin-write.csv`;
  let warehouseId = "";
  let locationId = "";
  let labelLocationId = "";
  let traceId = "";
  let jobId = "";
  let committedImportEvidence: Record<string, unknown> | null = null;
  let importWriteFixtureReserved = false;
  let importWriteAttempted = false;
  let committedProductIdsForCleanup: string[] = [];
  let committedImportLogIdsForCleanup: string[] = [];
  const initialJobCount = await db.labelPrintJob.count();

  try {
    const [existingImportProduct, existingWriteLogs] = await Promise.all([
      db.product.findUnique({ where: { sku: importSku }, select: { id: true } }),
      db.importLog.count({ where: { fileName: importWriteFileName } }),
    ]);
    expect(existingImportProduct).toBeNull();
    expect(existingWriteLogs).toBe(0);
    importWriteFixtureReserved = true;
    const adminActor = await db.user.findUnique({
      where: { email: USERS.SYSTEM_ADMIN.email },
      select: { id: true, name: true, email: true },
    });

    expect(await db.warehouse.count({ where: { code: { in: warehouseCodes } } })).toBe(0);
    expect(await db.location.count({ where: { code: { in: locationCodes } } })).toBe(0);
    const warehouse = await db.warehouse.create({ data: { code: tag, name: tag, isActive: true } });
    warehouseId = warehouse.id;
    const [location, labelLocation] = await Promise.all([
      db.location.create({ data: { code: `${tag}-LOC`, name: `${tag} storage fixture`, warehouseId, usageType: "STORAGE", isActive: true } }),
      db.location.create({ data: { code: `${tag}-LABEL-LOC`, name: `${tag} label fixture`, warehouseId, usageType: "STORAGE", isActive: true } }),
    ]);
    locationId = location.id;
    labelLocationId = labelLocation.id;
    const prepared = await createLocationTraceAndLabelJob(db, { locationId, operatorName: "Authorized QA fixture", reference: tag });
    traceId = prepared.trace.id;
    jobId = prepared.job.id;

    const importCount = await db.importLog.count();
    const importCsv = `sku,name,type,quantity\n${importSku},Permission probe,ACCESSORY,0\n`;
    const importWriteCsv = `sku,name,type,quantity\n${importSku},Authorized import write probe,ACCESSORY,0\n`;
    const authenticatedAdmin = await browser.newContext();
    contexts.push(authenticatedAdmin);
    await loginAs(await authenticatedAdmin.newPage(), "SYSTEM_ADMIN");
    const admin = await browser.newContext({ storageState: await authenticatedAdmin.storageState(), javaScriptEnabled: false });
    contexts.push(admin);
    const adminPage = await admin.newPage();
    const sales = await browser.newContext();
    contexts.push(sales);
    await loginAs(await sales.newPage(), "SALES_EXECUTIVE");
    const operator = await browser.newContext();
    contexts.push(operator);
    await loginAs(await operator.newPage(), "WAREHOUSE_OPERATOR");
    const contextsByRole: Record<ProbeRole, BrowserContext> = { SALES_EXECUTIVE: sales, WAREHOUSE_OPERATOR: operator };

    const baseWarehouse = await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
    const cases: Array<{
      route: string;
      button: RegExp;
      deniedRoles: ProbeRole[];
      control: Record<string, MultipartValue>;
      denied: (role: ProbeRole) => Record<string, MultipartValue>;
    }> = [
      {
        route: "/catalog/import",
        button: /^Importar$/,
        deniedRoles,
        control: { file: { name: `${tag}-admin.csv`, mimeType: "text/csv", buffer: Buffer.from(importCsv) }, dryRun: "on" },
        denied: role => ({ file: { name: `${tag}-${role}.csv`, mimeType: "text/csv", buffer: Buffer.from(importCsv) }, dryRun: "on" }),
      },
      {
        route: "/warehouse/new",
        button: /Crear almac[eé]n/i,
        deniedRoles,
        control: { code: `${tag}-NEW-ADMIN`, name: `${tag} admin permission control`, isActive: "on" },
        denied: role => ({ code: `${tag}-NEW-${role}`, name: `${tag} denied ${role}`, isActive: "on" }),
      },
      {
        route: `/warehouse/${warehouseId}/edit`,
        button: /^Guardar cambios$/,
        deniedRoles,
        control: {
          name: baseWarehouse.name,
          description: baseWarehouse.description ?? "",
          address: baseWarehouse.address ?? "",
          ...(baseWarehouse.isActive ? { isActive: "on" } : {}),
        },
        denied: role => ({
          name: `${tag} forbidden ${role}`,
          description: baseWarehouse.description ?? "",
          address: baseWarehouse.address ?? "",
          ...(baseWarehouse.isActive ? { isActive: "on" } : {}),
        }),
      },
      {
        route: `/warehouse/${warehouseId}/locations/new`,
        button: /Crear ubicaci[oó]n/i,
        deniedRoles,
        control: { warehouseId, code: `${tag}-LOC-ADMIN`, name: `${tag} admin location`, usageType: "STORAGE", isActive: "on" },
        denied: role => ({ warehouseId, code: `${tag}-LOC-${role}`, name: `${tag} denied ${role}`, usageType: "STORAGE", isActive: "on" }),
      },
      {
        route: `/labels/location/${labelLocationId}`,
        button: /^Generar etiqueta$/,
        deniedRoles: ["SALES_EXECUTIVE"],
        control: { locationId: labelLocationId, reference: `${tag}-ADMIN-LABEL`, templateCode: "" },
        denied: role => ({ locationId: labelLocationId, reference: `${tag}-DENIED-${role}`, templateCode: "" }),
      },
      {
        route: `/labels/jobs/${jobId}`,
        button: /^Marcar impresa$/,
        deniedRoles: ["SALES_EXECUTIVE"],
        // Keep the admin control harmless; the independent concurrent positive probe below uses the valid job ID.
        control: { jobId: "", next: `/labels/jobs/${jobId}` },
        denied: () => ({ jobId, next: `/labels/jobs/${jobId}` }),
      },
      {
        route: `/labels/jobs/${jobId}`,
        button: /^Reimprimir$/,
        deniedRoles: ["SALES_EXECUTIVE"],
        control: { traceRecordId: "", templateCode: "", next: `/labels/jobs/${jobId}` },
        denied: () => ({ traceRecordId: traceId, templateCode: "", next: `/labels/jobs/${jobId}` }),
      },
    ];

    const ownedSnapshot = async () => {
      const warehouses = await db.warehouse.findMany({ where: { code: { in: warehouseCodes } }, orderBy: { code: "asc" } });
      const locations = await db.location.findMany({ where: { code: { in: locationCodes } }, orderBy: { code: "asc" } });
      const locationIds = locations.map(row => row.id);
      const traces = locationIds.length
        ? await db.traceRecord.findMany({ where: { locationId: { in: locationIds } }, orderBy: { id: "asc" } })
        : [];
      const traceIds = traces.map(row => row.id);
      const jobs = traceIds.length
        ? await db.labelPrintJob.findMany({ where: { traceRecordId: { in: traceIds } }, orderBy: { id: "asc" } })
        : [];
      const entityIds = [...warehouses.map(row => row.id), ...locations.map(row => row.id), ...traceIds, ...jobs.map(row => row.id)];
      const audits = entityIds.length
        ? await db.auditLog.findMany({ where: { entityId: { in: entityIds } }, orderBy: { id: "asc" } })
        : [];
      return { warehouses, locations, traces, jobs, audits, importCount: await db.importLog.count(), importedSku: await db.product.findUnique({ where: { sku: importSku } }) };
    };

    for (const entry of cases) {
      await adminPage.goto(cacheBustedRoute(entry.route));
      const descriptor = await actionFields(adminPage, entry.button);
      const actionUrl = addRenderNonce(descriptor.actionUrl, adminPage.url());
      const headers = { origin: new URL(adminPage.url()).origin, referer: adminPage.url() };
      const adminPayload = await encodeMultipartAction(actionUrl, descriptor.hiddenEntries, entry.control);
      const control = await admin.request.post(actionUrl, {
        data: adminPayload.body,
        headers: { ...headers, "content-type": adminPayload.contentType },
        maxRedirects: 0,
      });
      await testInfo.attach(`server-action-transport-${entry.route.replaceAll("/", "-")}`, {
        body: Buffer.from(JSON.stringify({ ...safeActionDiagnostic(actionUrl, descriptor.hiddenEntries), responseStatus: control.status() }, null, 2)),
        contentType: "application/json",
      });
      expect(control.status(), `Authorized control for ${entry.route} must reach the action successfully`).toBeLessThan(400);
      const controlLocation = control.headers().location ?? "";
      expect(controlLocation).not.toMatch(/\/login(?:[/?]|$)|[?&]error=/);
      const afterAdminControl = await ownedSnapshot();
      expect(afterAdminControl.importCount).toBe(importCount);
      expect(afterAdminControl.importedSku).toBeNull();

      for (const actor of entry.deniedRoles) {
        const deniedPayload = await encodeMultipartAction(actionUrl, descriptor.hiddenEntries, entry.denied(actor));
        const denied = await contextsByRole[actor].request.post(actionUrl, {
          data: deniedPayload.body,
          headers: { ...headers, "content-type": deniedPayload.contentType },
          maxRedirects: 0,
        });
        // Valid inputs and the successful authorized control distinguish permission rejection from form validation.
        expect(denied.status(), `${actor} must be rejected by the Server Action guard for ${entry.route}`).toBeGreaterThanOrEqual(400);
        expect(await ownedSnapshot(), `${actor} must not mutate the fixture for ${entry.route}`).toEqual(afterAdminControl);
        evidence.push({ route: entry.route, actor, controlStatus: control.status(), deniedStatus: denied.status() });
      }
    }

    // Real, zero-stock commit control. The earlier dry-run and denied probes remain unchanged.
    await adminPage.goto(cacheBustedRoute("/catalog/import"));
    const importWriteDescriptor = await actionFields(adminPage, /^Importar$/);
    const importWriteUrl = addRenderNonce(importWriteDescriptor.actionUrl, adminPage.url());
    const importWriteHeaders = { origin: new URL(adminPage.url()).origin, referer: adminPage.url() };
    const importWritePayload = await encodeMultipartAction(importWriteUrl, importWriteDescriptor.hiddenEntries, {
      file: { name: importWriteFileName, mimeType: "text/csv", buffer: Buffer.from(importWriteCsv) },
    });
    importWriteAttempted = true;
    const importWriteResponse = await admin.request.post(importWriteUrl, {
      data: importWritePayload.body,
      headers: { ...importWriteHeaders, "content-type": importWritePayload.contentType },
      maxRedirects: 0,
    });

    const [committedProduct, committedImportLogs] = await Promise.all([
      db.product.findUnique({ where: { sku: importSku } }),
      db.importLog.findMany({ where: { fileName: importWriteFileName }, orderBy: { createdAt: "asc" } }),
    ]);
    const committedImportLogIds = committedImportLogs.map(log => log.id);
    committedProductIdsForCleanup = committedProduct ? [committedProduct.id] : [];
    committedImportLogIdsForCleanup = committedImportLogIds;
    const committedProductAssetIds = committedProduct
      ? (await db.productAsset.findMany({ where: { productId: committedProduct.id }, select: { id: true } })).map(asset => asset.id)
      : [];
    const importEntityIds = [...(committedProduct ? [committedProduct.id] : []), ...committedImportLogIds];
    const committedAuditLogs = importEntityIds.length
      ? await db.auditLog.findMany({ where: { entityId: { in: importEntityIds } }, orderBy: { id: "asc" } })
      : [];
    const committedTechnicalAttributes = committedProduct
      ? await db.productTechnicalAttribute.findMany({ where: { productId: committedProduct.id }, select: { id: true } })
      : [];
    const committedInventory = committedProduct
      ? await db.inventory.findMany({ where: { productId: committedProduct.id }, select: { id: true, locationId: true } })
      : [];
    const committedMovements = committedProduct
      ? await db.inventoryMovement.findMany({ where: { productId: committedProduct.id }, select: { id: true } })
      : [];
    const committedSyncEvents = importEntityIds.length + committedProductAssetIds.length
      ? await db.syncEvent.findMany({
          where: {
            entityType: { in: ["PRODUCT", "PRODUCT_ASSET"] },
            entityId: { in: [...importEntityIds, ...committedProductAssetIds] },
          },
          select: { id: true },
        })
      : [];
    const expectedAdminActor = adminActor?.name?.trim() || adminActor?.email?.trim() || adminActor?.id || null;
    committedImportEvidence = {
      fileName: importWriteFileName,
      sku: importSku,
      responseStatus: importWriteResponse.status(),
      productId: committedProduct?.id ?? null,
      importLogIds: committedImportLogIds,
      auditIds: committedAuditLogs.map(row => row.id),
      productAssetIds: committedProductAssetIds,
      technicalAttributeIds: committedTechnicalAttributes.map(row => row.id),
      inventoryIds: committedInventory.map(row => row.id),
      movementIds: committedMovements.map(row => row.id),
      syncEventIds: committedSyncEvents.map(row => row.id),
      actorUserId: adminActor?.id ?? null,
    };

    expect(importWriteResponse.status(), "Authorized CSV write must redirect after commit").toBe(303);
    expect(importWriteResponse.headers().location ?? "").not.toMatch(/[?&]error=/);
    expect(committedProduct).not.toBeNull();
    expect(committedProduct?.name).toBe("Authorized import write probe");
    expect(committedProduct?.type).toBe("ACCESSORY");
    expect(committedInventory, "A zero-quantity import must not create stock").toHaveLength(0);
    expect(committedMovements, "A zero-quantity import must not create stock movements").toHaveLength(0);
    expect(committedImportLogs).toHaveLength(1);
    expect(committedImportLogs[0]).toMatchObject({
      fileName: importWriteFileName,
      rows: 1,
      skus: 1,
      dryRun: false,
      status: "IMPORTED",
      error: null,
    });
    expect(adminActor).not.toBeNull();
    expect(committedAuditLogs.filter(row => row.entityType === "PRODUCT" && row.action === "IMPORT_CREATE")).toEqual([
      expect.objectContaining({ entityId: committedProduct?.id, actorUserId: adminActor?.id, actor: expectedAdminActor }),
    ]);
    expect(committedAuditLogs.filter(row => row.entityType === "IMPORT_LOG" && row.action === "IMPORT_COMPLETED")).toEqual([
      expect.objectContaining({ entityId: committedImportLogs[0].id, actorUserId: adminActor?.id, actor: expectedAdminActor }),
    ]);

    // Positive and concurrent permission control: exactly one audit records the authorized print transition.
    await adminPage.goto(cacheBustedRoute(`/labels/jobs/${jobId}`));
    const printDescriptor = await actionFields(adminPage, /^Marcar impresa$/);
    const printUrl = addRenderNonce(printDescriptor.actionUrl, adminPage.url());
    const printHeaders = { origin: new URL(adminPage.url()).origin, referer: adminPage.url() };
    const printPayloads = await Promise.all([0, 1].map(() => encodeMultipartAction(printUrl, printDescriptor.hiddenEntries, { jobId, next: `/labels/jobs/${jobId}` })));
    const printed = await Promise.all(printPayloads.map(payload => admin.request.post(printUrl, {
      data: payload.body,
      headers: { ...printHeaders, "content-type": payload.contentType },
      maxRedirects: 0,
    })));
    for (const response of printed) expect(response.status()).toBe(303);
    expect((await db.labelPrintJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("PRINTED");
    const printAudits = await db.auditLog.findMany({ where: { entityId: jobId, action: "MARK_PRINTED" } });
    expect(printAudits).toHaveLength(1);
    expect(printAudits[0].actorUserId).toBe(adminActor?.id);
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()));
    // Discover by exact UUID-derived codes so even a broken unauthorized create is removed without broad-prefix deletion.
    const ownedWarehouses = await db.warehouse.findMany({ where: { code: { in: warehouseCodes } }, select: { id: true } });
    const ownedLocations = await db.location.findMany({ where: { code: { in: locationCodes } }, select: { id: true } });
    const ownedLocationIds = ownedLocations.map(row => row.id);
    const ownedTraces = ownedLocationIds.length
      ? await db.traceRecord.findMany({ where: { locationId: { in: ownedLocationIds } }, select: { id: true } })
      : [];
    const ownedTraceIds = ownedTraces.map(row => row.id);
    const ownedJobs = ownedTraceIds.length
      ? await db.labelPrintJob.findMany({ where: { traceRecordId: { in: ownedTraceIds } }, select: { id: true } })
      : [];
    const entityIds = [...ownedWarehouses.map(row => row.id), ...ownedLocationIds, ...ownedTraceIds, ...ownedJobs.map(row => row.id)];
    if (entityIds.length) await db.auditLog.deleteMany({ where: { entityId: { in: entityIds } } });
    if (ownedJobs.length) await db.labelPrintJob.deleteMany({ where: { id: { in: ownedJobs.map(row => row.id) } } });
    if (ownedTraceIds.length) await db.traceRecord.deleteMany({ where: { id: { in: ownedTraceIds } } });
    if (ownedLocationIds.length) await db.location.deleteMany({ where: { id: { in: ownedLocationIds } } });
    if (ownedWarehouses.length) await db.warehouse.deleteMany({ where: { id: { in: ownedWarehouses.map(row => row.id) } } });

    const residuals = {
      warehouses: await db.warehouse.count({ where: { code: { in: warehouseCodes } } }),
      locations: await db.location.count({ where: { code: { in: locationCodes } } }),
      traces: ownedLocationIds.length ? await db.traceRecord.count({ where: { locationId: { in: ownedLocationIds } } }) : 0,
      jobs: await db.labelPrintJob.count({ where: { traceRecordId: { in: ownedTraceIds } } }),
      audits: entityIds.length ? await db.auditLog.count({ where: { entityId: { in: entityIds } } }) : 0,
      labelsRestored: await db.labelPrintJob.count() === initialJobCount,
    };
    const ownedProducts = importWriteFixtureReserved && importWriteAttempted
      ? await db.product.findMany({
          where: committedProductIdsForCleanup.length ? { id: { in: committedProductIdsForCleanup } } : { sku: importSku },
          select: { id: true },
        })
      : [];
    const ownedProductIds = ownedProducts.map(product => product.id);
    const ownedImportLogs = importWriteFixtureReserved && importWriteAttempted
      ? await db.importLog.findMany({
          where: committedImportLogIdsForCleanup.length ? { id: { in: committedImportLogIdsForCleanup } } : { fileName: importWriteFileName },
          select: { id: true },
        })
      : [];
    const ownedImportLogIds = ownedImportLogs.map(log => log.id);
    const ownedAssets = ownedProductIds.length
      ? await db.productAsset.findMany({ where: { productId: { in: ownedProductIds } }, select: { id: true } })
      : [];
    const ownedAssetIds = ownedAssets.map(asset => asset.id);
    const ownedInventory = ownedProductIds.length
      ? await db.inventory.findMany({ where: { productId: { in: ownedProductIds } }, select: { id: true, locationId: true } })
      : [];
    const ownedProductEntityIds = [...ownedProductIds, ...ownedAssetIds, ...ownedImportLogIds,
      ...ownedInventory.map(row => `${ownedProductIds[0]}:${row.locationId}`)];
    const ownedMovements = ownedProductIds.length
      ? await db.inventoryMovement.findMany({ where: { productId: { in: ownedProductIds } }, select: { id: true } })
      : [];
    const ownedSyncEvents = ownedProductEntityIds.length
      ? await db.syncEvent.findMany({
          where: {
            entityType: { in: ["PRODUCT", "PRODUCT_ASSET"] },
            entityId: { in: [...ownedProductIds, ...ownedAssetIds] },
          },
          select: { id: true },
        })
      : [];
    const ownedTechnicalAttributes = ownedProductIds.length
      ? await db.productTechnicalAttribute.findMany({ where: { productId: { in: ownedProductIds } }, select: { id: true } })
      : [];
    const ownedImportAudits = ownedProductEntityIds.length
      ? await db.auditLog.findMany({ where: { entityId: { in: ownedProductEntityIds } }, select: { id: true } })
      : [];

    await db.$transaction(async tx => {
      if (ownedImportAudits.length) await tx.auditLog.deleteMany({ where: { id: { in: ownedImportAudits.map(row => row.id) } } });
      if (ownedSyncEvents.length) await tx.syncEvent.deleteMany({ where: { id: { in: ownedSyncEvents.map(row => row.id) } } });
      if (ownedMovements.length) await tx.inventoryMovement.deleteMany({ where: { id: { in: ownedMovements.map(row => row.id) } } });
      if (ownedInventory.length) await tx.inventory.deleteMany({ where: { id: { in: ownedInventory.map(row => row.id) } } });
      if (ownedTechnicalAttributes.length) await tx.productTechnicalAttribute.deleteMany({ where: { id: { in: ownedTechnicalAttributes.map(row => row.id) } } });
      if (ownedAssets.length) await tx.productAsset.deleteMany({ where: { id: { in: ownedAssetIds } } });
      if (ownedProducts.length) await tx.product.deleteMany({ where: { id: { in: ownedProductIds } } });
      if (ownedImportLogs.length) await tx.importLog.deleteMany({ where: { id: { in: ownedImportLogIds } } });
    });

    const importResiduals = {
      products: importWriteFixtureReserved && importWriteAttempted ? await db.product.count({ where: { sku: importSku } }) : 0,
      importLogs: importWriteFixtureReserved && importWriteAttempted ? await db.importLog.count({ where: { fileName: importWriteFileName } }) : 0,
      assets: ownedProductIds.length ? await db.productAsset.count({ where: { productId: { in: ownedProductIds } } }) : 0,
      technicalAttributes: ownedProductIds.length ? await db.productTechnicalAttribute.count({ where: { productId: { in: ownedProductIds } } }) : 0,
      movements: ownedProductIds.length ? await db.inventoryMovement.count({ where: { productId: { in: ownedProductIds } } }) : 0,
      inventory: ownedProductIds.length ? await db.inventory.count({ where: { productId: { in: ownedProductIds } } }) : 0,
      syncEvents: ownedProductIds.length || ownedAssetIds.length
        ? await db.syncEvent.count({ where: { entityType: { in: ["PRODUCT", "PRODUCT_ASSET"] }, entityId: { in: [...ownedProductIds, ...ownedAssetIds] } } })
        : 0,
      audits: ownedProductEntityIds.length ? await db.auditLog.count({ where: { entityId: { in: ownedProductEntityIds } } }) : 0,
    };
    await testInfo.attach("server-action-permission-evidence.json", {
      body: Buffer.from(JSON.stringify({ tag, requests: evidence, committedImport: committedImportEvidence, importResiduals, residuals })),
      contentType: "application/json",
    });
    await db.$disconnect();
    expect(residuals.warehouses).toBe(0);
    expect(residuals.locations).toBe(0);
    expect(residuals.traces).toBe(0);
    expect(residuals.jobs).toBe(0);
    expect(residuals.audits).toBe(0);
    expect(residuals.labelsRestored).toBe(true);
    expect(importResiduals.products).toBe(0);
    expect(importResiduals.importLogs).toBe(0);
    expect(importResiduals.assets).toBe(0);
    expect(importResiduals.technicalAttributes).toBe(0);
    expect(importResiduals.movements).toBe(0);
    expect(importResiduals.inventory).toBe(0);
    expect(importResiduals.syncEvents).toBe(0);
    expect(importResiduals.audits).toBe(0);
  }
});
