import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
  page?: string;
};

export default async function ProductionOrdersRedirectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.status) params.set("status", sp.status);
  if (sp.page) params.set("page", sp.page);
  const query = params.toString();
  redirect(query ? `/production?${query}` : "/production");
}
