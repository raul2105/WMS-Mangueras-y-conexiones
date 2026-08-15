import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { createAuditLogSafe } from "@/lib/audit-log";
import { firstErrorMessage, supplierBrandSchema, supplierUpdateSchema } from "@/lib/schemas/wms";
import { z } from "zod";

async function linkProduct(supplierId: string, formData: FormData) {
  "use server";

  const productId = String(formData.get("productId") ?? "").trim();
  const supplierSku = String(formData.get("supplierSku") ?? "").trim() || null;
  const unitPriceRaw = String(formData.get("unitPrice") ?? "").trim();
  const leadTimeDaysRaw = String(formData.get("leadTimeDays") ?? "").trim();

  const parsed = z.object({
    productId: z.string().min(1, "Producto es obligatorio"),
    unitPrice: z.union([z.literal(""), z.string().transform((v) => Number(v.replace(",", "."))).refine((v) => v >= 0, "Precio inválido")]).optional(),
    leadTimeDays: z.union([z.literal(""), z.string().transform((v) => parseInt(v)).refine((v) => v >= 0, "Días inválido")]).optional(),
  }).safeParse({ productId, unitPrice: unitPriceRaw, leadTimeDays: leadTimeDaysRaw });

  if (!parsed.success) {
    redirect(`/purchasing/suppliers/${supplierId}?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const unitPrice = unitPriceRaw ? Number(unitPriceRaw.replace(",", ".")) : null;
  const leadTimeDays = leadTimeDaysRaw ? parseInt(leadTimeDaysRaw) : null;

  await prisma.supplierProduct.upsert({
    where: { supplierId_productId: { supplierId, productId } },
    create: { supplierId, productId, supplierSku, unitPrice, leadTimeDays },
    update: { supplierSku, unitPrice, leadTimeDays },
  });

  await createAuditLogSafe({
    entityType: "SUPPLIER_PRODUCT",
    entityId: `${supplierId}:${productId}`,
    action: "LINK",
    source: "purchasing/suppliers",
  });

  redirect(`/purchasing/suppliers/${supplierId}?ok=1`);
}

async function unlinkProduct(supplierId: string, formData: FormData) {
  "use server";

  const supplierProductId = String(formData.get("supplierProductId") ?? "").trim();
  if (!supplierProductId) redirect(`/purchasing/suppliers/${supplierId}`);

  await prisma.supplierProduct.delete({ where: { id: supplierProductId } });

  await createAuditLogSafe({
    entityType: "SUPPLIER_PRODUCT",
    entityId: supplierProductId,
    action: "UNLINK",
    source: "purchasing/suppliers",
  });

  redirect(`/purchasing/suppliers/${supplierId}`);
}

async function toggleActive(supplierId: string, formData: FormData) {
  "use server";

  const isActive = formData.get("isActive") === "true";
  await prisma.supplier.update({ where: { id: supplierId }, data: { isActive: !isActive } });
  redirect(`/purchasing/suppliers/${supplierId}`);
}

async function updatePaymentTerms(supplierId: string, formData: FormData) {
  "use server";

  const paymentTerms = String(formData.get("paymentTerms") ?? "").trim() || undefined;
  const parsed = supplierUpdateSchema.safeParse({ paymentTerms });
  if (!parsed.success) {
    redirect(`/purchasing/suppliers/${supplierId}?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  await prisma.supplier.update({
    where: { id: supplierId },
    data: { paymentTerms: parsed.data.paymentTerms ?? null },
  });

  await createAuditLogSafe({
    entityType: "SUPPLIER",
    entityId: supplierId,
    action: "UPDATE",
    after: JSON.stringify({ paymentTerms: parsed.data.paymentTerms ?? null }),
    source: "purchasing/suppliers",
  });

  redirect(`/purchasing/suppliers/${supplierId}?ok=terms`);
}

async function addBrand(supplierId: string, formData: FormData) {
  "use server";

  const name = String(formData.get("brandName") ?? "").trim();
  const parsed = supplierBrandSchema.safeParse({ name });
  if (!parsed.success) {
    redirect(`/purchasing/suppliers/${supplierId}?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  try {
    await prisma.supplierBrand.create({ data: { supplierId, name: parsed.data.name } });
  } catch {
    redirect(`/purchasing/suppliers/${supplierId}?error=${encodeURIComponent("Ya existe una marca con ese nombre para este proveedor")}`);
  }

  await createAuditLogSafe({
    entityType: "SUPPLIER_BRAND",
    entityId: supplierId,
    action: "CREATE",
    after: JSON.stringify({ supplierId, name: parsed.data.name }),
    source: "purchasing/suppliers",
  });

  redirect(`/purchasing/suppliers/${supplierId}?ok=brand`);
}

async function toggleBrand(brandId: string, supplierId: string, formData: FormData) {
  "use server";
  void formData;
  const brand = await prisma.supplierBrand.findUnique({ where: { id: brandId }, select: { isActive: true } });
  if (!brand) redirect(`/purchasing/suppliers/${supplierId}`);
  await prisma.supplierBrand.update({ where: { id: brandId }, data: { isActive: !brand.isActive } });
  redirect(`/purchasing/suppliers/${supplierId}`);
}

async function deleteBrand(brandId: string, supplierId: string, formData: FormData) {
  "use server";
  void formData;
  const usedBy = await prisma.product.count({ where: { supplierBrandId: brandId } });
  if (usedBy > 0) {
    redirect(`/purchasing/suppliers/${supplierId}?error=${encodeURIComponent(`Esta marca está asignada a ${usedBy} artículo(s) y no puede eliminarse`)}`);
  }
  await prisma.supplierBrand.delete({ where: { id: brandId } });
  await createAuditLogSafe({
    entityType: "SUPPLIER_BRAND",
    entityId: brandId,
    action: "DELETE",
    source: "purchasing/suppliers",
  });
  redirect(`/purchasing/suppliers/${supplierId}`);
}

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      legalName: true,
      businessName: true,
      taxId: true,
      email: true,
      phone: true,
      address: true,
      paymentTerms: true,
      isActive: true,
      brands: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, isActive: true },
      },
      products: {
        select: {
          id: true,
          productId: true,
          supplierSku: true,
          unitPrice: true,
          currency: true,
          leadTimeDays: true,
          product: { select: { id: true, sku: true, name: true } },
        },
        orderBy: { product: { sku: "asc" } },
      },
      _count: { select: { purchaseOrders: true } },
    },
  });

  if (!supplier) notFound();

  const allProducts = await prisma.product.findMany({
    select: { id: true, sku: true, name: true },
    orderBy: { sku: "asc" },
  });

  const linkedProductIds = new Set(supplier.products.map((sp) => sp.productId));
  const availableProducts = allProducts.filter((p) => !linkedProductIds.has(p.id));

  const linkProductBound = linkProduct.bind(null, id);
  const unlinkProductBound = unlinkProduct.bind(null, id);
  const toggleActiveBound = toggleActive.bind(null, id);
  const updatePaymentTermsBound = updatePaymentTerms.bind(null, id);
  const addBrandBound = addBrand.bind(null, id);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/purchasing/suppliers" className="btn-secondary">← Proveedores</Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{supplier.businessName ?? supplier.name}</h1>
            {supplier.legalName && supplier.legalName !== (supplier.businessName ?? supplier.name) && (
              <p className="text-sm text-[var(--text-secondary)]">{supplier.legalName}</p>
            )}
            <p className="text-xs text-[var(--text-muted)] font-mono">{supplier.code}</p>
          </div>
        </div>
        <form action={toggleActiveBound}>
          <input type="hidden" name="isActive" value={String(supplier.isActive)} />
          <button
            type="submit"
            className={`text-xs px-3 py-1.5 rounded-lg border ${supplier.isActive ? "border-[var(--status-danger-border)] text-[var(--status-danger-text)] hover:bg-[var(--status-danger-bg)]" : "border-[var(--status-success-border)] text-[var(--status-success-text)] hover:bg-[var(--status-success-bg)]"}`}
          >
            {supplier.isActive ? "Desactivar" : "Activar"}
          </button>
        </form>
      </div>

      {sp.error && <div className="op-panel border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] text-sm">{sp.error}</div>}
      {sp.ok === "1" && <div className="op-panel border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)] text-sm">Producto vinculado correctamente.</div>}
      {sp.ok === "brand" && <div className="op-panel border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)] text-sm">Marca agregada correctamente.</div>}
      {sp.ok === "terms" && <div className="op-panel border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)] text-sm">Términos de pago actualizados correctamente.</div>}

      <div className="op-panel grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><p className="op-label">RFC</p><p className="text-[var(--text-primary)]">{supplier.taxId ?? "—"}</p></div>
        <div><p className="op-label">Email</p><p className="text-[var(--text-primary)]">{supplier.email ?? "—"}</p></div>
        <div><p className="op-label">Teléfono</p><p className="text-[var(--text-primary)]">{supplier.phone ?? "—"}</p></div>
        <div><p className="op-label">OCs registradas</p><p className="text-[var(--text-primary)]">{supplier._count.purchaseOrders}</p></div>
        {supplier.address && (
          <div className="col-span-full">
            <p className="op-label">Dirección</p>
            <p className="text-[var(--text-primary)]">{supplier.address}</p>
          </div>
        )}
      </div>

      <form action={updatePaymentTermsBound} className="op-panel space-y-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Términos de pago</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Este valor se copia a nuevas órdenes de compra y se congela en el documento oficial.</p>
        </div>
        <textarea
          name="paymentTerms"
          rows={3}
          defaultValue={supplier.paymentTerms ?? ""}
          maxLength={500}
          placeholder="Contado, 30 días, transferencia..."
          className="op-field w-full min-h-[96px]"
        />
        <div className="flex justify-end">
          <button type="submit" className="btn-primary text-sm py-2 px-4">Guardar términos</button>
        </div>
      </form>

      <div className="op-panel space-y-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)] border-b border-[var(--border-soft)] pb-2">
          Marcas Registradas
          <span className="text-sm text-[var(--text-muted)] font-normal ml-2">({supplier.brands.length})</span>
        </h2>

        {supplier.brands.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm">Sin marcas registradas. Agrega la primera marca.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-secondary)] border-b border-[var(--border-soft)]">
                  <th className="text-left py-2">Marca</th>
                  <th className="text-left py-2">Estado</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {supplier.brands.map((brand) => {
                  const toggleBrandBound = toggleBrand.bind(null, brand.id, id);
                  const deleteBrandBound = deleteBrand.bind(null, brand.id, id);
                  return (
                    <tr key={brand.id} className="border-b border-[var(--border-soft)] hover:bg-[var(--table-hover)]">
                      <td className="py-2 text-[var(--text-primary)]">{brand.name}</td>
                      <td className="py-2">
                        <span className={brand.isActive ? "op-badge op-badge-success" : "op-badge op-badge-neutral"}>
                          {brand.isActive ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="py-2 text-right flex items-center justify-end gap-3">
                        <form action={toggleBrandBound} className="inline">
                          <button type="submit" className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline">
                            {brand.isActive ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                        <form action={deleteBrandBound} className="inline">
                          <button type="submit" className="text-xs text-[var(--status-danger-text)] hover:underline">Eliminar</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <form action={addBrandBound} className="border-t border-[var(--border-soft)] pt-4 flex items-end gap-3">
          <label className="space-y-1 flex-1">
            <span className="op-label">Nueva marca *</span>
            <input name="brandName" required maxLength={100} placeholder="Continental, Gates, Parker…" className="op-field w-full" />
          </label>
          <button type="submit" className="btn-primary text-sm py-2 px-4">Agregar</button>
        </form>
      </div>

      <div className="op-panel space-y-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)] border-b border-[var(--border-soft)] pb-2">
          Productos Vinculados
          <span className="text-sm text-[var(--text-muted)] font-normal ml-2">({supplier.products.length})</span>
        </h2>

        {supplier.products.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm">Sin productos vinculados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-secondary)] border-b border-[var(--border-soft)]">
                  <th className="text-left py-2">SKU</th>
                  <th className="text-left py-2">Producto</th>
                  <th className="text-left py-2">Clave Proveedor</th>
                  <th className="text-right py-2">Precio unitario</th>
                  <th className="text-right py-2">Lead Time</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {supplier.products.map((sp) => (
                  <tr key={sp.id} className="border-b border-[var(--border-soft)] hover:bg-[var(--table-hover)]">
                    <td className="py-2 font-mono text-[var(--text-accent)] text-xs">{sp.product.sku}</td>
                    <td className="py-2 text-[var(--text-primary)]">{sp.product.name}</td>
                    <td className="py-2 text-[var(--text-secondary)] text-xs">{sp.supplierSku ?? "—"}</td>
                    <td className="py-2 text-right text-[var(--text-primary)]">
                      {sp.unitPrice != null ? `$${sp.unitPrice.toLocaleString("es-MX", { minimumFractionDigits: 2 })} ${sp.currency}` : "—"}
                    </td>
                    <td className="py-2 text-right text-[var(--text-secondary)]">
                      {sp.leadTimeDays != null ? `${sp.leadTimeDays} días` : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <form action={unlinkProductBound} className="inline">
                        <input type="hidden" name="supplierProductId" value={sp.id} />
                        <button type="submit" className="text-xs text-[var(--status-danger-text)] hover:underline">Desvincular</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {availableProducts.length > 0 && (
          <form action={linkProductBound} className="border-t border-[var(--border-soft)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Vincular producto</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="space-y-1 md:col-span-2">
                <span className="op-label">Producto *</span>
                <select name="productId" required className="op-field w-full">
                  <option value="">Seleccionar…</option>
                  {availableProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="op-label">Clave Proveedor</span>
                <input name="supplierSku" maxLength={50} placeholder="ABC-123" className="op-field w-full" />
              </label>
              <label className="space-y-1">
                <span className="op-label">Precio unitario (MXN)</span>
                <input name="unitPrice" type="number" step="0.01" min="0" placeholder="0.00" className="op-field w-full" />
              </label>
              <label className="space-y-1">
                <span className="op-label">Lead Time (días)</span>
                <input name="leadTimeDays" type="number" min="0" placeholder="7" className="op-field w-full" />
              </label>
              <div className="flex items-end">
                <button type="submit" className="btn-primary text-sm py-2 px-4">Vincular</button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
