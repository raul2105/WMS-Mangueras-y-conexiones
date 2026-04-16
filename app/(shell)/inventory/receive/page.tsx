import prisma from "@/lib/prisma";
import { InventoryService, InventoryServiceError } from "@/lib/inventory-service";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import ReceiveForm from "@/components/ReceiveForm";
import { firstErrorMessage, receiveStockSchema } from "@/lib/schemas/wms";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";
import { resolveProductInput } from "@/lib/product-search";
import { createMovementTraceAndLabelJob } from "@/lib/labeling-service";
import { pageGuard } from "@/components/rbac/PageGuard";

export const dynamic = "force-dynamic";

async function receiveStock(formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("inventory.receive");

  const code = String(formData.get("code") ?? "").trim();
  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const operatorName = String(formData.get("operatorName") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const referenceFile = formData.get("referenceFile");
  const qtyRaw = String(formData.get("quantity") ?? "").trim();
  const parsed = receiveStockSchema.safeParse({
    code,
    warehouseId,
    locationId,
    reference,
    operatorName,
    notes,
    quantityRaw: qtyRaw,
  });

  if (!parsed.success) {
    redirect(`/inventory/receive?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const quantity = parsed.data.quantityRaw;

  if (referenceFile && referenceFile instanceof File && referenceFile.size > 0) {
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowed.includes(referenceFile.type)) {
      redirect(`/inventory/receive?error=${encodeURIComponent("Archivo no valido (solo PDF o imagen)")}`);
    }
    if (referenceFile.size > 10 * 1024 * 1024) {
      redirect(`/inventory/receive?error=${encodeURIComponent("Archivo excede 10 MB")}`);
    }
  }

  const { product, suggestions } = await resolveProductInput(prisma, code, {
    select: {
      id: true,
      sku: true,
      referenceCode: true,
      name: true,
      brand: true,
      description: true,
      type: true,
      subcategory: true,
      category: { select: { name: true } },
      inventory: { select: { quantity: true, available: true } },
      technicalAttributes: { take: 8, select: { keyNormalized: true, valueNormalized: true } },
    },
  });

  if (!product) {
    const hint = suggestions.length > 0
      ? `Coincidencias: ${suggestions.slice(0, 3).map((row) => row.sku).join(", ")}`
      : "Producto no encontrado (SKU/Referencia)";
    redirect(`/inventory/receive?error=${encodeURIComponent(hint)}`);
  }

  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true } });

  if (warehouseId && !warehouse) {
    redirect(`/inventory/receive?error=${encodeURIComponent("Almacen no encontrado")}`);
  }

  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true, code: true, warehouseId: true } });

  if (locationId && !location) {
    redirect(`/inventory/receive?error=${encodeURIComponent("Ubicación no encontrada")}`);
  }

  if (warehouseId && location && location.warehouseId !== warehouseId) {
    redirect(`/inventory/receive?error=${encodeURIComponent("La ubicación no pertenece al almacén seleccionado")}`);
  }

  if (!location) {
    redirect(`/inventory/receive?error=${encodeURIComponent("Ubicación no encontrada")}`);
  }

  let referenceFileMeta: {
    path: string;
    name: string;
    mime: string;
    size: number;
  } | null = null;

  if (referenceFile && referenceFile instanceof File && referenceFile.size > 0) {
    const mimeMap: Record<string, string> = {
      "application/pdf": ".pdf",
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };

    const uploadDir = path.join(process.cwd(), "public", "uploads", "receipts");
    await fs.mkdir(uploadDir, { recursive: true });

    const rawName = referenceFile.name || "document";
    const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, "_");
    const extFromName = path.extname(safeName);
    const baseName = (extFromName ? safeName.slice(0, -extFromName.length) : safeName) || "document";
    const ext = extFromName || mimeMap[referenceFile.type] || "";
    const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${baseName.slice(0, 40)}${ext}`;
    const filePath = path.join(uploadDir, fileName);
    const bytes = Buffer.from(await referenceFile.arrayBuffer());

    await fs.writeFile(filePath, bytes);

    referenceFileMeta = {
      path: `/uploads/receipts/${fileName}`,
      name: referenceFile.name || fileName,
      mime: referenceFile.type || "application/octet-stream",
      size: referenceFile.size,
    };
  }

  const service = new InventoryService(prisma);
  let createdJobId: string | null = null;

  try {
    createdJobId = await prisma.$transaction(async (tx) => {
      const result = await service.receiveStock(product.id, location.id, quantity, reference, {
        tx,
        notes,
        actor: operatorName,
        operatorName,
        source: "inventory/receive",
        referenceFilePath: referenceFileMeta?.path ?? null,
        referenceFileName: referenceFileMeta?.name ?? null,
        referenceFileMime: referenceFileMeta?.mime ?? null,
        referenceFileSize: referenceFileMeta?.size ?? null,
      });

      if (!result.movementId) {
        throw new Error("Movement ID missing after receive");
      }

      const { job } = await createMovementTraceAndLabelJob(tx, {
        movementId: result.movementId,
        labelType: "RECEIPT",
        sourceEntityType: "INVENTORY_MOVEMENT",
        sourceEntityId: result.movementId,
        operatorName,
      });

      await createAuditLogSafeWithDb({
        entityType: "INVENTORY_MOVEMENT",
        entityId: `${product.id}:${location.id}`,
        action: "RECEIVE_FORM_SUBMIT",
        after: { quantity, reference, warehouseId, locationId },
        source: "inventory/receive",
        actor: operatorName,
      }, tx);

      return job.id;
    }, { timeout: 20000 });
  } catch (error) {
    if (error instanceof InventoryServiceError) {
      redirect(`/inventory/receive?error=${encodeURIComponent("No se pudo registrar la entrada")}`);
    }
    redirect(`/inventory/receive?error=${encodeURIComponent("Ocurrio un error inesperado al registrar la entrada")}`);
  }

  if (!createdJobId) {
    redirect("/inventory/receive?error=No%20se%20pudo%20generar%20etiqueta");
  }
  redirect(`/labels/jobs/${createdJobId}?next=${encodeURIComponent("/inventory/receive?ok=1")}`);
}

export default async function ReceivePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await pageGuard("inventory.receive");
  const sp = await searchParams;
  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      locations: {
        where: { isActive: true },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, warehouseId: true },
      },
    },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Recepción (Entrada)</h1>
          <p className="text-slate-400 mt-1">Suma existencias al inventario y guarda el movimiento.</p>
        </div>
        <Link href="/inventory" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Inventario</Link>
      </div>

      {sp.error && <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>}
      {sp.ok && <div className="glass-card border border-green-500/30 text-green-200">Entrada registrada.</div>}

      <ReceiveForm
        action={receiveStock}
        warehouses={warehouses}
      />
    </div>
  );
}
