import { redirect } from "next/navigation";
import { pageGuard } from "@/components/rbac/PageGuard";

export const dynamic = "force-dynamic";

type SearchParams = {
  blocked?: string;
  status?: string;
};

function isTruthy(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes";
}

export default async function ProductionFulfillmentIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await pageGuard("production.execute");
  const sp = await searchParams;

  if (isTruthy(sp.blocked)) {
    redirect("/production/requests?queue=assembly_blocked");
  }

  if (sp.status?.trim().toLowerCase() === "active") {
    redirect("/production?ops=assembly_open");
  }

  redirect("/production/requests");
}
