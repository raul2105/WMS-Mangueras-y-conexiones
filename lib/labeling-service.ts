import QRCode from "qrcode";
import {
  LabelPrintJobStatus,
  LabelSymbolKind,
  LabelType,
  Prisma,
  PrismaClient,
  type InventoryMovementType,
} from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

type LabelDataset = {
  company: string;
  movementType: string;
  sku: string;
  description: string;
  quantity: number | null;
  unit: string;
  warehouse: string;
  location: string;
  timestamp: string;
  operator: string;
  reference: string;
  traceId: string;
  traceUrl: string;
  symbolValue: string;
  sourceDocument: string;
};

type CreateMovementTraceInput = {
  movementId: string;
  labelType: LabelType;
  sourceEntityType: string;
  sourceEntityId: string;
  operatorName?: string | null;
  templateCode?: string | null;
};

type CreateLocationTraceInput = {
  locationId: string;
  operatorName: string;
  reference?: string | null;
  templateCode?: string | null;
};

const DEFAULT_COMPANY_NAME = process.env.WMS_COMPANY_NAME?.trim() || "SCMayher";
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() || "http://localhost:3002";

const DEFAULT_TEMPLATES: Array<Prisma.LabelTemplateCreateInput> = [
  { code: "RECEIPT_STANDARD", name: "Recepcion estandar", labelType: "RECEIPT", isDefault: true, definitionJson: JSON.stringify({ variant: "standard" }) },
  { code: "RECEIPT_COMPACT", name: "Recepcion compacta", labelType: "RECEIPT", definitionJson: JSON.stringify({ variant: "compact" }) },
  { code: "PICKING_STANDARD", name: "Picking estandar", labelType: "PICKING", isDefault: true, definitionJson: JSON.stringify({ variant: "standard" }) },
  { code: "PICKING_COMPACT", name: "Picking compacta", labelType: "PICKING", definitionJson: JSON.stringify({ variant: "compact" }) },
  { code: "LOCATION_STANDARD", name: "Ubicacion estandar", labelType: "LOCATION", isDefault: true, definitionJson: JSON.stringify({ variant: "standard" }) },
  { code: "LOCATION_COMPACT", name: "Ubicacion compacta", labelType: "LOCATION", definitionJson: JSON.stringify({ variant: "compact" }) },
  { code: "ADJUSTMENT_STANDARD", name: "Ajuste estandar", labelType: "ADJUSTMENT", isDefault: true, definitionJson: JSON.stringify({ variant: "standard" }) },
  { code: "ADJUSTMENT_COMPACT", name: "Ajuste compacta", labelType: "ADJUSTMENT", definitionJson: JSON.stringify({ variant: "compact" }) },
  { code: "WIP_STANDARD", name: "WIP estandar", labelType: "WIP", isDefault: true, definitionJson: JSON.stringify({ variant: "standard" }) },
  { code: "WIP_COMPACT", name: "WIP compacta", labelType: "WIP", definitionJson: JSON.stringify({ variant: "compact" }) },
];

function movementTypeToLabel(type: InventoryMovementType, labelType: LabelType): string {
  if (labelType === "WIP") return "WIP";
  const labels: Record<InventoryMovementType, string> = {
    IN: "Entrada",
    OUT: "Salida",
    TRANSFER: "Traslado",
    ADJUSTMENT: "Ajuste",
  };
  return labels[type] ?? String(type);
}

function labelTypeToPrefix(labelType: LabelType): string {
  const map: Record<LabelType, string> = {
    RECEIPT: "REC",
    PICKING: "PCK",
    LOCATION: "LOC",
    ADJUSTMENT: "ADJ",
    WIP: "WIP",
  };
  return map[labelType];
}

