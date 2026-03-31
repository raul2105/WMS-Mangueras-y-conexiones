import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { newCatalogInventorySchema } from "@/lib/schemas/wms";
import { createAuditLogSafe } from "@/lib/audit-log";
import { syncProductTechnicalAttributes } from "@/lib/product-attributes";
import { TAXONOMY_CATEGORIES, TAXONOMY_SUBCATEGORIES } from "@/lib/catalog-taxonomy";
import { saveProductImage } from "@/lib/product-images";

export const dynamic = "force-dynamic";

async function createProduct(formData: FormData) {
  "use server";

  const sku = String(formData.get("sku") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim().toUpperCase();

  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const brandRaw = String(formData.get("brand") ?? "").trim();
  const referenceCodeRaw = String(formData.get("referenceCode") ?? "").trim();
  const imageUrlRaw = String(formData.get("imageUrl") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const subcategoryRaw = String(formData.get("subcategory") ?? "").trim();
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

  const product = await prisma.product.upsert({
    where: { sku },
    create: {
      sku,
      referenceCode: referenceCodeRaw || null,
      imageUrl,
      name,
      type: normalizedType,
      description: descriptionRaw || null,
      brand: brandRaw || null,
      subcategory: subcategoryRaw || null,
      base_cost: Number.isFinite(base_cost) ? base_cost : null,
      price: Number.isFinite(price) ? price : null,
      attributes,
      ...(category ? { category: { connect: { id: category.id } } } : {}),
    },
    update: {
      name,
      type: normalizedType,
      description: descriptionRaw || null,
      brand: brandRaw || null,
      referenceCode: referenceCodeRaw || null,
      imageUrl,
      subcategory: subcategoryRaw || null,
      base_cost: Number.isFinite(base_cost) ? base_cost : null,
      price: Number.isFinite(price) ? price : null,
      attributes,
      ...(category ? { category: { connect: { id: category.id } } } : { categoryId: null }),
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

  redirect("/catalog");
}

export default async function NewCatalogItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const [locations, categories, brands, recentProducts] = await Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: [{ warehouse: { code: "asc" } }, { code: "asc" }],
      select: {
        code: true,
        name: true,
        warehouse: { select: { code: true } },
      },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    prisma.product.findMany({
      where: { brand: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { brand: true },
      take: 300,
    }),
    prisma.product.findMany({
      orderBy: { updatedAt: "desc" },
      select: { sku: true, referenceCode: true },
      take: 250,
    }),
  ]);
  const brandSuggestions = Array.from(
    new Set(brands.map((row) => row.brand?.trim() ?? "").filter(Boolean))
  );
  const categorySuggestions = Array.from(
    new Set([...categories.map((row) => row.name), ...TAXONOMY_CATEGORIES])
  ).sort((a, b) => a.localeCompare(b, "es"));
  const skuSuggestions = Array.from(
    new Set(recentProducts.map((row) => row.sku.trim()).filter(Boolean))
  );
  const referenceCodeSuggestions = Array.from(
    new Set(recentProducts.map((row) => row.referenceCode?.trim() ?? "").filter(Boolean))
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Nuevo Artículo</h1>
          <p className="text-slate-400 mt-1">Crea un producto y su inventario inicial.</p>
        </div>
        <Link href="/catalog" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          ← Volver
        </Link>
      </div>

      {sp.error && (
        <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>
      )}

      <form action={createProduct} className="glass-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-400">SKU *</span>
            <input
              name="sku"
              required
              list={skuSuggestions.length > 0 ? "catalog-sku-options" : undefined}
              className="w-full px-4 py-3 glass rounded-lg"
              placeholder="CON-R1AT-04"
            />
            {skuSuggestions.length > 0 && (
              <datalist id="catalog-sku-options">
                {skuSuggestions.map((sku) => (
                  <option key={sku} value={sku} />
                ))}
              </datalist>
            )}
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Tipo *</span>
            <select name="type" className="w-full px-4 py-3 glass rounded-lg">
              <option value="HOSE">HOSE</option>
              <option value="FITTING">FITTING</option>
              <option value="ASSEMBLY">ASSEMBLY</option>
              <option value="ACCESSORY">ACCESSORY</option>
            </select>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Nombre *</span>
            <input name="name" required className="w-full px-4 py-3 glass rounded-lg" placeholder="Manguera Hidráulica..." />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Descripción</span>
            <textarea name="description" className="w-full px-4 py-3 glass rounded-lg min-h-[96px]" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Marca</span>
            <input
              name="brand"
              list={brandSuggestions.length > 0 ? "catalog-brand-options" : undefined}
              className="w-full px-4 py-3 glass rounded-lg"
              placeholder="Continental"
            />
            {brandSuggestions.length > 0 && (
              <datalist id="catalog-brand-options">
                {brandSuggestions.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
            )}
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Referencia (para escaneo/OCR)</span>
            <input
              name="referenceCode"
              list={referenceCodeSuggestions.length > 0 ? "catalog-reference-options" : undefined}
              className="w-full px-4 py-3 glass rounded-lg font-mono"
              placeholder="REF-000123"
            />
            {referenceCodeSuggestions.length > 0 && (
              <datalist id="catalog-reference-options">
                {referenceCodeSuggestions.map((referenceCode) => (
                  <option key={referenceCode} value={referenceCode} />
                ))}
              </datalist>
            )}
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Imagen (URL)</span>
            <input name="imageUrl" className="w-full px-4 py-3 glass rounded-lg" placeholder="https://..." />
            <p className="text-xs text-slate-500">Tambien puedes subir una imagen local; si haces ambas cosas, se usa el archivo.</p>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Imagen (archivo)</span>
            <input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" className="w-full px-4 py-3 glass rounded-lg" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Categoría</span>
            <input
              name="category"
              list="catalog-category-options"
              className="w-full px-4 py-3 glass rounded-lg"
              placeholder="Mangueras Hidráulicas SAE/EN"
            />
            <datalist id="catalog-category-options">
              {categorySuggestions.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Subcategoría</span>
            <input
              name="subcategory"
              list="catalog-subcategory-options"
              className="w-full px-4 py-3 glass rounded-lg"
              placeholder="SAE 100R2 / 2SN"
            />
            <datalist id="catalog-subcategory-options">
              {TAXONOMY_SUBCATEGORIES.map((subcategory) => (
                <option key={subcategory} value={subcategory} />
              ))}
            </datalist>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Costo base</span>
            <input name="base_cost" inputMode="decimal" className="w-full px-4 py-3 glass rounded-lg" placeholder="45.50" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Precio</span>
            <input name="price" inputMode="decimal" className="w-full px-4 py-3 glass rounded-lg" placeholder="85.00" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Cantidad inicial</span>
            <input name="quantity" inputMode="decimal" className="w-full px-4 py-3 glass rounded-lg" placeholder="0" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Ubicación</span>
            <select name="location" className="w-full px-4 py-3 glass rounded-lg">
              <option value="">Sin inventario inicial</option>
              {locations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.code} - {location.name} ({location.warehouse.code})
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">Requerido si capturas cantidad inicial mayor a 0.</p>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Attributes (JSON)</span>
            <textarea
              name="attributes"
              className="w-full px-4 py-3 glass rounded-lg min-h-[96px] font-mono text-sm"
              placeholder='{"pressure_psi": 3263, "inner_diameter": "1/4"}'
            />
            <p className="text-xs text-slate-500">Se guarda como texto (puede ser JSON).</p>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href="/catalog" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Cancelar
          </Link>
          <button type="submit" className="btn-primary">
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
