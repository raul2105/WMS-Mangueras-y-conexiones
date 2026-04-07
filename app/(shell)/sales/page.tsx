import { redirectLegacySalesRoute } from "./legacy-redirect";

export const dynamic = "force-dynamic";

export default function SalesPage() {
  redirectLegacySalesRoute("/production/requests");
}
