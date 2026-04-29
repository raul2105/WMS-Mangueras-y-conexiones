import { z } from "zod";

const requiredText = (label: string) =>
  z.string().trim().min(1, `${label} es obligatorio`);

const decimalText = (label: string, allowNegative = false) =>
  z
    .string()
    .trim()
    .refine((value) => value.length > 0, `${label} es obligatorio`)
    .transform((value) => Number(value.replace(",", ".")))
    .refine((value) => Number.isFinite(value), `${label} es invalido`)
    .refine(
      (value) => (allowNegative ? value !== 0 : value > 0),
      allowNegative ? `${label} no puede ser 0` : `${label} debe ser mayor a 0`
    );

export const receiveStockSchema = z.object({
  code: requiredText("Codigo"),
  warehouseId: requiredText("Almacen"),
  locationId: requiredText("Ubicacion"),
  reference: requiredText("Referencia"),
  operatorName: requiredText("Operador"),
  notes: z.string().trim().optional(),
  quantityRaw: decimalText("Cantidad"),
});

export const pickStockSchema = z.object({
  code: requiredText("Codigo"),
  locationCode: requiredText("Ubicacion"),
  operatorName: requiredText("Operador"),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  quantityRaw: decimalText("Cantidad"),
});

export const productionOrderCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Codigo es obligatorio")
    .regex(/^[A-Z0-9-]+$/, "Codigo invalido"),
  status: z.enum(["BORRADOR", "ABIERTA", "EN_PROCESO", "COMPLETADA", "CANCELADA"]),
  warehouseId: requiredText("Almacen"),
  customerName: z.string().trim().optional(),
  priorityRaw: z.string().trim().optional(),
  dueDateRaw: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const assemblyOrderHeaderSchema = z.object({
  warehouseId: requiredText("Almacen"),
  customerName: requiredText("Cliente"),
  dueDateRaw: requiredText("Fecha compromiso"),
  priorityRaw: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const productionOrderUpdateSchema = z.object({
  id: requiredText("Id"),
  status: z.enum(["BORRADOR", "ABIERTA", "EN_PROCESO", "COMPLETADA", "CANCELADA"]),
  customerName: z.string().trim().optional(),
  priorityRaw: z.string().trim().optional(),
  dueDateRaw: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const productionOrderItemSchema = z.object({
  orderId: requiredText("Orden"),
  productId: requiredText("Producto"),
  locationId: requiredText("Ubicacion"),
  quantityRaw: decimalText("Cantidad"),
});

export const assemblyConfigSchema = z.object({
  warehouseId: requiredText("Almacen"),
  entryFittingProductId: requiredText("Conexion de entrada"),
  hoseProductId: requiredText("Manguera"),
  exitFittingProductId: requiredText("Conexion de salida"),
  hoseLengthRaw: decimalText("Longitud de manguera"),
  assemblyQuantityRaw: decimalText("Cantidad de ensambles"),
  sourceDocumentRef: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const assemblyConsumeSchema = z.object({
  orderId: requiredText("Orden"),
  operatorName: requiredText("Operador"),
});

export const inventoryAdjustmentSchema = z.object({
  code: requiredText("Codigo"),
  locationCode: requiredText("Ubicacion"),
  operatorName: requiredText("Operador"),
  reason: requiredText("Motivo"),
  deltaRaw: decimalText("Ajuste", true),
});

export const transferStockSchema = z.object({
  code: requiredText("Codigo"),
  fromLocationCode: requiredText("Ubicacion origen"),
  toLocationCode: requiredText("Ubicacion destino"),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  quantityRaw: decimalText("Cantidad"),
}).refine((value) => value.fromLocationCode !== value.toLocationCode, {
  path: ["toLocationCode"],
  message: "Origen y destino no pueden ser iguales",
});

export const newCatalogInventorySchema = z.object({
  locationCode: z.string().trim().optional(),
  quantityRaw: z.string().trim().optional(),
});

export function parsePriority(value?: string, fallback = 3) {
  const priority = value ? Number(value) : fallback;
  if (!Number.isFinite(priority) || priority < 1 || priority > 5) {
    return null;
  }
  return priority;
}

export function parseDueDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function firstErrorMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Datos invalidos";
}

// ─── Módulo de Compras ────────────────────────────────────────────────────────

export const supplierCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Código mínimo 2 caracteres")
    .max(20, "Código máximo 20 caracteres")
    .regex(/^[A-Z0-9\-]+$/, "Solo mayúsculas, números y guiones"),
  name: requiredText("Nombre"),
  legalName: z.string().trim().max(200).optional(),
  businessName: z.string().trim().max(200).optional(),
  taxId: z.string().trim().max(20).optional(),
  email: z.union([z.string().trim().email("Email inválido"), z.literal("")]).optional(),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(500).optional(),
});

export const customerCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Código mínimo 2 caracteres")
    .max(20, "Código máximo 20 caracteres")
    .regex(/^[A-Z0-9\-]+$/, "Solo mayúsculas, números y guiones")
    .optional(),
  name: requiredText("Nombre"),
  legalName: z.string().trim().max(200).optional(),
  businessName: z.string().trim().max(200).optional(),
  taxId: z
    .string()
    .trim()
    .toUpperCase()
    .min(10, "RFC mínimo 10 caracteres")
    .max(20, "RFC máximo 20 caracteres")
    .regex(/^[A-Z0-9\-]+$/, "RFC inválido (solo mayúsculas, números y guiones)")
    .optional(),
  email: z.union([z.string().trim().email("Email inválido"), z.literal("")]).optional(),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(500).optional(),
});

export const customerUpdateSchema = z.object({
  name: requiredText("Nombre"),
  legalName: z.string().trim().max(200).optional(),
  businessName: z.string().trim().max(200).optional(),
  taxId: z
    .string()
    .trim()
    .toUpperCase()
    .min(10, "RFC mínimo 10 caracteres")
    .max(20, "RFC máximo 20 caracteres")
    .regex(/^[A-Z0-9\-]+$/, "RFC inválido (solo mayúsculas, números y guiones)")
    .optional(),
  email: z.union([z.string().trim().email("Email inválido"), z.literal("")]).optional(),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(500).optional(),
  isActive: z.boolean(),
});

export const customerQuickCreateInlineSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Código mínimo 2 caracteres")
    .max(20, "Código máximo 20 caracteres")
    .regex(/^[A-Z0-9\-]+$/, "Solo mayúsculas, números y guiones")
    .optional(),
  name: requiredText("Nombre"),
  taxId: z
    .string()
    .trim()
    .toUpperCase()
    .min(10, "RFC mínimo 10 caracteres")
    .max(20, "RFC máximo 20 caracteres")
    .regex(/^[A-Z0-9\-]+$/, "RFC inválido (solo mayúsculas, números y guiones)")
    .optional(),
  email: z.union([z.string().trim().email("Email inválido"), z.literal("")]).optional(),
});

