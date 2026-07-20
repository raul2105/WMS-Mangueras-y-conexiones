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
  operatorName: z.string().trim().optional(),
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
  const issue = error.issues[0];
  if (!issue) return "Revisa los datos capturados";

  if (issue.code === "invalid_type") {
    const field = String(issue.path.at(-1) ?? "");
    const labels: Record<string, string> = {
      discrepancyReason: "el motivo de la diferencia",
      locationId: "la ubicación",
      operatorName: "el operador",
      quantityRaw: "la cantidad",
      reference: "la referencia",
      notes: "las notas",
    };
    return `Revisa ${labels[field] ?? "el dato capturado"}`;
  }

  return issue.message;
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
  paymentTerms: z.string().trim().max(500).optional(),
});

export const supplierUpdateSchema = z.object({
  paymentTerms: z.string().trim().max(500).optional(),
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
  deliveryWarehouseId: requiredText("Almacén destino"),
  expectedDate: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const purchaseOrderCreateLineSchema = z.object({
  productId: requiredText("Producto"),
  qtyOrdered: z.coerce.number().positive("La cantidad debe ser mayor a cero"),
  unitPrice: z.coerce.number().min(0, "El precio no puede ser negativo").nullable().optional(),
});

export const purchaseOrderCreateLinesSchema = z
  .array(purchaseOrderCreateLineSchema)
  .min(1, "Agrega al menos un producto a la orden")
  .superRefine((lines, ctx) => {
    const seen = new Set<string>();
    lines.forEach((line, index) => {
      if (seen.has(line.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "No repitas el mismo producto; modifica la cantidad de la línea existente",
          path: [index, "productId"],
        });
      }
      seen.add(line.productId);
    });
  });

export const purchaseOrderUpdateSchema = z.object({
  deliveryWarehouseId: requiredText("Almacén destino"),
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

// Per-line receiving discrepancy schema
export const purchaseReceiptLineDiscrepancySchema = z.object({
  lineId: requiredText("Línea"),
  qtyReceived: z.coerce.number().min(0),
  qtyDamaged: z.coerce.number().min(0).default(0),
  qtyMissing: z.coerce.number().min(0).default(0),
  qtyRejected: z.coerce.number().min(0).default(0),
  qtySurplusReported: z.coerce.number().min(0).default(0),
  discrepancyReason: z.string().trim().max(500).optional(),
}).refine(
  (data) => {
    const hasDiscrepancy = data.qtyDamaged > 0 || data.qtyMissing > 0 || data.qtyRejected > 0 || data.qtySurplusReported > 0;
    return !hasDiscrepancy || (data.discrepancyReason && data.discrepancyReason.length > 0);
  },
  { message: "Motivo de discrepancia requerido cuando hay cantidades dañadas, faltantes, rechazadas o sobrantes", path: ["discrepancyReason"] }
);

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

export const salesInternalOrderAssemblyCreateSchema =
  salesInternalOrderAssemblyLineCreateSchema.omit({ orderId: true });

export const salesInternalOrderLinesCreateSchema = z
  .array(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("PRODUCT"),
        productId: requiredText("Producto"),
        requestedQty: z.number().finite().positive("La cantidad debe ser mayor que cero"),
        notes: z.string().trim().max(500).optional(),
      }),
      z.object({
        kind: z.literal("ASSEMBLY"),
        entryFittingProductId: requiredText("Conexion de entrada"),
        hoseProductId: requiredText("Manguera"),
        exitFittingProductId: requiredText("Conexion de salida"),
        hoseLength: z.number().finite().positive("La longitud debe ser mayor que cero"),
        assemblyQuantity: z.number().finite().positive("La cantidad debe ser mayor que cero"),
        sourceDocumentRef: z.string().trim().max(120).optional(),
        notes: z.string().trim().max(1000).optional(),
      }),
    ]),
  )
  .min(1, "Agrega al menos un producto o ensamble");

export const salesInternalOrderTransitionSchema = z.object({
  orderId: requiredText("Pedido"),
});

export const salesInternalOrderPreparationSchema = z.object({
  orderId: requiredText("Pedido"),
  preparedLocationId: requiredText("Área de entrega"),
  notes: z.string().trim().max(500).optional(),
});

export const salesInternalOrderAssignmentSchema = z.object({
  orderId: requiredText("Pedido"),
  assigneeUserId: requiredText("Vendedor"),
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
  operatorName: z.string().trim().optional(),
});
