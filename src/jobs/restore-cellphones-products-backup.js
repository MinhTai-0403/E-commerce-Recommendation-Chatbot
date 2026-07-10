const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const zlib = require("node:zlib");
const { BSON } = require("mongodb");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");

const { EJSON } = BSON;

function readArgument(prefix) {
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
}

async function main() {
  const inputValue = readArgument("--file=");
  const execute = process.argv.slice(2).includes("--execute");

  if (!inputValue) throw new Error("Missing --file=data/backups/<backup>.ejsonl.gz");
  if (!execute) throw new Error("Restore is disabled without the explicit --execute flag.");

  const inputPath = path.resolve(process.cwd(), inputValue);
  const client = createMongoClient();
  const config = getMongoConfig();

  try {
    await client.connect();
    const collection = client.db(config.dbName).collection(config.productsCollection);
    const existingCount = await collection.countDocuments({});
    if (existingCount !== 0) {
      throw new Error(
        `${config.dbName}.${config.productsCollection} is not empty (${existingCount} documents). Restore aborted.`
      );
    }

    const lines = readline.createInterface({
      input: fs.createReadStream(inputPath).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });
    let batch = [];
    let restoredCount = 0;

    for await (const line of lines) {
      if (!line.trim()) continue;
      batch.push(EJSON.parse(line, { relaxed: false }));
      if (batch.length < 500) continue;

      await collection.insertMany(batch, { ordered: false });
      restoredCount += batch.length;
      batch = [];
      console.log(`[restore] inserted ${restoredCount} documents`);
    }

    if (batch.length) {
      await collection.insertMany(batch, { ordered: false });
      restoredCount += batch.length;
    }

    const finalCount = await collection.countDocuments({});
    if (finalCount !== restoredCount) {
      throw new Error(`Restore count mismatch: inserted=${restoredCount}, collection=${finalCount}`);
    }

    console.log(`[done] restored ${restoredCount} documents into ${config.dbName}.${config.productsCollection}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`[failed] ${error.message}`);
  process.exitCode = 1;
});
