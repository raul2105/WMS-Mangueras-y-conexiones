import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const dynamoClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});

function toAttr(value) {
  if (value == null) return { NULL: true };
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map((entry) => toAttr(entry)) };
  if (typeof value === "object") {
    const map = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        map[key] = toAttr(entry);
      }
    }
    return { M: map };
  }
  return { S: String(value) };
}

function fromAttr(attr) {
  if (!attr) return null;
  if ("S" in attr) return attr.S;
  if ("N" in attr) return Number(attr.N);
  if ("BOOL" in attr) return Boolean(attr.BOOL);
  if ("NULL" in attr) return null;
  if ("L" in attr) return (attr.L || []).map((entry) => fromAttr(entry));
  if ("M" in attr) {
    const result = {};
    for (const [key, value] of Object.entries(attr.M || {})) {
      result[key] = fromAttr(value);
    }
    return result;
  }
  return null;
}

function marshallItem(item) {
  const marshalled = {};
  for (const [key, value] of Object.entries(item || {})) {
    if (value !== undefined) {
      marshalled[key] = toAttr(value);
    }
  }
  return marshalled;
}

function unmarshallItem(item) {
  if (!item) return null;
  const parsed = {};
  for (const [key, value] of Object.entries(item)) {
    parsed[key] = fromAttr(value);
  }
  return parsed;
}

export async function ddbPutPlainItem({ tableName, item, conditionExpression }) {
  await dynamoClient.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshallItem(item),
      ...(conditionExpression ? { ConditionExpression: conditionExpression } : {}),
    }),
  );
}

export async function ddbGetPlainItem({ tableName, key }) {
  const response = await dynamoClient.send(
    new GetItemCommand({
      TableName: tableName,
      Key: marshallItem(key),
    }),
  );
  return unmarshallItem(response.Item);
}

export async function ddbQueryByWarehousePrefix({ tableName, warehouseCode, searchPrefix, limit }) {
  const response = await dynamoClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "warehouseCode = :warehouseCode AND begins_with(searchKey, :searchPrefix)",
      ExpressionAttributeValues: {
        ":warehouseCode": toAttr(warehouseCode),
        ":searchPrefix": toAttr(searchPrefix),
      },
      Limit: limit,
    }),
  );

  return (response.Items || []).map((entry) => unmarshallItem(entry));
}

export async function ddbScanPlainItems({ tableName, limit }) {
  const response = await dynamoClient.send(
    new ScanCommand({
      TableName: tableName,
      ...(typeof limit === "number" ? { Limit: limit } : {}),
    }),
  );

  return (response.Items || []).map((entry) => unmarshallItem(entry));
}

export async function sqsSend(params) {
  return sqsClient.send(new SendMessageCommand(params));
}
