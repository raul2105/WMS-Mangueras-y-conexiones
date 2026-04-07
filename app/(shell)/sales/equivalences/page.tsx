import { redirectLegacySalesRoute } from "../legacy-redirect";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  warehouseId?: string;
};

export default async function SalesEquivalencesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  redirectLegacySalesRoute("/production/equivalences", await searchParams);
}
