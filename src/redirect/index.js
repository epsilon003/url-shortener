const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  const code = event.pathParameters.code;

  const result = await client.send(new GetCommand({
    TableName: process.env.TABLE_NAME,
    Key: { code },
  }));

  if (!result.Item) {
    return { statusCode: 404, body: "Short URL not found" };
  }

  // fire-and-forget click counter — don't block the redirect on it
  client.send(new UpdateCommand({
    TableName: process.env.TABLE_NAME,
    Key: { code },
    UpdateExpression: "SET clicks = clicks + :inc",
    ExpressionAttributeValues: { ":inc": 1 },
  })).catch(() => {});

  return {
    statusCode: 301,
    headers: { Location: result.Item.url },
  };
};
