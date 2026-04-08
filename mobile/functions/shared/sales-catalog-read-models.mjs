import { normalizeText } from "./request-validators.mjs";

export function normalizeCatalogItem(item) {
  const inventory = Array.isArray(item?.inventory)
    ? item.inventory.map((row) => ({
        warehouseCode: String(row?.warehouseCode || "WH-MAIN"),
        quantity: Number(row?.quantity ?? 0),
        reserved: Number(row?.reserved ?? 0),
        available: Number(row?.available ?? 0),
      }))
    : [];

  const totalStock = inventory.reduce((acc, row) => acc + row.quantity, 0);

  return {
    productId: String(item?.productId || item?.id || item?.sku || ""),
    sku: item?.sku ? String(item.sku) : null,
    referenceCode: item?.referenceCode ? String(item.referenceCode) : null,
    name: String(item?.name || "Producto sin nombre"),
    type: item?.type ? String(item.type) : null,
    brand: item?.brand ? String(item.brand) : null,
    categoryName: item?.categoryName ? String(item.categoryName) : null,
    subcategory: item?.subcategory ? String(item.subcategory) : null,
    price: typeof item?.price === "number" ? item.price : Number.isFinite(Number(item?.price)) ? Number(item.price) : null,
    totalStock,
    inventory,
    equivalents: Array.isArray(item?.equivalents) ? item.equivalents : [],
    updatedAt: item?.updatedAt ? String(item.updatedAt) : null,
  };
}

export function filterCatalogItems(items, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return items;

  return items.filter((item) => {
    const haystack = [
      item.sku,
      item.referenceCode,
      item.name,
      item.type,
      item.brand,
      item.categoryName,
      item.subcategory,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function normalizeSalesRequestItem(item) {
  return {
    requestId: String(item?.requestId || ""),
    code: String(item?.code || item?.requestId || ""),
    status: String(item?.status || "BORRADOR"),
    customerName: item?.customerName ? String(item.customerName) : null,
    warehouseCode: item?.warehouseCode ? String(item.warehouseCode) : null,
    dueDate: item?.dueDate ? String(item.dueDate) : null,
    requestedBy: item?.requestedBy ? String(item.requestedBy) : item?.createdByDisplayName ? String(item.createdByDisplayName) : null,
    lineCount: Number(item?.lineCount ?? 0),
    linkedAssemblyCount: Number(item?.linkedAssemblyCount ?? 0),
    directPickActive: Boolean(item?.directPickActive),
    createdAt: String(item?.createdAt || ""),
    updatedAt: String(item?.updatedAt || item?.createdAt || ""),
    syncStatus: String(item?.syncStatus || item?.status || "PENDING_LOCAL_SYNC"),
    notes: item?.notes ? String(item.notes) : null,
  };
}

export function filterSalesRequestItems(items, statusFilter) {
  const normalizedFilter = normalizeText(statusFilter).toUpperCase();
  if (!normalizedFilter) return items;
  return items.filter((item) => String(item.status || "").toUpperCase() === normalizedFilter);
}

export function summarizeSalesRequests(items) {
  return items.reduce(
    (summary, item) => {
      summary.total += 1;
      if (item.status === "BORRADOR") summary.draft += 1;
      if (item.status === "CONFIRMADA") summary.confirmed += 1;
      if (item.status === "CANCELADA") summary.cancelled += 1;
      return summary;
    },
    { total: 0, draft: 0, confirmed: 0, cancelled: 0 },
  );
}

export function toAvailabilityItem(item, warehouseCode = "") {
  const byWarehouse = warehouseCode
    ? item.inventory.filter((row) => row.warehouseCode === warehouseCode)
    : item.inventory;
  const total = byWarehouse.reduce((acc, row) => acc + row.quantity, 0);
  const reserved = byWarehouse.reduce((acc, row) => acc + row.reserved, 0);
  const available = byWarehouse.reduce((acc, row) => acc + row.available, 0);

  return {
    productId: item.productId,
    sku: item.sku,
    name: item.name,
    brand: item.brand,
    total,
    reserved,
    available,
    byWarehouse,
  };
}

export function toEquivalenceGroup(item, catalogMap, warehouseCode = "") {
  const equivalents = (item.equivalents || [])
    .map((entry) => catalogMap.get(String(entry.productId || "")))
    .filter(Boolean)
    .map((equivalentItem) => {
      const byWarehouse = warehouseCode
        ? equivalentItem.inventory.filter((row) => row.warehouseCode === warehouseCode)
        : equivalentItem.inventory;
      return {
        productId: equivalentItem.productId,
        sku: equivalentItem.sku,
        name: equivalentItem.name,
        brand: equivalentItem.brand,
        categoryName: equivalentItem.categoryName,
        totalAvailable: byWarehouse.reduce((acc, row) => acc + row.available, 0),
        locations: byWarehouse.map((row) => ({
          warehouseCode: row.warehouseCode,
          available: row.available,
        })),
      };
    });

  return {
    productId: item.productId,
    sku: item.sku,
    name: item.name,
    totalAvailable: item.inventory.reduce((acc, row) => acc + row.available, 0),
    equivalents,
  };
}
