import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";

const dynamoClient = new DynamoDBClient({});
const TABLE_NAME = process.env.MOBILE_DDB_WS_CONNECTIONS_TABLE;

export async function handler(event) {
  const connectionId = event.requestContext?.connectionId;
  if (!connectionId || !TABLE_NAME) {
    return { statusCode: 200, body: "OK" };
  }

  try {
    await dynamoClient.send(
      new DeleteItemCommand({
        TableName: TABLE_NAME,
        Key: { connectionId: { S: connectionId } },
      }),
    );
  } catch (err) {
    console.error("[ws-disconnect] error:", err);
  }

  return { statusCode: 200, body: "Disconnected" };
}
