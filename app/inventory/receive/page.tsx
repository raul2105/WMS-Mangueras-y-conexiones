import prisma from "@/lib/prisma";
import InventoryService, { InventoryServiceError } from "@/lib/inventory-service";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import ReceiveForm from "@/components/ReceiveForm";

export const dynamic = "force-dynamic";

async function receiveStock(formData: FormData) {
  "use server";

  const code = String(formData.get("code") ?? "").trim();
  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const referenceFile = formData.get("referenceFile");
  const qtyRaw = String(formData.get("quantity") ?? "").trim();
  const quantity = qtyRaw ? Number(qtyRaw.replace(",", ".")) : NaN;

  if (!code || !Number.isFinite(quantity) || quantity <= 0) {
    redirect(`/inventory/receive?error=${encodeURIComponent("Datos inválidos (codigo/cantidad)")}`);
  }

  if (!warehouseId || !locationId || !reference) {
    redirect(`/inventory/receive?error=${encodeURIComponent("Faltan campos obligatorios")}`);
  }

  if (referenceFile && referenceFile instanceof File && referenceFile.size > 0) {
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowed.includes(referenceFile.type)) {
      redirect(`/inventory/receive?error=${encodeURIComponent("Archivo no valido (solo PDF o imagen)")}`);
    }
    if (referenceFile.size > 10 * 1024 * 1024) {
      redirect(`/inventory/receive?error=${encodeURIComponent("Archivo excede 10 MB")}`);
    }
  }

  const product = await prisma.product.findFirst({
    where: {
      OR: [{ sku: code }, { referenceCode: code }],
    },
    select: { id: true },
  });

  if (!product) {
    redirect(`/inventory/receive?error=${encodeURIComponent("Producto no encontrado (SKU/Referencia)")}`);
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

  try {
    await service.receiveStock(product.id, location.id, quantity, reference, {
      notes,
      referenceFilePath: referenceFileMeta?.path ?? null,
      referenceFileName: referenceFileMeta?.name ?? null,
      referenceFileMime: referenceFileMeta?.mime ?? null,
      referenceFileSize: referenceFileMeta?.size ?? null,
    });
  } catch (error) {
    if (error instanceof InventoryServiceError) {
      redirect(`/inventory/receive?error=${encodeURIComponent("No se pudo registrar la entrada")}`);
    }
    throw error;
  }

  redirect(`/inventory/receive?ok=1`);
}

export default async function ReceivePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
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

      <ReceiveForm action={receiveStock} warehouses={warehouses} />
    </div>
  );
}
