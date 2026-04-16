import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const dynamoClient = new DynamoDBClient({});
const TABLE_NAME = process.env.MOBILE_DDB_WS_CONNECTIONS_TABLE;

export async function handler(event) {
  const connectionId = event.requestContext?.connectionId;
  if (!connectionId || !TABLE_NAME) {
    return { statusCode: 500, body: "Missing connectionId or table config" };
  }

  // TTL: expire connections after 2 hours (API Gateway disconnects idle after ~10 min)
  const ttl = Math.floor(Date.now() / 1000) + 7200;

  try {
    await dynamoClient.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          connectionId: { S: connectionId },
          connectedAt: { S: new Date().toISOString() },
          ttl: { N: String(ttl) },
        },
      }),
    );
    return { statusCode: 200, body: "Connected" };
  } catch (err) {
    console.error("[ws-connect] error:", err);
    return { statusCode: 500, body: "Failed to register connection" };
  }
}
