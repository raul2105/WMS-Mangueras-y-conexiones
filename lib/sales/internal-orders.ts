import type { Prisma, PrismaClient, SalesInternalOrderStatus } from "@prisma/client";

const SALES_INTERNAL_ORDER_PREFIX = "PI";
const GENERATED_PRODUCTION_ORDER_PREFIX = "SOE";
const SALES_PICK_LIST_PREFIX = "PK-SUR";

export const SALES_INTERNAL_ORDER_STATUS_LABELS: Record<SalesInternalOrderStatus, string> = {
  BORRADOR: "Borrador",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
};

export const SALES_INTERNAL_ORDER_STATUS_STYLES: Record<SalesInternalOrderStatus, string> = {
  BORRADOR: "text-slate-300 bg-slate-500/20",
  CONFIRMADA: "text-emerald-300 bg-emerald-500/20",
  CANCELADA: "text-red-300 bg-red-500/20",
};

type CodeDb = PrismaClient | Prisma.TransactionClient;

export async function getNextSalesInternalOrderCode(db: CodeDb, now = new Date()) {
  const year = now.getFullYear();
  const prefix = `${SALES_INTERNAL_ORDER_PREFIX}-${year}-`;
  const lastOrder = await db.salesInternalOrder.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  const lastSequence = lastOrder?.code ? Number.parseInt(lastOrder.code.slice(prefix.length), 10) : 0;
  const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

export async function getNextGeneratedProductionOrderCode(db: CodeDb, now = new Date()) {
  const year = now.getFullYear();
  const prefix = `${GENERATED_PRODUCTION_ORDER_PREFIX}-${year}-`;
  const lastOrder = await db.productionOrder.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  const lastSequence = lastOrder?.code ? Number.parseInt(lastOrder.code.slice(prefix.length), 10) : 0;
  const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

export async function getNextSalesPickListCode(db: CodeDb, now = new Date()) {
  const year = now.getFullYear();
  const prefix = `${SALES_PICK_LIST_PREFIX}-${year}-`;
  const lastPickList = await db.salesInternalOrderPickList.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  const lastSequence = lastPickList?.code ? Number.parseInt(lastPickList.code.slice(prefix.length), 10) : 0;
  const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

export function summarizeProductionStatus(status: string | null | undefined) {
  if (!status) return "Sin orden de ensamble";
  switch (status) {
    case "BORRADOR":
      return "Orden de ensamble en borrador";
    case "ABIERTA":
      return "Orden de ensamble abierta";
    case "EN_PROCESO":
      return "Orden de ensamble en proceso";
    case "COMPLETADA":
      return "Orden de ensamble completada";
    case "CANCELADA":
      return "Orden de ensamble cancelada";
    default:
      return status;
  }
}

export function summarizePickListStatus(status: string | null | undefined) {
  switch (status) {
    case "DRAFT":
      return "Borrador";
    case "RELEASED":
      return "Liberado";
    case "IN_PROGRESS":
      return "En progreso";
    case "PARTIAL":
      return "Parcial";
    case "COMPLETED":
      return "Completado";
    case "CANCELLED":
      return "Cancelado";
    default:
      return status ?? "Sin surtido";
  }
}
