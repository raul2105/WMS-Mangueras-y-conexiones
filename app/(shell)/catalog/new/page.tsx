import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pageGuard } from "@/components/rbac/PageGuard";
import { newCatalogInventorySchema } from "@/lib/schemas/wms";
import { createAuditLogSafe } from "@/lib/audit-log";
import { syncProductTechnicalAttributes } from "@/lib/product-attributes";
import { TAXONOMY, UNIT_LABELS } from "@/lib/catalog-taxonomy";
import { ProductSupplierBrandSelect } from "../_components/ProductSupplierBrandSelect";
import { CategorySubcategorySelect } from "../_components/CategorySubcategorySelect";
import { saveProductImage } from "@/lib/product-images";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const dynamic = "force-dynamic";

async function createProduct(formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("catalog.edit");

  const sku = String(formData.get("sku") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim().toUpperCase();

  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const unitLabelRaw = String(formData.get("unitLabel") ?? "").trim();
  const referenceCodeRaw = String(formData.get("referenceCode") ?? "").trim();
  const imageUrlRaw = String(formData.get("imageUrl") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const subcategoryRaw = String(formData.get("subcategory") ?? "").trim();
  const primarySupplierIdRaw = String(formData.get("primarySupplierId") ?? "").trim();
  const supplierBrandIdRaw = String(formData.get("supplierBrandId") ?? "").trim();
  const baseCostRaw = String(formData.get("base_cost") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const locationRaw = String(formData.get("location") ?? "").trim();
  const attributesRaw = String(formData.get("attributes") ?? "").trim();
  const imageFile = formData.get("imageFile");

  if (!sku || !name) {
    // Minimal validation; show error by redirecting with query could be added later.
    return;
  }

  const allowedTypes = new Set(["HOSE", "FITTING", "ASSEMBLY", "ACCESSORY"]);
  const normalizedType = allowedTypes.has(type) ? type : "ACCESSORY";

  const base_cost = baseCostRaw ? Number(baseCostRaw.replace(",", ".")) : null;
  const price = priceRaw ? Number(priceRaw.replace(",", ".")) : null;
  const inventoryParsed = newCatalogInventorySchema.safeParse({
    locationCode: locationRaw,
    quantityRaw,
  });

  if (!inventoryParsed.success) {
    redirect(`/catalog/new?error=${encodeURIComponent("Datos de inventario invalidos")}`);
  }

  const quantity = inventoryParsed.data.quantityRaw
    ? Number(inventoryParsed.data.quantityRaw.replace(",", "."))
    : 0;

  const attributes = attributesRaw ? attributesRaw : null;

  let imageUrl = imageUrlRaw || null;
  if (imageFile instanceof File && imageFile.size > 0) {
    try {
      imageUrl = await saveProductImage(imageFile, sku);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la imagen";
      redirect(`/catalog/new?error=${encodeURIComponent(message)}`);
    }
  }

  let category: { id: string } | null = null;
  if (categoryRaw) {
    const existing = await prisma.category.findFirst({ where: { name: categoryRaw }, select: { id: true } });
    if (existing) {
      category = existing;
    } else {
      try {
        category = await prisma.category.create({ data: { name: categoryRaw }, select: { id: true } });
      } catch {
        // If a concurrent request created it, fetch it.
        category = await prisma.category.findFirst({ where: { name: categoryRaw }, select: { id: true } });
      }
    }
  }

  // Resolve brand snapshot from SupplierBrand
  let brandRaw: string | null = null;
  let primarySupplierId: string | null = null;
  let supplierBrandId: string | null = null;
  if (supplierBrandIdRaw) {
    const sb = await prisma.supplierBrand.findUnique({
      where: { id: supplierBrandIdRaw },
      select: { id: true, name: true, supplierId: true },
    });
    if (sb && (!primarySupplierIdRaw || sb.supplierId === primarySupplierIdRaw)) {
      brandRaw = sb.name;
      supplierBrandId = sb.id;
      primarySupplierId = sb.supplierId;
    }
  } else if (primarySupplierIdRaw) {
    primarySupplierId = primarySupplierIdRaw;
  }

  const product = await prisma.product.upsert({
    where: { sku },
    create: {
      sku,
      referenceCode: referenceCodeRaw || null,
      imageUrl,
      name,
      type: normalizedType,
      unitLabel: unitLabelRaw || "unidad",
      description: descriptionRaw || null,
      brand: brandRaw,
      subcategory: subcategoryRaw || null,
      base_cost: Number.isFinite(base_cost) ? base_cost : null,
      price: Number.isFinite(price) ? price : null,
      attributes,
      categoryId: category?.id ?? null,
      primarySupplierId,
      supplierBrandId,
    },
    update: {
      name,
      type: normalizedType,
      unitLabel: unitLabelRaw || "unidad",
      description: descriptionRaw || null,
      brand: brandRaw,
      referenceCode: referenceCodeRaw || null,
      imageUrl,
      subcategory: subcategoryRaw || null,
      base_cost: Number.isFinite(base_cost) ? base_cost : null,
      price: Number.isFinite(price) ? price : null,
      attributes,
      categoryId: category?.id ?? null,
      primarySupplierId,
      supplierBrandId,
    },
    select: { id: true },
  });

  await syncProductTechnicalAttributes(prisma, product.id, attributes);

  // KAN-10: only create initial inventory when quantity > 0 and location is valid.
  const location = inventoryParsed.data.locationCode
    ? await prisma.location.findUnique({ where: { code: locationRaw }, select: { id: true } })
    : null;

  if (quantity > 0 && !location) {
    redirect(`/catalog/new?error=${encodeURIComponent("Ubicacion valida obligatoria para cantidad inicial mayor a 0")}`);
  }

  if (location && quantity > 0) {
    await prisma.inventory.deleteMany({ where: { productId: product.id } });
    await prisma.inventory.create({
      data: {
        productId: product.id,
        locationId: location.id,
        quantity,
        reserved: 0,
        available: quantity,
      },
    });
  }

  await createAuditLogSafe({
    entityType: "PRODUCT",
    entityId: product.id,
    action: "UPSERT_PRODUCT",
    after: {
      sku,
      quantity,
      locationCode: locationRaw || null,
    },
    source: "catalog/new",
  });

  const { emitSyncEventSafe } = await import("@/lib/sync/sync-events");
  await emitSyncEventSafe({
    entityType: "PRODUCT",
    entityId: product.id,
    action: "CREATE",
    payload: { productId: product.id, sku, name, type: normalizedType, brand: brandRaw, price },
  });

  redirect("/catalog");
}

export default async function NewCatalogItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("catalog.edit");
  const sp = await searchParams;
  const [locations, suppliers, recentProducts] = await Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: [{ warehouse: { code: "asc" } }, { code: "asc" }],
      select: {
        code: true,
        name: true,
        warehouse: { select: { code: true } },
      },
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
    prisma.product.findMany({
      orderBy: { updatedAt: "desc" },
      select: { sku: true, referenceCode: true },
      take: 250,
    }),
  ]);
  const skuSuggestions = Array.from(
    new Set(recentProducts.map((row) => row.sku.trim()).filter(Boolean))
  );
  const referenceCodeSuggestions = Array.from(
    new Set(recentProducts.map((row) => row.referenceCode?.trim() ?? "").filter(Boolean))
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Nuevo Articulo"
        description="Crea un producto y su inventario inicial."
        actions={
          <Link href="/catalog" className={buttonStyles({ variant: "secondary" })}>
            Volver
          </Link>
        }
      />

      {sp.error && (
        <section className="surface border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{sp.error}</section>
      )}

      <form action={createProduct}>
        <SectionCard
          title="Ficha de producto"
          description="Completa los datos comerciales y el inventario inicial."
          footer={
            <>
              <Link href="/catalog" className={buttonStyles({ variant: "secondary" })}>
                Cancelar
              </Link>
              <Button type="submit">Guardar</Button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              name="sku"
              required
              label="SKU"
              list={skuSuggestions.length > 0 ? "catalog-sku-options" : undefined}
              placeholder="CON-R1AT-04"
            />
            {skuSuggestions.length > 0 ? (
              <datalist id="catalog-sku-options">
                {skuSuggestions.map((sku) => (
                  <option key={sku} value={sku} />
                ))}
              </datalist>
            ) : null}

            <Select name="type" label="Tipo" required defaultValue="HOSE">
              <option value="HOSE">HOSE</option>
              <option value="FITTING">FITTING</option>
              <option value="ASSEMBLY">ASSEMBLY</option>
              <option value="ACCESSORY">ACCESSORY</option>
            </Select>

            <Input name="name" required label="Nombre" rootClassName="md:col-span-2" placeholder="Manguera Hidraulica..." />

            <Textarea name="description" label="Descripcion" rootClassName="md:col-span-2" />

            <ProductSupplierBrandSelect suppliers={suppliers} />

            <Select name="unitLabel" label="Unidad" defaultValue="unidad">
              {UNIT_LABELS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </Select>

            <Input
              name="referenceCode"
              label="Referencia"
              list={referenceCodeSuggestions.length > 0 ? "catalog-reference-options" : undefined}
              placeholder="REF-000123"
              inputClassName="font-mono"
            />
            {referenceCodeSuggestions.length > 0 ? (
              <datalist id="catalog-reference-options">
                {referenceCodeSuggestions.map((referenceCode) => (
                  <option key={referenceCode} value={referenceCode} />
                ))}
              </datalist>
            ) : null}

            <Input
              name="imageUrl"
              label="Imagen URL"
              rootClassName="md:col-span-2"
              placeholder="https://..."
              hint="Tambien puedes subir una imagen local; si haces ambas cosas, se usa el archivo."
            />

            <label className="space-y-1.5 md:col-span-2">
              <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Imagen archivo</span>
              <input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" className="field px-4 py-2.5" />
            </label>

            <CategorySubcategorySelect taxonomy={TAXONOMY} />

            <Input name="base_cost" label="Costo base" inputMode="decimal" placeholder="45.50" />
            <Input name="price" label="Precio" inputMode="decimal" placeholder="85.00" />

            <Input name="quantity" label="Cantidad inicial" inputMode="decimal" placeholder="0" />

            <Select
              name="location"
              label="Ubicacion"
              placeholder="Sin inventario inicial"
              hint="Requerido si capturas cantidad inicial mayor a 0."
            >
              {locations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.code} - {location.name} ({location.warehouse.code})
                </option>
              ))}
            </Select>

            <Textarea
              name="attributes"
              label="Attributes (JSON)"
              rootClassName="md:col-span-2"
              textareaClassName="font-mono text-sm"
              placeholder='{"pressure_psi": 3263, "inner_diameter": "1/4"}'
              hint="Se guarda como texto (puede ser JSON)."
            />
          </div>
        </SectionCard>
      </form>
    </div>
  );
}
