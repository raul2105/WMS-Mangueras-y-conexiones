export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.NODE_ENV !== "production" || process.env.PERF_DEBUG_LOGS === "true") {
    console.info("[instrumentation] Performance monitoring active — /api/perf/snapshot disponible");
  }
}
