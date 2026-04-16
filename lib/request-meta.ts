import { headers } from "next/headers";
import { randomUUID } from "node:crypto";

export async function getRequestId() {
  try {
    const hdrs = await headers();
    return (
      hdrs.get("x-request-id") ??
      hdrs.get("x-amzn-trace-id") ??
      hdrs.get("x-vercel-id") ??
      randomUUID()
    );
  } catch {
    return randomUUID();
  }
}
