import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const ALLOWED_IMAGE_TYPES = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

function sanitizeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

export async function saveProductImage(
  file: File | null,
  sku: string
): Promise<string | null> {
  if (!file || file.size === 0) return null;

  const extension =
    ALLOWED_IMAGE_TYPES.get(file.type) ||
    (path.extname(file.name || "").toLowerCase() || null);

  if (!extension || ![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
    throw new Error("Formato de imagen no soportado. Usa JPG, PNG o WEBP.");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "products");
  await fs.mkdir(uploadDir, { recursive: true });

  const safeSku = sanitizeSegment(sku.trim() || "product");
  const fileName = `${safeSku}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${extension === ".jpeg" ? ".jpg" : extension}`;
  const outputPath = path.join(uploadDir, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());

  await fs.writeFile(outputPath, bytes);

  return `/uploads/products/${fileName}`;
}
