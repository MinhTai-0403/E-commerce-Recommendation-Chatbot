const crypto = require("node:crypto");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline");
const zlib = require("node:zlib");
const { once } = require("node:events");
const { pipeline } = require("node:stream/promises");
const { BSON } = require("mongodb");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");

const { EJSON } = BSON;

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

function buildTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatBytes(value = 0) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

async function writeWithBackpressure(stream, value) {
  if (!stream.write(value)) await once(stream, "drain");
}

async function exportCollection(collection, partialPath) {
  const gzip = zlib.createGzip({ level: 9 });
  const output = fs.createWriteStream(partialPath, { flags: "wx" });
  const completion = pipeline(gzip, output);
  const cursor = collection.find({}).sort({ _id: 1 }).batchSize(200);
  let count = 0;

  try {
    for await (const document of cursor) {
      const line = `${EJSON.stringify(document, null, 0, { relaxed: false })}\n`;
      await writeWithBackpressure(gzip, line);
      count += 1;

      if (count % 1000 === 0) {
        console.log(`[backup] exported ${count} documents`);
      }
    }

    gzip.end();
    await completion;
    return count;
  } catch (error) {
    gzip.destroy(error);
    output.destroy(error);
    await completion.catch(() => {});
    throw error;
  } finally {
    await cursor.close().catch(() => {});
  }
}

async function validateBackup(filePath) {
  const gunzip = zlib.createGunzip();
  const input = fs.createReadStream(filePath);
  const lines = readline.createInterface({
    input: input.pipe(gunzip),
    crlfDelay: Infinity,
  });
  let count = 0;

  for await (const line of lines) {
    if (!line.trim()) continue;
    EJSON.parse(line, { relaxed: false });
    count += 1;

    if (count % 5000 === 0) {
      console.log(`[verify] parsed ${count} documents`);
    }
  }

  return count;
}

async function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const input = fs.createReadStream(filePath);
  for await (const chunk of input) hash.update(chunk);
  return hash.digest("hex");
}

async function writeManifest(manifestPath, manifest) {
  await fsPromises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function main() {
  if (!hasFlag("--execute")) {
    throw new Error(
      "This command exports and then deletes every document. Re-run with --execute after reviewing the command."
    );
  }

  const client = createMongoClient();
  const config = getMongoConfig();
  const exportedAt = new Date();
  const backupDirectory = path.join(process.cwd(), "data", "backups");
  const baseName = `${config.productsCollection}-${buildTimestamp(exportedAt)}`;
  const backupPath = path.join(backupDirectory, `${baseName}.ejsonl.gz`);
  const partialPath = `${backupPath}.partial`;
  const manifestPath = path.join(backupDirectory, `${baseName}.manifest.json`);

  await fsPromises.mkdir(backupDirectory, { recursive: true });

  try {
    await client.connect();
    const db = client.db(config.dbName);
    const collection = db.collection(config.productsCollection);
    const collectionInfo = await db
      .listCollections({ name: config.productsCollection })
      .next();

    if (!collectionInfo) {
      throw new Error(`Collection ${config.dbName}.${config.productsCollection} does not exist.`);
    }

    const sourceCountBefore = await collection.countDocuments({});
    const indexesBefore = await collection.listIndexes().toArray();

    console.log(`[start] ${config.dbName}.${config.productsCollection}: ${sourceCountBefore} documents`);
    const exportedCount = await exportCollection(collection, partialPath);
    await fsPromises.rename(partialPath, backupPath);

    const verifiedCount = await validateBackup(backupPath);
    const sourceCountAfterBackup = await collection.countDocuments({});
    const fileStat = await fsPromises.stat(backupPath);
    const sha256 = await hashFile(backupPath);

    if (exportedCount !== sourceCountBefore || verifiedCount !== sourceCountBefore) {
      throw new Error(
        `Backup count mismatch: source=${sourceCountBefore}, exported=${exportedCount}, verified=${verifiedCount}. Source was not deleted.`
      );
    }

    if (sourceCountAfterBackup !== sourceCountBefore) {
      throw new Error(
        `Collection changed during backup: before=${sourceCountBefore}, after=${sourceCountAfterBackup}. Source was not deleted.`
      );
    }

    const manifest = {
      format: "mongodb-extended-json-lines-gzip",
      formatVersion: 1,
      status: "backup_verified",
      database: config.dbName,
      collection: config.productsCollection,
      exportedAt: exportedAt.toISOString(),
      sourceCountBefore,
      exportedCount,
      verifiedCount,
      compressedBytes: fileStat.size,
      sha256,
      backupFile: path.relative(process.cwd(), backupPath),
      collectionOptions: collectionInfo.options || {},
      indexes: indexesBefore,
    };
    await writeManifest(manifestPath, manifest);

    console.log(`[verified] ${verifiedCount} documents, ${formatBytes(fileStat.size)}, sha256=${sha256}`);
    console.log(`[delete] clearing documents from ${config.dbName}.${config.productsCollection}`);

    const deletion = await collection.deleteMany({});
    const remainingCount = await collection.countDocuments({});
    const collectionStillExists = Boolean(
      await db.listCollections({ name: config.productsCollection }, { nameOnly: true }).hasNext()
    );
    const indexesAfter = await collection.listIndexes().toArray();

    if (remainingCount !== 0 || !collectionStillExists) {
      throw new Error(
        `Clear verification failed: remaining=${remainingCount}, collectionStillExists=${collectionStillExists}.`
      );
    }

    manifest.status = "source_cleared";
    manifest.clearedAt = new Date().toISOString();
    manifest.deletedCount = deletion.deletedCount;
    manifest.remainingCount = remainingCount;
    manifest.collectionStillExists = collectionStillExists;
    manifest.indexCountBefore = indexesBefore.length;
    manifest.indexCountAfter = indexesAfter.length;
    await writeManifest(manifestPath, manifest);

    console.log(`[done] deleted=${deletion.deletedCount}, remaining=${remainingCount}`);
    console.log(`[done] collection preserved=${collectionStillExists}, indexes=${indexesAfter.length}`);
    console.log(`[backup] ${backupPath}`);
    console.log(`[manifest] ${manifestPath}`);
  } finally {
    await fsPromises.rm(partialPath, { force: true }).catch(() => {});
    await client.close();
  }
}

main().catch((error) => {
  console.error(`[failed] ${error.message}`);
  process.exitCode = 1;
});
