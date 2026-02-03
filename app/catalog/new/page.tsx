import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";

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
  const baseCostRaw = String(formData.get("base_cost") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const locationRaw = String(formData.get("location") ?? "").trim();
  const attributesRaw = String(formData.get("attributes") ?? "").trim();

  if (!sku || !name) {
    // Minimal validation; show error by redirecting with query could be added later.
    return;
  }

  const allowedTypes = new Set(["HOSE", "FITTING", "ASSEMBLY", "ACCESSORY"]);
  const normalizedType = allowedTypes.has(type) ? type : "ACCESSORY";

  const base_cost = baseCostRaw ? Number(baseCostRaw.replace(",", ".")) : null;
  const price = priceRaw ? Number(priceRaw.replace(",", ".")) : null;
  const quantity = quantityRaw ? Number(quantityRaw.replace(",", ".")) : 0;

  const attributes = attributesRaw ? attributesRaw : null;

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
      imageUrl: imageUrlRaw || null,
      name,
      type: normalizedType,
      description: descriptionRaw || null,
      brand: brandRaw || null,
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
      imageUrl: imageUrlRaw || null,
      base_cost: Number.isFinite(base_cost) ? base_cost : null,
      price: Number.isFinite(price) ? price : null,
      attributes,
      ...(category ? { category: { connect: { id: category.id } } } : { categoryId: null }),
    },
    select: { id: true },
  });

  // Handle inventory creation with location
  const location = locationRaw
    ? await prisma.location.findUnique({ where: { code: locationRaw }, select: { id: true } })
    : null;

  await prisma.inventory.deleteMany({ where: { productId: product.id } });
  await prisma.inventory.create({
    data: {
      productId: product.id,
      locationId: location?.id ?? null,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      reserved: 0,
      available: Number.isFinite(quantity) ? quantity : 0,
    },
  });

  redirect("/catalog");
}

export default async function NewCatalogItemPage() {
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

      <form action={createProduct} className="glass-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-400">SKU *</span>
            <input name="sku" required className="w-full px-4 py-3 glass rounded-lg" placeholder="CON-R1AT-04" />
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
            <input name="brand" className="w-full px-4 py-3 glass rounded-lg" placeholder="Continental" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Referencia (para escaneo/OCR)</span>
            <input name="referenceCode" className="w-full px-4 py-3 glass rounded-lg font-mono" placeholder="REF-000123" />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Imagen (URL)</span>
            <input name="imageUrl" className="w-full px-4 py-3 glass rounded-lg" placeholder="https://..." />
            <p className="text-xs text-slate-500">Sirve como referencia visual. (Más adelante podemos soportar carga de imagen.)</p>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Categoría</span>
            <input name="category" className="w-full px-4 py-3 glass rounded-lg" placeholder="Hidráulica" />
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
            <input name="location" className="w-full px-4 py-3 glass rounded-lg" placeholder="A-12-04" />
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
