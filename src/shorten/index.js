const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { customAlphabet } = require("nanoid");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);

exports.handler = async (event) => {
  const body = JSON.parse(event.body || "{}");
  const url = body.url;

  if (!url || !url.startsWith("http")) {
    return { statusCode: 400, body: JSON.stringify({ error: "Valid 'url' is required" }) };
  }

  const code = nanoid();

  await client.send(new PutCommand({
    TableName: process.env.TABLE_NAME,
    Item: {
      code,
      url,
      clicks: 0,
      createdAt: new Date().toISOString(),
    },
  }));

  const host = event.requestContext.domainName;
  return {
    statusCode: 200,
    body: JSON.stringify({ shortUrl: `https://${host}/${code}` }),
  };
};
