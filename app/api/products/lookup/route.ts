import prisma from "@/lib/prisma";
import { resolveProductInput } from "@/lib/product-search";
import { requirePermission } from "@/lib/rbac";
import { startPerf } from "@/lib/perf";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const perf = startPerf("api.products.lookup");
  await requirePermission("catalog.view");

  const { searchParams } = new URL(request.url);
  const code = String(searchParams.get("code") ?? "").trim();
  if (!code || code.length < 3) {
    perf.end({ hit: false, reason: "short_query" });
    return Response.json({ selected: null, suggestions: [] });
  }

  const { product: selected, suggestions } = await resolveProductInput(prisma, code, { minScore: 140 });

  perf.end({
    hit: Boolean(selected),
    queryLength: code.length,
    suggestions: suggestions.length,
  });

  return Response.json({
    selected,
    suggestions: suggestions.slice(0, 6),
  });
}
