import { redirectLegacySalesRoute } from "../legacy-redirect";

export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
  page?: string;
};

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  redirectLegacySalesRoute("/production/requests", await searchParams);
}
