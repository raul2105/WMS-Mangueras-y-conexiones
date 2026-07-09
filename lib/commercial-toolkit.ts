export function buildCommercialSearchHref(
  basePath: "/catalog" | "/production/availability" | "/production/equivalences",
  query?: string,
  params: Record<string, string | undefined> = {},
) {
  const searchParams = new URLSearchParams();
  const normalizedQuery = query?.trim();

  if (normalizedQuery) {
    searchParams.set("q", normalizedQuery);
  }

  for (const [key, value] of Object.entries(params)) {
    const normalizedValue = value?.trim();
    if (normalizedValue) {
      searchParams.set(key, normalizedValue);
    }
  }

  const qs = searchParams.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

interface CommercialRequestParams {
  productId?: string;
  sku?: string;
  q?: string;
  source?: string;
  equivalentProductId?: string;
  warehouseId?: string;
  warehouseCode?: string;
  warehouseName?: string;
  quantity?: number | string;
  promiseCheckedAt?: string;
  promiseAvailableQty?: number | string;
}

export function buildCommercialRequestHref(
  params: CommercialRequestParams = {},
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const normalizedValue = value?.toString().trim();
    if (normalizedValue) {
      searchParams.set(key, normalizedValue);
    }
  }

  const qs = searchParams.toString();
  return qs ? `/production/requests/new?${qs}` : "/production/requests/new";
}

export function buildCommercialAvailabilityHref(
  query?: string,
  warehouseId?: string,
) {
  return buildCommercialSearchHref("/production/availability", query, {
    warehouse: warehouseId,
  });
}

export function buildCommercialEquivalencesHref(
  query?: string,
  warehouseId?: string,
) {
  return buildCommercialSearchHref("/production/equivalences", query, {
    warehouseId,
  });
}