export const supplierBrandSchema = z.object({
  name: z.string().trim().min(1, "La marca es obligatoria").max(100, "Máximo 100 caracteres"),
});

export const purchaseOrderCreateSchema = z.object({
  supplierId: requiredText("Proveedor"),
  expectedDate: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const purchaseOrderLineSchema = z.object({
  purchaseOrderId: requiredText("Orden de compra"),
  productId: requiredText("Producto"),
  qtyOrderedRaw: decimalText("Cantidad"),
  unitPriceRaw: z.string().trim().optional(),
});

export const purchaseReceiptSchema = z.object({
  purchaseOrderId: requiredText("Orden de compra"),
  locationId: requiredText("Ubicación"),
  referenceDoc: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const purchaseReceiptOperationSchema = z.object({
  locationId: requiredText("Ubicación"),
  operatorName: requiredText("Operador"),
  referenceDoc: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

// ─── Pedidos de surtido / captura comercial ─────────────────────────────────

export const salesInternalOrderCreateSchema = z.object({
  customerId: z.string().trim().optional(),
  customerName: z.string().trim().optional(),
  warehouseId: requiredText("Almacen"),
  dueDateRaw: requiredText("Fecha compromiso"),
  notes: z.string().trim().max(1000).optional(),
});

export const salesInternalOrderLineSchema = z.object({
  productId: requiredText("Producto"),
  requestedQtyRaw: decimalText("Cantidad"),
  notes: z.string().trim().max(500).optional(),
});

export const salesInternalOrderProductLineCreateSchema = z.object({
  orderId: requiredText("Pedido"),
  productId: requiredText("Producto"),
  requestedQtyRaw: decimalText("Cantidad"),
  notes: z.string().trim().max(500).optional(),
});

export const salesInternalOrderAssemblyLineCreateSchema = z.object({
  orderId: requiredText("Pedido"),
  warehouseId: requiredText("Almacen"),
  entryFittingProductId: requiredText("Conexion de entrada"),
  hoseProductId: requiredText("Manguera"),
  exitFittingProductId: requiredText("Conexion de salida"),
  hoseLengthRaw: decimalText("Longitud de manguera"),
  assemblyQuantityRaw: decimalText("Cantidad de ensambles"),
  sourceDocumentRef: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const salesInternalOrderTransitionSchema = z.object({
  orderId: requiredText("Pedido"),
});

export const salesGenerateProductionOrderSchema = z.object({
  orderId: requiredText("Pedido"),
  lineId: requiredText("Linea"),
});

export const salesOrderPickListTransitionSchema = z.object({
  orderId: requiredText("Pedido"),
});

export const salesOrderPickConfirmSchema = z.object({
  orderId: requiredText("Pedido"),
  operatorName: requiredText("Operador"),
});
