import { redirect } from "next/navigation";

type SearchParamValue = string | string[] | undefined;

export function redirectLegacySalesRoute(
  pathname: string,
  searchParams?: Record<string, SearchParamValue>,
) {
  const params = new URLSearchParams();

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === "string" && value.length > 0) {
        params.set(key, value);
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item.length > 0) {
            params.append(key, item);
          }
        }
      }
    }
  }

  const query = params.toString();
  redirect(query ? `${pathname}?${query}` : pathname);
}
