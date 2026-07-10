const { Binary } = require("mongodb");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");

const DEFAULT_BATCH_SIZE = 500;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    dropBlobs: false,
    limit: 0,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--drop-blobs") args.dropBlobs = true;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length)) || 0;
    else if (arg.startsWith("--batch-size=")) args.batchSize = Number(arg.slice("--batch-size=".length)) || DEFAULT_BATCH_SIZE;
  }

  return args;
}

function summarizeBytes(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

function getBlobBuffer(blob = {}) {
  if (!blob.gzip) return null;
  return Buffer.from(blob.gzip.buffer || blob.gzip);
}

async function processEmbedBatch({ products, blobs, batch, cfg, args, stats }) {
  if (!batch.length) return;

  const keys = [
    ...new Set(
      batch
        .map((product) => product.compressedStorage?.key)
        .filter((key) => typeof key === "string" && key.length)
    ),
  ];

  const blobDocs = keys.length
    ? await blobs
        .find(
          { key: { $in: keys } },
          {
            projection: {
              key: 1,
              gzip: 1,
              fields: 1,
              gzipBytes: 1,
              jsonBytes: 1,
            },
          }
        )
        .toArray()
    : [];

  const blobByKey = new Map(blobDocs.map((blob) => [blob.key, blob]));
  const now = new Date();
  const ops = [];

  for (const product of batch) {
    stats.processed += 1;

    const key = product.compressedStorage?.key;
    const blob = blobByKey.get(key);
    const buffer = getBlobBuffer(blob);

    if (!buffer) {
      stats.missingBlob += 1;
      continue;
    }

    stats.gzipBytes += buffer.length;
    stats.embedded += 1;

    if (!args.dryRun) {
      ops.push({
        updateOne: {
          filter: { _id: product._id },
          update: {
            $set: {
              compressedBlob: new Binary(buffer),
              compressedStorage: {
                type: "inline-gzip",
                fields: blob.fields || product.compressedStorage.fields || [],
                gzipBytes: blob.gzipBytes || buffer.length,
                jsonBytes: blob.jsonBytes || product.compressedStorage.jsonBytes || null,
                version: product.compressedStorage.version || 1,
                updatedAt: now,
              },
              compressedAt: now,
              updatedAt: now,
            },
          },
        },
      });
    }
  }

  if (ops.length) {
    await products.bulkWrite(ops, { ordered: false });
  }

  console.log(
    `[embed] processed=${stats.processed} embedded=${stats.embedded} ` +
      `gzip=${summarizeBytes(stats.gzipBytes)} missingBlob=${stats.missingBlob}`
  );
}

async function embedBlobs({ db, cfg, args }) {
  const products = db.collection(cfg.productsCollection);
  const blobs = db.collection(cfg.productBlobsCollection);

  const query = {
    "compressedStorage.type": "mongo-gzip",
    "compressedStorage.collection": cfg.productBlobsCollection,
    "compressedStorage.key": { $type: "string" },
  };

  const cursor = products.find(query, {
    projection: {
      _id: 1,
      slug: 1,
      compressedStorage: 1,
    },
    batchSize: args.batchSize,
  });

  const stats = {
    processed: 0,
    embedded: 0,
    missingBlob: 0,
    gzipBytes: 0,
  };
  let batch = [];

  for await (const product of cursor) {
    if (args.limit && stats.processed + batch.length >= args.limit) break;

    batch.push(product);

    if (batch.length >= args.batchSize) {
      await processEmbedBatch({ products, blobs, batch, cfg, args, stats });
      batch = [];
    }
  }

  if (batch.length) {
    await processEmbedBatch({ products, blobs, batch, cfg, args, stats });
  }

  const inlineCount = await products.countDocuments({ "compressedStorage.type": "inline-gzip" });
  const externalCount = await products.countDocuments({ "compressedStorage.type": "mongo-gzip" });
  const blobCount = await blobs.estimatedDocumentCount().catch(() => 0);

  if (args.dropBlobs && !args.dryRun) {
    if (externalCount > 0 || stats.missingBlob > 0) {
      throw new Error(
        `Refuse to drop ${cfg.productBlobsCollection}: externalCount=${externalCount}, missingBlob=${stats.missingBlob}`
      );
    }

    if (inlineCount < stats.embedded) {
      throw new Error(
        `Refuse to drop ${cfg.productBlobsCollection}: inlineCount=${inlineCount}, embedded=${stats.embedded}`
      );
    }

    await blobs.drop().catch((error) => {
      if (error?.codeName !== "NamespaceNotFound") throw error;
    });
  }

  return {
    mode: args.dryRun ? "dry-run" : "write",
    processed: stats.processed,
    embedded: stats.embedded,
    missingBlob: stats.missingBlob,
    gzipBytes: stats.gzipBytes,
    inlineCount,
    externalCount,
    blobCountBeforeDrop: blobCount,
    droppedBlobs: Boolean(args.dropBlobs && !args.dryRun),
  };
}

async function main() {
  const args = parseArgs();
  const cfg = getMongoConfig();
  const client = createMongoClient();

  await client.connect();

  try {
    const db = client.db(cfg.dbName);
    console.log(
      `[start] embed product blobs into ${cfg.dbName}.${cfg.productsCollection} ` +
        `from ${cfg.productBlobsCollection} dryRun=${args.dryRun} dropBlobs=${args.dropBlobs}`
    );
    const result = await embedBlobs({ db, cfg, args });
    console.log("[done]", JSON.stringify({
      ...result,
      gzip: summarizeBytes(result.gzipBytes),
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[fatal]", error.stack || error.message);
  process.exit(1);
});
