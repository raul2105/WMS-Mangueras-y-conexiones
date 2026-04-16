import prisma from "@/lib/prisma";
import type { HandleResult } from "../handle-types";

/**
 * Handle a product_draft.created event from mobile.
 * Creates a Product locally from the draft payload.
 */
export async function handleProductDraft(
  body: Record<string, unknown>,
): Promise<HandleResult> {
  try {
    const draftId = body.draftId as string | undefined;

    if (!draftId) {
      return { ok: false, error: "Missing draftId" };
    }

    // The full product data should be in the SQS message or fetched from DynamoDB.
    // For now we create a minimal draft product that can be completed in the office.
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const shortId = draftId.slice(0, 6).toUpperCase();
    const sku = `DRAFT-${datePart}-${shortId}`;

    // Idempotency check
    const existing = await prisma.product.findUnique({
      where: { sku },
      select: { id: true },
    });

    if (existing) {
      return { ok: true, localId: existing.id };
    }

    const product = await prisma.product.create({
      data: {
        sku,
        name: `Borrador móvil ${shortId}`,
        type: "ACCESSORY",
        description: `Producto creado desde borrador móvil ${draftId}. Requiere revisión.`,
      },
      select: { id: true },
    });

    return { ok: true, localId: product.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
