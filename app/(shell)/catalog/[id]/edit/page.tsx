import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { pageGuard } from "@/components/rbac/PageGuard";
import { createAuditLogSafe } from "@/lib/audit-log";
import { syncProductTechnicalAttributes } from "@/lib/product-attributes";
import { TAXONOMY, UNIT_LABELS } from "@/lib/catalog-taxonomy";
import { ProductSupplierBrandSelect } from "../../_components/ProductSupplierBrandSelect";
import { CategorySubcategorySelect } from "../../_components/CategorySubcategorySelect";
import { saveProductImage } from "@/lib/product-images";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}

async function updateProduct(id: string, formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("catalog.edit");

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim().toUpperCase();
  const description = String(formData.get("description") ?? "").trim() || null;
  const unitLabel = String(formData.get("unitLabel") ?? "").trim() || "unidad";
  const referenceCode = String(formData.get("referenceCode") ?? "").trim() || null;
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const subcategory = String(formData.get("subcategory") ?? "").trim() || null;
  const primarySupplierIdRaw = String(formData.get("primarySupplierId") ?? "").trim();
  const supplierBrandIdRaw = String(formData.get("supplierBrandId") ?? "").trim();
  const baseCostRaw = String(formData.get("base_cost") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const attributesRaw = String(formData.get("attributes") ?? "").trim() || null;
  const imageFile = formData.get("imageFile");

  if (!name) {
    redirect(`/catalog/${id}/edit?error=${encodeURIComponent("El nombre es obligatorio")}`);
  }

  const allowedTypes = new Set(["HOSE", "FITTING", "ASSEMBLY", "ACCESSORY"]);
  const normalizedType = allowedTypes.has(type) ? type : null;
  if (!normalizedType) {
    redirect(`/catalog/${id}/edit?error=${encodeURIComponent("Tipo de producto inválido")}`);
  }

  const base_cost = baseCostRaw ? Number(baseCostRaw.replace(",", ".")) : null;
  const price = priceRaw ? Number(priceRaw.replace(",", ".")) : null;

  // Resolve brand snapshot from SupplierBrand
  let brand: string | null = null;
  let primarySupplierId: string | null = null;
  let supplierBrandId: string | null = null;
  if (supplierBrandIdRaw) {
    const sb = await prisma.supplierBrand.findUnique({
      where: { id: supplierBrandIdRaw },
      select: { id: true, name: true, supplierId: true },
    });
    if (sb && (!primarySupplierIdRaw || sb.supplierId === primarySupplierIdRaw)) {
      brand = sb.name;
      supplierBrandId = sb.id;
      primarySupplierId = sb.supplierId;
    }
  } else if (primarySupplierIdRaw) {
    primarySupplierId = primarySupplierIdRaw;
  }

  const currentProduct = await prisma.product.findUnique({
    where: { id },
    select: { sku: true, name: true, type: true, brand: true },
  });

  if (!currentProduct) {
    notFound();
  }

  let resolvedImageUrl = imageUrl;
  if (imageFile instanceof File && imageFile.size > 0) {
    try {
      resolvedImageUrl = await saveProductImage(imageFile, currentProduct.sku);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la imagen";
      redirect(`/catalog/${id}/edit?error=${encodeURIComponent(message)}`);
    }
  }

  let categoryId: string | null = null;
  if (categoryRaw) {
    const existing = await prisma.category.findFirst({ where: { name: categoryRaw }, select: { id: true } });
    if (existing) {
      categoryId = existing.id;
    } else {
      try {
        const created = await prisma.category.create({ data: { name: categoryRaw }, select: { id: true } });
        categoryId = created.id;
      } catch {
        // ignore race condition on category creation
      }
    }
  }

  const before = currentProduct;

  await prisma.product.update({
    where: { id },
    data: {
      name,
      type: normalizedType,
      description,
      brand,
      unitLabel,
      referenceCode: referenceCode || null,
      imageUrl: resolvedImageUrl || null,
      subcategory,
      base_cost: Number.isFinite(base_cost ?? NaN) ? base_cost : null,
      price: Number.isFinite(price ?? NaN) ? price : null,
      attributes: attributesRaw,
      categoryId: categoryId ?? null,
      primarySupplierId,
      supplierBrandId,
    },
  });

  await syncProductTechnicalAttributes(prisma, id, attributesRaw);

  await createAuditLogSafe({
    entityType: "PRODUCT",
    entityId: id,
    action: "UPDATE_PRODUCT",
    before,
    after: { name, type: normalizedType, brand, unitLabel, primarySupplierId, supplierBrandId },
    source: "catalog/edit",
    actor: "system",
  });

  const { emitSyncEventSafe } = await import("@/lib/sync/sync-events");
  await emitSyncEventSafe({
    entityType: "PRODUCT",
    entityId: id,
    action: "UPDATE",
    payload: { productId: id, sku: currentProduct.sku, name, type: normalizedType, brand },
  });

  redirect(`/catalog/${id}`);
}

export default async function ProductEditPage({ params, searchParams }: PageProps) {
  await pageGuard("catalog.edit");
  const { id } = await params;
  const sp = await searchParams;

  const [product, suppliers] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: { category: true },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        businessName: true,
        brands: {
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
  ]);

  if (!product) notFound();

  const updateProductWithId = updateProduct.bind(null, id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
            <Link href="/catalog" className="hover:text-white">Catálogo</Link>
            <span>/</span>
            <Link href={`/catalog/${id}`} className="hover:text-white">{product.name}</Link>
            <span>/</span>
            <span className="text-white">Editar</span>
          </div>
          <h1 className="text-3xl font-bold">Editar Producto</h1>
        </div>
        <Link href={`/catalog/${id}`} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Detalle</Link>
      </div>

      {sp.error && <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>}

      <form action={updateProductWithId} className="glass-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-400">SKU</span>
            <input value={product.sku} disabled className="w-full px-4 py-3 glass rounded-lg opacity-60 cursor-not-allowed font-mono" />
            <p className="text-xs text-slate-500">El SKU no se puede modificar.</p>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Tipo *</span>
            <select name="type" required defaultValue={product.type} className="w-full px-4 py-3 glass rounded-lg">
              <option value="HOSE">Manguera</option>
              <option value="FITTING">Conexión</option>
              <option value="ASSEMBLY">Ensamble</option>
              <option value="ACCESSORY">Accesorio</option>
            </select>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Nombre *</span>
            <input name="name" required defaultValue={product.name} className="w-full px-4 py-3 glass rounded-lg" />
          </label>

          <ProductSupplierBrandSelect
            suppliers={suppliers}
            defaultSupplierId={(product as { primarySupplierId?: string | null }).primarySupplierId}
            defaultBrandId={(product as { supplierBrandId?: string | null }).supplierBrandId}
          />

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Unidad</span>
            <select name="unitLabel" defaultValue={product.unitLabel ?? "unidad"} className="w-full px-4 py-3 glass rounded-lg">
              {UNIT_LABELS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Código de referencia</span>
            <input name="referenceCode" defaultValue={product.referenceCode ?? ""} className="w-full px-4 py-3 glass rounded-lg font-mono" />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Descripción</span>
            <textarea name="description" rows={3} defaultValue={product.description ?? ""} className="w-full px-4 py-3 glass rounded-lg" />
          </label>

          <CategorySubcategorySelect
            taxonomy={TAXONOMY}
            defaultCategory={product.category?.name ?? ""}
            defaultSubcategory={product.subcategory ?? ""}
          />

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">URL de imagen</span>
            <input name="imageUrl" defaultValue={product.imageUrl ?? ""} className="w-full px-4 py-3 glass rounded-lg" placeholder="https://..." />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Imagen (archivo)</span>
            <input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" className="w-full px-4 py-3 glass rounded-lg" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Costo base</span>
            <input name="base_cost" inputMode="decimal" defaultValue={product.base_cost ?? ""} className="w-full px-4 py-3 glass rounded-lg" placeholder="0.00" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Precio de lista</span>
            <input name="price" inputMode="decimal" defaultValue={product.price ?? ""} className="w-full px-4 py-3 glass rounded-lg" placeholder="0.00" />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Atributos técnicos (JSON)</span>
            <textarea name="attributes" rows={3} defaultValue={product.attributes ?? ""} className="w-full px-4 py-3 glass rounded-lg font-mono text-sm" placeholder='{"presion_psi": 3000, "material": "acero"}' />
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href={`/catalog/${id}`} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">Cancelar</Link>
          <button type="submit" className="btn-primary">Guardar cambios</button>
        </div>
      </form>
    </div>
  );
}