export function generateTraceId(labelType: LabelType): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TRC-${labelTypeToPrefix(labelType)}-${yyyy}${mm}${dd}-${rand}`;
}

export async function ensureDefaultLabelTemplates(db: Db) {
  await Promise.all(
    DEFAULT_TEMPLATES.map((tpl) =>
      db.labelTemplate.upsert({
        where: { code: tpl.code },
        update: {
          name: tpl.name,
          labelType: tpl.labelType,
          isActive: true,
          definitionJson: tpl.definitionJson,
          isDefault: tpl.isDefault ?? false,
        },
        create: tpl,
      })
    )
  );
}

async function resolveTemplate(db: Db, labelType: LabelType, templateCode?: string | null) {
  await ensureDefaultLabelTemplates(db);
  if (templateCode) {
    const byCode = await db.labelTemplate.findUnique({ where: { code: templateCode } });
    if (byCode && byCode.isActive && byCode.labelType === labelType) {
      return byCode;
    }
  }

  const fallback = await db.labelTemplate.findFirst({
    where: { labelType, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (!fallback) {
    throw new Error(`No active label template for ${labelType}`);
  }
  return fallback;
}

async function getSymbolMarkup(symbolKind: LabelSymbolKind, value: string): Promise<string> {
  if (symbolKind === "QR") {
    const dataUrl = await QRCode.toDataURL(value, { margin: 1, width: 160 });
    return `<img src="${dataUrl}" alt="QR ${escapeHtml(value)}" width="120" height="120" />`;
  }
  return `<div style="font-family:monospace;font-size:13px;border:1px solid #111;padding:8px">${escapeHtml(value)}</div>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function renderLabelHtml(
  template: { name: string; code: string; symbolKind: LabelSymbolKind; definitionJson: string },
  dataset: LabelDataset
) {
  const definition = JSON.parse(template.definitionJson || "{}") as { variant?: string };
  const isCompact = definition.variant === "compact";
  const symbol = await getSymbolMarkup(template.symbolKind, dataset.symbolValue);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(template.name)} - ${escapeHtml(dataset.traceId)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:16px;background:#f4f7fb;color:#0f172a}
    .card{border:1px solid #0f172a;padding:${isCompact ? "8px" : "14px"};max-width:520px;background:#fff}
    .top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
    .t{font-size:12px;color:#334155;text-transform:uppercase}
    .v{font-size:${isCompact ? "13px" : "15px"};font-weight:700}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
    .full{grid-column:1/3}
    .trace{margin-top:10px;padding:8px;border:1px dashed #334155;font-family:monospace}
    .symbol{margin-top:10px}
    @media print { body{padding:0}.card{border:1px solid #000;max-width:none} }
  </style>
</head>
<body>
  <div class="card">
    <div class="top">
      <div>
        <div class="t">Empresa</div>
        <div class="v">${escapeHtml(dataset.company)}</div>
      </div>
      <div>
        <div class="t">Plantilla</div>
        <div class="v">${escapeHtml(template.name)}</div>
      </div>
    </div>
    <div class="grid">
      <div><div class="t">Tipo movimiento</div><div class="v">${escapeHtml(dataset.movementType)}</div></div>
      <div><div class="t">SKU</div><div class="v">${escapeHtml(dataset.sku)}</div></div>
      <div class="full"><div class="t">Descripcion</div><div class="v">${escapeHtml(dataset.description)}</div></div>
      <div><div class="t">Cantidad</div><div class="v">${dataset.quantity ?? "--"}</div></div>
      <div><div class="t">Unidad</div><div class="v">${escapeHtml(dataset.unit)}</div></div>
      <div><div class="t">Almacen</div><div class="v">${escapeHtml(dataset.warehouse)}</div></div>
      <div><div class="t">Ubicacion</div><div class="v">${escapeHtml(dataset.location)}</div></div>
      <div><div class="t">Fecha/hora</div><div class="v">${escapeHtml(dataset.timestamp)}</div></div>
      <div><div class="t">Operador</div><div class="v">${escapeHtml(dataset.operator)}</div></div>
      <div class="full"><div class="t">Referencia</div><div class="v">${escapeHtml(dataset.reference)}</div></div>
      <div class="full"><div class="t">Documento</div><div class="v">${escapeHtml(dataset.sourceDocument)}</div></div>
    </div>
    <div class="trace">
      <div><strong>Trace ID:</strong> ${escapeHtml(dataset.traceId)}</div>
      <div><strong>Resolver:</strong> ${escapeHtml(dataset.traceUrl)}</div>
    </div>
    <div class="symbol">${symbol}</div>
  </div>
</body>
</html>`;
}

async function createJob(
  db: Db,
  traceRecord: { id: string },
  template: { id: string; name: string; code: string; symbolKind: LabelSymbolKind; definitionJson: string },
  dataset: LabelDataset,
  requestedBy?: string | null
) {
  const html = await renderLabelHtml(template, dataset);
  return db.labelPrintJob.create({
    data: {
      traceRecordId: traceRecord.id,
      labelTemplateId: template.id,
      status: LabelPrintJobStatus.RENDERED,
      outputFormat: "html",
      payloadJson: JSON.stringify(dataset),
      htmlSnapshot: html,
      requestedBy: requestedBy ?? null,
    },
  });
}

export async function createMovementTraceAndLabelJob(db: Db, input: CreateMovementTraceInput) {
  const existingTrace = await db.traceRecord.findUnique({
    where: {
      sourceEntityType_sourceEntityId: {
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
      },
    },
    select: { traceId: true },
  });

  const movement = await db.inventoryMovement.findUnique({
    where: { id: input.movementId },
    include: {
      product: { select: { id: true, sku: true, name: true, unitLabel: true } },
      location: {
        select: {
          id: true,
          code: true,
          warehouse: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });
  if (!movement) throw new Error("Inventory movement not found for label generation");

  const traceId = existingTrace?.traceId || movement.traceId?.trim() || generateTraceId(input.labelType);
  const traceUrl = `${APP_BASE_URL}/trace/${encodeURIComponent(traceId)}`;
  const template = await resolveTemplate(db, input.labelType, input.templateCode);
  const timestamp = new Date(movement.createdAt).toLocaleString("es-MX");
  const operator = (input.operatorName || movement.operatorName || "system").trim();
  const dataset: LabelDataset = {
    company: DEFAULT_COMPANY_NAME,
    movementType: movementTypeToLabel(movement.type, input.labelType),
    sku: movement.product.sku,
    description: movement.product.name,
    quantity: movement.quantity,
    unit: movement.product.unitLabel || "unidad",
    warehouse: movement.location?.warehouse.code || "--",
    location: movement.type === "TRANSFER" ? `${movement.fromLocationCode ?? "--"} -> ${movement.toLocationCode ?? "--"}` : movement.location?.code || "--",
    timestamp,
    operator,
    reference: movement.reference || "--",
    traceId,
    traceUrl,
    symbolValue: traceId,
    sourceDocument: movement.documentType && movement.documentId ? `${movement.documentType}:${movement.documentId}` : "--",
  };

  if (!movement.traceId || movement.operatorName !== operator) {
    await db.inventoryMovement.update({
      where: { id: movement.id },
      data: { traceId, operatorName: operator },
    });
  }

  const trace = await db.traceRecord.upsert({
    where: {
      sourceEntityType_sourceEntityId: {
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
      },
    },
    update: {
      traceId,
      operatorName: operator,
      reference: movement.reference,
      quantity: movement.quantity,
      unitLabel: movement.product.unitLabel || "unidad",
      sourceDocumentType: movement.documentType,
      sourceDocumentId: movement.documentId,
      sourceDocumentLineId: movement.documentLineId,
      payloadJson: JSON.stringify(dataset),
      productId: movement.productId,
      warehouseId: movement.location?.warehouse.id,
      locationId: movement.locationId,
      originMovementId: movement.id,
    },
    create: {
      traceId,
      labelType: input.labelType,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      companyName: DEFAULT_COMPANY_NAME,
      operatorName: operator,
      reference: movement.reference,
      quantity: movement.quantity,
      unitLabel: movement.product.unitLabel || "unidad",
      sourceDocumentType: movement.documentType,
      sourceDocumentId: movement.documentId,
      sourceDocumentLineId: movement.documentLineId,
      payloadJson: JSON.stringify(dataset),
      productId: movement.productId,
      warehouseId: movement.location?.warehouse.id,
      locationId: movement.locationId,
      originMovementId: movement.id,
    },
  });

  const job = await createJob(db, trace, template, dataset, operator);
  return { trace, job, dataset, template };
}

export async function createLocationTraceAndLabelJob(db: Db, input: CreateLocationTraceInput) {
  const location = await db.location.findUnique({
    where: { id: input.locationId },
    include: { warehouse: { select: { id: true, code: true, name: true } } },
  });
  if (!location) throw new Error("Location not found");

  const trace = await db.traceRecord.findUnique({
    where: {
      sourceEntityType_sourceEntityId: {
        sourceEntityType: "LOCATION",
        sourceEntityId: location.id,
      },
    },
  });

  const traceId = trace?.traceId || generateTraceId("LOCATION");
  const traceUrl = `${APP_BASE_URL}/trace/${encodeURIComponent(traceId)}`;
  const template = await resolveTemplate(db, "LOCATION", input.templateCode);
  const dataset: LabelDataset = {
    company: DEFAULT_COMPANY_NAME,
    movementType: "Etiqueta de ubicacion",
    sku: "--",
    description: location.name,
    quantity: null,
    unit: "--",
    warehouse: location.warehouse.code,
    location: location.code,
    timestamp: new Date().toLocaleString("es-MX"),
    operator: input.operatorName,
    reference: input.reference?.trim() || "--",
    traceId,
    traceUrl,
    symbolValue: traceId,
    sourceDocument: "--",
  };

  const upserted = await db.traceRecord.upsert({
    where: {
      sourceEntityType_sourceEntityId: {
        sourceEntityType: "LOCATION",
        sourceEntityId: location.id,
      },
    },
    update: {
      traceId,
      operatorName: input.operatorName,
      reference: input.reference?.trim() || null,
      payloadJson: JSON.stringify(dataset),
      warehouseId: location.warehouse.id,
      locationId: location.id,
    },
    create: {
      traceId,
      labelType: "LOCATION",
      sourceEntityType: "LOCATION",
      sourceEntityId: location.id,
      companyName: DEFAULT_COMPANY_NAME,
      operatorName: input.operatorName,
      reference: input.reference?.trim() || null,
      payloadJson: JSON.stringify(dataset),
      warehouseId: location.warehouse.id,
      locationId: location.id,
    },
  });

  const job = await createJob(db, upserted, template, dataset, input.operatorName);
  return { trace: upserted, job, dataset, template };
}

export async function createReprintJob(db: Db, traceRecordId: string, templateCode?: string | null, requestedBy?: string | null) {
  const trace = await db.traceRecord.findUnique({ where: { id: traceRecordId } });
  if (!trace) {
    throw new Error("Trace record not found");
  }
  const template = await resolveTemplate(db, trace.labelType, templateCode);
  const payload = JSON.parse(trace.payloadJson || "{}") as LabelDataset;
  const dataset: LabelDataset = {
    ...payload,
    traceId: trace.traceId,
    traceUrl: `${APP_BASE_URL}/trace/${encodeURIComponent(trace.traceId)}`,
  };
  const job = await createJob(db, trace, template, dataset, requestedBy ?? trace.operatorName);
  return { trace, job, dataset, template };
}

export async function markLabelPrintJobStatus(db: Db, jobId: string, status: LabelPrintJobStatus) {
  return db.labelPrintJob.update({
    where: { id: jobId },
    data: {
      status,
      printedAt: status === LabelPrintJobStatus.PRINTED ? new Date() : undefined,
      exportedAt: status === LabelPrintJobStatus.EXPORTED ? new Date() : undefined,
    },
  });
}
