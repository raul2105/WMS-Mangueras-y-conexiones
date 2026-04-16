import {
  getPendingSyncEvents,
  markSyncEventsSent,
  markSyncEventFailed,
  retryFailedSyncEvents,
} from "@/lib/sync/sync-events";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OutboundWorkerConfig {
  /** SQS queue URL for outbound sync events */
  queueUrl: string;
  /** AWS region */
  region: string;
  /** Polling interval in milliseconds (default: 3000) */
  pollIntervalMs?: number;
  /** Max events per poll batch (default: 10) */
  batchSize?: number;
  /** Retry failed events interval in milliseconds (default: 60000) */
  retryIntervalMs?: number;
  /** Max retries before giving up (default: 5) */
  maxRetries?: number;
}

interface SQSClient {
  send(command: unknown): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Dynamic AWS SDK import (only when worker is active)
// ---------------------------------------------------------------------------

let sqsClient: SQSClient | null = null;
let SendMessageBatchCommand: unknown = null;

async function getSQSClient(region: string): Promise<SQSClient> {
  if (sqsClient) return sqsClient;
  const mod = await import("@aws-sdk/client-sqs");
  SendMessageBatchCommand = mod.SendMessageBatchCommand;
  sqsClient = new mod.SQSClient({ region });
  return sqsClient;
}

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

// ---------------------------------------------------------------------------
// Core loop
// ---------------------------------------------------------------------------

async function pollAndSend(config: OutboundWorkerConfig): Promise<void> {
  const batchSize = config.batchSize ?? 10;

  try {
    const events = await getPendingSyncEvents(batchSize);
    if (events.length === 0) return;

    const client = await getSQSClient(config.region);

    // SQS SendMessageBatch accepts max 10 entries
    const entries = events.map((evt) => ({
      Id: evt.id,
      MessageBody: JSON.stringify({
        id: evt.id,
        entityType: evt.entityType,
        entityId: evt.entityId,
        action: evt.action,
        payload: evt.payload,
        createdAt: evt.createdAt.toISOString(),
      }),
      MessageGroupId: evt.entityType,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Cmd = SendMessageBatchCommand as any;
    const command = new Cmd({
      QueueUrl: config.queueUrl,
      Entries: entries,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await client.send(command);

    // Mark successful
    const successIds: string[] = (result.Successful ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.Id as string,
    );
    await markSyncEventsSent(successIds);

    // Mark failed
    const failed: Array<{ Id: string; Message?: string }> = result.Failed ?? [];
    for (const f of failed) {
      await markSyncEventFailed(f.Id, f.Message ?? "SQS batch send failed");
    }
  } catch (err) {
    console.error("[outbound-worker] poll error:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startOutboundWorker(config: OutboundWorkerConfig): void {
  if (running) return;
  running = true;

  const pollMs = config.pollIntervalMs ?? 3000;
  const retryMs = config.retryIntervalMs ?? 60_000;
  const maxRetries = config.maxRetries ?? 5;

  console.log(`[outbound-worker] started — polling every ${pollMs}ms, queue: ${config.queueUrl}`);

  function schedulePoll() {
    if (!running) return;
    pollTimer = setTimeout(async () => {
      await pollAndSend(config);
      schedulePoll();
    }, pollMs);
  }

  function scheduleRetry() {
    if (!running) return;
    retryTimer = setTimeout(async () => {
      try {
        await retryFailedSyncEvents(maxRetries);
      } catch (err) {
        console.error("[outbound-worker] retry error:", err instanceof Error ? err.message : err);
      }
      scheduleRetry();
    }, retryMs);
  }

  schedulePoll();
  scheduleRetry();
}

export function stopOutboundWorker(): void {
  running = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  console.log("[outbound-worker] stopped");
}

export function isOutboundWorkerRunning(): boolean {
  return running;
}
