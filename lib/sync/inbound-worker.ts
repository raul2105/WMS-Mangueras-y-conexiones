import type { HandleResult } from "./handle-types";
import { handleAssemblyRequest } from "./handlers/handle-assembly-request";
import { handleSalesRequest } from "./handlers/handle-sales-request";
import { handleProductDraft } from "./handlers/handle-product-draft";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InboundWorkerConfig {
  /** SQS queue URL for the integration queue (mobile → local) */
  queueUrl: string;
  /** AWS region */
  region: string;
  /** Polling interval in milliseconds (default: 5000) */
  pollIntervalMs?: number;
  /** Max messages per poll (default: 5) */
  maxMessages?: number;
  /** Visibility timeout in seconds (default: 60) */
  visibilityTimeout?: number;
}

interface SQSClient {
  send(command: unknown): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Dynamic AWS SDK import
// ---------------------------------------------------------------------------

let sqsClient: SQSClient | null = null;
let ReceiveMessageCommand: unknown = null;
let DeleteMessageCommand: unknown = null;

async function getSQSClient(region: string): Promise<SQSClient> {
  if (sqsClient) return sqsClient;
  const mod = await import("@aws-sdk/client-sqs");
  ReceiveMessageCommand = mod.ReceiveMessageCommand;
  DeleteMessageCommand = mod.DeleteMessageCommand;
  sqsClient = new mod.SQSClient({ region });
  return sqsClient;
}

// ---------------------------------------------------------------------------
// DynamoDB status updater (ack sync back to mobile)
// ---------------------------------------------------------------------------

let ddbClient: SQSClient | null = null;
let UpdateItemCommand: unknown = null;

async function getDDBClient(region: string): Promise<SQSClient> {
  if (ddbClient) return ddbClient;
  const mod = await import("@aws-sdk/client-dynamodb");
  UpdateItemCommand = mod.UpdateItemCommand;
  ddbClient = new mod.DynamoDBClient({ region });
  return ddbClient;
}

async function ackSyncStatus(
  region: string,
  tableName: string,
  keyField: string,
  keyValue: string,
  localId: string,
): Promise<void> {
  try {
    const client = await getDDBClient(region);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Cmd = UpdateItemCommand as any;
    await client.send(
      new Cmd({
        TableName: tableName,
        Key: { [keyField]: { S: keyValue } },
        UpdateExpression: "SET syncStatus = :s, localId = :lid, updatedAt = :u",
        ExpressionAttributeValues: {
          ":s": { S: "SYNCED" },
          ":lid": { S: localId },
          ":u": { S: new Date().toISOString() },
        },
      }),
    );
  } catch (err) {
    console.error("[inbound-worker] ack error:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

// ---------------------------------------------------------------------------
// Event dispatch
// ---------------------------------------------------------------------------

interface SQSMessage {
  MessageId?: string;
  Body?: string;
  ReceiptHandle?: string;
}

async function processMessage(
  msg: SQSMessage,
  config: InboundWorkerConfig,
): Promise<boolean> {
  if (!msg.Body) return false;

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(msg.Body);
  } catch {
    console.error("[inbound-worker] invalid JSON in message:", msg.MessageId);
    return false;
  }

  const eventType = body.eventType as string | undefined;
  let result: HandleResult;

  switch (eventType) {
    case "assembly_request.created":
      result = await handleAssemblyRequest(body);
      break;
    case "sales_request.created":
      result = await handleSalesRequest(body);
      break;
    case "product_draft.created":
      result = await handleProductDraft(body);
      break;
    default:
      console.warn("[inbound-worker] unknown eventType:", eventType);
      return false;
  }

  if (!result.ok) {
    console.error("[inbound-worker] handler failed:", eventType, result.error);
    return false;
  }

  // Ack sync status back to DynamoDB
  const tablePrefix = process.env.WMS_MOBILE_TABLE_PREFIX ?? "";
  if (result.localId) {
    const tableMap: Record<string, { table: string; key: string; keyValue: string }> = {
      "assembly_request.created": {
        table: `${tablePrefix}assembly-requests`,
        key: "requestId",
        keyValue: body.requestId as string,
      },
      "sales_request.created": {
        table: `${tablePrefix}sales-requests`,
        key: "requestId",
        keyValue: body.requestId as string,
      },
      "product_draft.created": {
        table: `${tablePrefix}product-drafts`,
        key: "draftId",
        keyValue: body.draftId as string,
      },
    };

    const mapping = tableMap[eventType!];
    if (mapping) {
      await ackSyncStatus(config.region, mapping.table, mapping.key, mapping.keyValue, result.localId);
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Core poll loop
// ---------------------------------------------------------------------------

async function pollAndProcess(config: InboundWorkerConfig): Promise<void> {
  try {
    const client = await getSQSClient(config.region);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const RcvCmd = ReceiveMessageCommand as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DelCmd = DeleteMessageCommand as any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await client.send(
      new RcvCmd({
        QueueUrl: config.queueUrl,
        MaxNumberOfMessages: config.maxMessages ?? 5,
        VisibilityTimeout: config.visibilityTimeout ?? 60,
        WaitTimeSeconds: 5, // long-poll to reduce empty calls
      }),
    );

    const messages: SQSMessage[] = response.Messages ?? [];
    for (const msg of messages) {
      const ok = await processMessage(msg, config);
      if (ok && msg.ReceiptHandle) {
        await client.send(
          new DelCmd({
            QueueUrl: config.queueUrl,
            ReceiptHandle: msg.ReceiptHandle,
          }),
        );
      }
    }
  } catch (err) {
    console.error("[inbound-worker] poll error:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startInboundWorker(config: InboundWorkerConfig): void {
  if (running) return;
  running = true;

  const pollMs = config.pollIntervalMs ?? 5000;

  console.log(`[inbound-worker] started — polling every ${pollMs}ms, queue: ${config.queueUrl}`);

  function schedulePoll() {
    if (!running) return;
    pollTimer = setTimeout(async () => {
      await pollAndProcess(config);
      schedulePoll();
    }, pollMs);
  }

  schedulePoll();
}

export function stopInboundWorker(): void {
  running = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  console.log("[inbound-worker] stopped");
}

export function isInboundWorkerRunning(): boolean {
  return running;
}
