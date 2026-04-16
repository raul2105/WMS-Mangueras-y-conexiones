/**
 * Sync worker bootstrap — starts outbound and inbound sync workers
 * when WMS_SYNC_ENABLED=true and required env vars are present.
 *
 * Called once at server startup (instrumentation or layout init).
 */

let initialized = false;

export async function initSyncWorkers(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const syncEnabled = process.env.WMS_SYNC_ENABLED === "true";
  if (!syncEnabled) {
    console.log("[sync] WMS_SYNC_ENABLED is not true — sync workers disabled");
    return;
  }

  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
  const outboundQueueUrl = process.env.WMS_OUTBOUND_SYNC_QUEUE_URL;
  const inboundQueueUrl = process.env.WMS_INBOUND_SYNC_QUEUE_URL;

  if (outboundQueueUrl) {
    const { startOutboundWorker } = await import("@/lib/sync/outbound-worker");
    startOutboundWorker({
      queueUrl: outboundQueueUrl,
      region,
      pollIntervalMs: Number(process.env.WMS_SYNC_POLL_MS) || 3000,
    });
  } else {
    console.warn("[sync] WMS_OUTBOUND_SYNC_QUEUE_URL not set — outbound worker disabled");
  }

  if (inboundQueueUrl) {
    const { startInboundWorker } = await import("@/lib/sync/inbound-worker");
    startInboundWorker({
      queueUrl: inboundQueueUrl,
      region,
      pollIntervalMs: Number(process.env.WMS_SYNC_POLL_MS) || 5000,
    });
  } else {
    console.warn("[sync] WMS_INBOUND_SYNC_QUEUE_URL not set — inbound worker disabled");
  }
}

export function shutdownSyncWorkers(): void {
  try {
    // Dynamic imports to avoid loading modules if never started
    import("@/lib/sync/outbound-worker").then((m) => m.stopOutboundWorker()).catch(() => {});
    import("@/lib/sync/inbound-worker").then((m) => m.stopInboundWorker()).catch(() => {});
  } catch {
    // Ignore errors during shutdown
  }
}
