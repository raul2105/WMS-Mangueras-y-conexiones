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
