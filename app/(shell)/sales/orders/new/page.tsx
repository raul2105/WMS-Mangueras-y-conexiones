import { redirectLegacySalesRoute } from "../../legacy-redirect";

export const dynamic = "force-dynamic";

type SearchParams = {
  error?: string;
};

export default async function NewSalesOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  redirectLegacySalesRoute("/production/requests/new", await searchParams);
}
