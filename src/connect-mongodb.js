const { createMongoClient, getMongoConfig } = require("./mongodb");

const client = createMongoClient();
const { dbName } = getMongoConfig();

async function main() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(`Connected to MongoDB successfully. Default DB: ${dbName}`);
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();
