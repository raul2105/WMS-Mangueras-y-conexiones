import { redirectLegacySalesRoute } from "../legacy-redirect";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  warehouse?: string;
  page?: string;
};

export default async function SalesAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  redirectLegacySalesRoute("/production/availability", await searchParams);
}
