export function sanitizeProductImageKey(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, "_");
}

export function getLocalProductImagePath(sku: string): string {
  return `/product-images/${sanitizeProductImageKey(sku)}.jpg`;
}
