import { handlers } from "@/lib/auth";
import type { NextRequest } from "next/server";

function readRequestId(request: NextRequest) {
  return (
    request.headers.get("x-request-id") ??
    request.headers.get("x-amzn-trace-id") ??
    request.headers.get("x-vercel-id") ??
    crypto.randomUUID()
  );
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = readRequestId(request);
  const response = await handlers.GET(request);
  response.headers.set("x-request-id", requestId);
  console.info("[perf] auth.route.get", {
    requestId,
    pathname: new URL(request.url).pathname,
    durationMs: Date.now() - startedAt,
  });
  return response;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = readRequestId(request);
  const url = new URL(request.url);
  const response = await handlers.POST(request);
  response.headers.set("x-request-id", requestId);
  console.info("[perf] auth.route.post", {
    requestId,
    pathname: url.pathname,
    callback: url.pathname.includes("/callback/"),
    durationMs: Date.now() - startedAt,
  });
  return response;
}
