import { recordForSnapshot } from "@/lib/perf-snapshot";

const PERF_DEBUG_LOGS = process.env.PERF_DEBUG_LOGS === "true";
const IS_DEV = process.env.NODE_ENV !== "production";

export function startPerf(scope: string) {
  const startedAt = performance.now();

  return {
    end(extra?: Record<string, unknown>) {
      const durationMs = Math.round(performance.now() - startedAt);
      recordForSnapshot({ scope, durationMs });
      if (IS_DEV || PERF_DEBUG_LOGS) {
        console.info(`[perf] ${scope}`, { durationMs, ...(extra ?? {}) });
      }
    },
  };
}
