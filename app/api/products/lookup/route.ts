import prisma from "@/lib/prisma";
import { resolveProductInput } from "@/lib/product-search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = String(searchParams.get("code") ?? "").trim();
  if (!code) {
    return Response.json({ selected: null, suggestions: [] });
  }

  const { product: selected, suggestions } = await resolveProductInput(prisma, code);

  return Response.json({
    selected,
    suggestions,
  });
}
