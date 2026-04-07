import { redirectLegacySalesRoute } from "../../legacy-redirect";

export const dynamic = "force-dynamic";

type SearchParams = {
  ok?: string;
  error?: string;
};

export default async function SalesOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  redirectLegacySalesRoute(`/production/requests/${id}`, await searchParams);
}
