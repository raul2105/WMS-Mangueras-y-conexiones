"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/button";
import { getPurchaseUnitPolicy, quantityValidationMessage } from "@/lib/quantity-policy";

type Option = {
  id: string;
  code: string;
  name: string;
};

type ProductOption = Option & {
  type: string;
  unitLabel: string;
  purchaseUnitLabel: string | null;
  purchaseUnitFactor: number;
  attributes: string | null;
};

type WarehouseOption = Option & {
  address: string | null;
};

type DraftLine = {
  productId: string;
  qtyOrdered: number;
  unitPrice: number | null;
};

export function PurchaseOrderCreateForm({
  action,
  suppliers,
  warehouses,
  products,
}: {
  action: (formData: FormData) => void;
  suppliers: Option[];
  warehouses: WarehouseOption[];
  products: ProductOption[];
}) {
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [lineError, setLineError] = useState<string | null>(null);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const estimatedTotal = lines.reduce(
    (sum, line) => sum + (line.unitPrice ?? 0) * line.qtyOrdered,
    0,
  );

  function addLine() {
    const parsedQuantity = Number(quantity.replace(",", "."));
    const parsedPrice = unitPrice.trim() === "" ? null : Number(unitPrice);

    if (!productId) {
      setLineError("Selecciona un producto.");
      return;
    }
    const product = productById.get(productId);
    const quantityError = product ? quantityValidationMessage(parsedQuantity, getPurchaseUnitPolicy(product)) : null;
    if (quantityError) {
      setLineError(quantityError);
      return;
    }
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setLineError("El precio debe ser cero o mayor.");
      return;
    }
    if (lines.some((line) => line.productId === productId)) {
      setLineError("Ese producto ya está en la orden. Modifica su línea o elimínala antes de agregarlo otra vez.");
      return;
    }

    setLines((current) => [...current, { productId, qtyOrdered: parsedQuantity, unitPrice: parsedPrice }]);
    setProductId("");
    setQuantity("1");
    setUnitPrice("");
    setLineError(null);
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />

      <section className="surface space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Datos de compra</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Selecciona quién surtirá la mercancía y dónde se recibirá.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-primary)]">Proveedor *</span>
            <select name="supplierId" required className="field h-10 w-full">
              <option value="">Seleccionar proveedor…</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} — {supplier.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-primary)]">Almacén destino *</span>
            <select name="deliveryWarehouseId" required className="field h-10 w-full">
              <option value="">Seleccionar almacén…</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} — {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-primary)]">Fecha esperada de entrega</span>
            <input name="expectedDate" type="date" min={new Date().toISOString().slice(0, 10)} className="field h-10 w-full" />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-primary)]">Notas para la compra</span>
            <textarea
              name="notes"
              rows={3}
              maxLength={1000}
              placeholder="Condiciones, referencia o indicaciones para el proveedor"
              className="field min-h-24 w-full resize-y"
            />
          </label>
        </div>
      </section>

      <section className="surface space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Productos de la orden</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Agrega todos los productos antes de crear la orden.</p>
          </div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">{lines.length} {lines.length === 1 ? "línea" : "líneas"}</p>
        </div>

        <div className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4 md:grid-cols-[minmax(0,1fr)_8rem_10rem_auto] md:items-end">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-primary)]">Producto</span>
            <select value={productId} onChange={(event) => setProductId(event.target.value)} className="field h-10 w-full">
              <option value="">Seleccionar producto…</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.code} — {product.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-primary)]">Cantidad</span>
            <input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="0.01" step="0.01" inputMode="decimal" className="field h-10 w-full text-right" />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-primary)]">Precio unitario</span>
            <input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} type="number" min="0" step="0.01" inputMode="decimal" placeholder="Opcional" className="field h-10 w-full text-right" />
          </label>
          <Button type="button" variant="secondary" onClick={addLine}>Agregar</Button>
        </div>

        {lineError ? <p role="alert" className="text-sm text-[var(--danger)]">{lineError}</p> : null}

        {lines.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] px-4 py-8 text-center">
            <p className="font-medium text-[var(--text-primary)]">Aún no hay productos</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">La orden no se podrá crear hasta que agregues al menos uno.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {lines.map((line, index) => {
              const product = productById.get(line.productId);
              return (
                <article key={line.productId} className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border-default)] p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-[var(--text-accent)]">{product?.code}</p>
                    <p className="truncate font-medium text-[var(--text-primary)]">{product?.name}</p>
                  </div>
                  <label className="flex items-center justify-between gap-2 text-sm sm:block">
                    <span className="text-[var(--text-muted)]">Cantidad</span>
                    <input
                      aria-label={`Cantidad de ${product?.name ?? "producto"}`}
                      type="number"
                      min="1"
                      value={line.qtyOrdered}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        const itemProduct = productById.get(line.productId);
                        const isValid = itemProduct && !quantityValidationMessage(value, getPurchaseUnitPolicy(itemProduct));
                        setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, qtyOrdered: isValid ? value : item.qtyOrdered } : item));
                      }}
                      className="field h-10 w-24 text-right"
                    />
                  </label>
                  <p className="text-sm text-[var(--text-secondary)] sm:text-right">
                    <span className="block text-xs text-[var(--text-muted)]">Subtotal estimado</span>
                    {line.unitPrice === null ? "Precio pendiente" : line.unitPrice.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
                  </p>
                  <button
                    type="button"
                    onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    className={buttonStyles({ variant: "ghost", size: "sm" })}
                  >
                    Quitar
                  </button>
                </article>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-[var(--border-soft)] pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[var(--text-secondary)]">Total estimado: <strong className="text-[var(--text-primary)]">{estimatedTotal.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}</strong></p>
          <p className="text-[var(--text-muted)]">Los precios vacíos podrán completarse en el borrador.</p>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/purchasing/orders" className={buttonStyles({ variant: "secondary" })}>Cancelar</Link>
        <Button type="submit" disabled={suppliers.length === 0 || warehouses.length === 0 || lines.length === 0}>
          Crear orden de compra
        </Button>
      </div>
    </form>
  );
}
