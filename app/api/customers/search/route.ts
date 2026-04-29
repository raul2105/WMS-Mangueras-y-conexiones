import prisma from "@/lib/prisma";
import { getCustomerById, searchCustomers } from "@/lib/customers/customer-service";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export async function GET(request: Request) {
  await requirePermission("customers.view");

  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") ?? "").trim();
  const selectedId = String(searchParams.get("selectedId") ?? "").trim();
  const cursor = parsePositiveInt(searchParams.get("cursor"), 0, 0, 10_000);
  const take = parsePositiveInt(searchParams.get("take"), 8, 1, 20);

  const canSearch = query.length >= 2;
  const fetchTake = Math.min(100, take + cursor + 1);

  const [searchResult, selected] = await Promise.all([
    canSearch
      ? searchCustomers(prisma, {
          query,
          isActive: true,
          page: 1,
          pageSize: fetchTake,
        })
      : Promise.resolve({ items: [], total: 0, page: 1, pageSize: fetchTake, hasMore: false }),
    selectedId
      ? getCustomerById(prisma, selectedId)
          .then((customer) => (customer.isActive ? customer : null))
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const pagedResults = canSearch ? searchResult.items.slice(cursor, cursor + take) : [];
  const nextCursor = canSearch && searchResult.items.length > cursor + take ? String(cursor + take) : null;

  return Response.json({
    results: pagedResults.map((customer) => ({
      id: customer.id,
      code: customer.code,
      name: customer.name,
      taxId: customer.taxId,
      email: customer.email,
      isActive: customer.isActive,
    })),
    selected: selected
      ? {
          id: selected.id,
          code: selected.code,
          name: selected.name,
          taxId: selected.taxId,
          email: selected.email,
          isActive: selected.isActive,
        }
      : null,
    nextCursor,
  });
}
