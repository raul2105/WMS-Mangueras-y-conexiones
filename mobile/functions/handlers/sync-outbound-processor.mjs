import {
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

const dynamoClient = new DynamoDBClient({});

function toAttr(value) {
  if (value == null) return { NULL: true };
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map((entry) => toAttr(entry)) };
  if (typeof value === "object") {
    const map = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) map[key] = toAttr(entry);
    }
    return { M: map };
  }
  return { S: String(value) };
}

function marshallItem(item) {
  const marshalled = {};
  for (const [key, value] of Object.entries(item || {})) {
    if (value !== undefined) marshalled[key] = toAttr(value);
  }
  return marshalled;
}

// ---------------------------------------------------------------------------
// Entity → DynamoDB table routing
// ---------------------------------------------------------------------------

const ENTITY_TABLE_MAP = {
  INVENTORY: process.env.MOBILE_DDB_INVENTORY_TABLE,
  PRODUCT: process.env.MOBILE_DDB_CATALOG_TABLE,
  ORDER: process.env.MOBILE_DDB_SALES_REQUESTS_TABLE,
};

// ---------------------------------------------------------------------------
// Handlers per entity type
// ---------------------------------------------------------------------------

async function handleInventoryUpdate(payload) {
  const tableName = ENTITY_TABLE_MAP.INVENTORY;
  if (!tableName) return;

  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  const { productId, locationId, quantity, reserved, available } = data;

  // inventory table key: warehouseCode + searchKey
  // We need the product SKU for the searchKey; the payload might include it
  // For now, write a simplified record keyed by productId:locationId
  const item = {
    warehouseCode: locationId,
    searchKey: `product#${productId}`,
    productId,
    locationId,
    quantity: quantity ?? 0,
    reserved: reserved ?? 0,
    available: available ?? 0,
    updatedAt: new Date().toISOString(),
  };

  await dynamoClient.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshallItem(item),
    }),
  );
}

async function handleProductUpdate(payload) {
  const tableName = ENTITY_TABLE_MAP.PRODUCT;
  if (!tableName) return;

  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  const { productId } = data;
  if (!productId) return;

  const item = {
    productId,
    ...data,
    updatedAt: new Date().toISOString(),
  };

  await dynamoClient.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshallItem(item),
    }),
  );
}

async function handleOrderUpdate(payload) {
  const tableName = ENTITY_TABLE_MAP.ORDER;
  if (!tableName) return;

  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  const { orderId, code } = data;
  if (!orderId) return;

  const item = {
    requestId: orderId,
    code: code ?? orderId,
    ...data,
    syncStatus: "SYNCED",
    updatedAt: new Date().toISOString(),
  };

  await dynamoClient.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshallItem(item),
    }),
  );
}

// ---------------------------------------------------------------------------
// WebSocket push notifications
// ---------------------------------------------------------------------------

async function pushToWebSocketClients(eventData) {
  const wsTableName = process.env.MOBILE_DDB_WS_CONNECTIONS_TABLE;
  const wsEndpoint = process.env.MOBILE_WS_API_ENDPOINT;
  if (!wsTableName || !wsEndpoint) return;

  // Scan all active connections
  let connections;
  try {
    const result = await dynamoClient.send(
      new ScanCommand({ TableName: wsTableName }),
    );
    connections = (result.Items || []).map((item) => item.connectionId?.S).filter(Boolean);
  } catch {
    return;
  }

  if (connections.length === 0) return;

  const apiClient = new ApiGatewayManagementApiClient({
    endpoint: wsEndpoint,
  });

  const message = JSON.stringify(eventData);
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  const staleIds = [];
  await Promise.allSettled(
    connections.map(async (connectionId) => {
      try {
        await apiClient.send(
          new PostToConnectionCommand({ ConnectionId: connectionId, Data: data }),
        );
      } catch (err) {
        if (err?.statusCode === 410 || err?.$metadata?.httpStatusCode === 410) {
          staleIds.push(connectionId);
        }
      }
    }),
  );

  // Clean up stale connections
  if (staleIds.length > 0) {
    const { DeleteItemCommand } = await import("@aws-sdk/client-dynamodb");
    await Promise.allSettled(
      staleIds.map((id) =>
        dynamoClient.send(
          new DeleteItemCommand({
            TableName: wsTableName,
            Key: { connectionId: { S: id } },
          }),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// SQS Lambda handler (batch)
// ---------------------------------------------------------------------------

export async function handler(event) {
  const batchItemFailures = [];

  for (const record of event.Records || []) {
    try {
      const body = JSON.parse(record.body);
      const { entityType, action, payload } = body;

      const parsedPayload =
        typeof payload === "string" ? JSON.parse(payload) : payload;

      switch (entityType) {
        case "INVENTORY":
          await handleInventoryUpdate(parsedPayload);
          break;
        case "PRODUCT":
          await handleProductUpdate(parsedPayload);
          break;
        case "ORDER":
          await handleOrderUpdate(parsedPayload);
          break;
        default:
          console.warn("[sync-outbound-processor] unknown entityType:", entityType);
      }

      // Push real-time notification via WebSocket
      await pushToWebSocketClients({
        type: `${entityType.toLowerCase()}-${action.toLowerCase()}`,
        data: parsedPayload,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[sync-outbound-processor] error:", err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}
