const { promisify } = require("node:util");
const zlib = require("node:zlib");
const { Binary, ObjectId } = require("mongodb");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_IMAGE_PREVIEW_LIMIT = 3;
const DEFAULT_URL_PREVIEW_LIMIT = 2;
const COMPRESSION_VERSION = 1;

const DEFAULT_COMPRESSED_FIELDS = [
  "rawProductJsonLd",
  "specifications",
  "description",
  "attributes",
  "breadcrumbs",
  "parseWarnings",
  "priceRange",
  "sitemap",
  "images",
  "sourceUrls",
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    force: false,
    limit: 0,
    restore: false,
    imagePreviewLimit: DEFAULT_IMAGE_PREVIEW_LIMIT,
    urlPreviewLimit: DEFAULT_URL_PREVIEW_LIMIT,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--restore") args.restore = true;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length)) || 0;
    else if (arg.startsWith("--batch-size=")) args.batchSize = Number(arg.slice("--batch-size=".length)) || DEFAULT_BATCH_SIZE;
    else if (arg.startsWith("--image-preview=")) args.imagePreviewLimit = Number(arg.slice("--image-preview=".length)) || DEFAULT_IMAGE_PREVIEW_LIMIT;
    else if (arg.startsWith("--url-preview=")) args.urlPreviewLimit = Number(arg.slice("--url-preview=".length)) || DEFAULT_URL_PREVIEW_LIMIT;
  }

  return args;
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "string") return value.length > 0;
  return true;
}

function getBlobKey(doc = {}) {
  return `product:${String(doc._id || doc.id || doc.slug || doc.sku || "")}`;
}

function getCompressedFields(doc = {}) {
  const fields = {};

  for (const field of DEFAULT_COMPRESSED_FIELDS) {
    if (hasValue(doc[field])) fields[field] = doc[field];
  }

  return fields;
}

function countSpecificationRows(specifications) {
  if (!Array.isArray(specifications)) return 0;
  return specifications.reduce((total, group) => {
    if (Array.isArray(group?.rows)) return total + group.rows.length;
    if (Array.isArray(group?.items)) return total + group.items.length;
    return total;
  }, 0);
}

function buildSlimProductUpdate(doc, fields, blobMeta, args) {
  const set = {
    compressedBlob: new Binary(blobMeta.gzipBuffer),
    compressedStorage: {
      type: "inline-gzip",
      fields: Object.keys(fields),
      gzipBytes: blobMeta.gzipBytes,
      jsonBytes: blobMeta.jsonBytes,
      version: COMPRESSION_VERSION,
      updatedAt: blobMeta.updatedAt,
    },
    compressedAt: blobMeta.updatedAt,
    compressionVersion: COMPRESSION_VERSION,
    updatedAt: blobMeta.updatedAt,
  };
  const unset = {};

  for (const field of Object.keys(fields)) {
    if (field === "images") {
      set.images = Array.isArray(doc.images) ? doc.images.slice(0, args.imagePreviewLimit) : doc.images;
      set.imagesPreviewCount = Array.isArray(doc.images) ? doc.images.length : 0;
      continue;
    }

    if (field === "sourceUrls") {
      set.sourceUrls = Array.isArray(doc.sourceUrls) ? doc.sourceUrls.slice(0, args.urlPreviewLimit) : doc.sourceUrls;
      set.sourceUrlsPreviewCount = Array.isArray(doc.sourceUrls) ? doc.sourceUrls.length : 0;
      continue;
    }

    if (field === "specifications") {
      set.specificationsCount = Array.isArray(doc.specifications) ? doc.specifications.length : 0;
      set.specificationRowsCount = countSpecificationRows(doc.specifications);
    }

    unset[field] = "";
  }

  const update = { $set: set };
  if (Object.keys(unset).length > 0) update.$unset = unset;
  return update;
}

function summarizeBytes(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

async function gzipJson(payload) {
  const json = JSON.stringify(payload);
  const input = Buffer.from(json, "utf8");
  const output = await gzip(input, { level: 9 });
  return {
    gzipBuffer: output,
    jsonBytes: input.length,
    gzipBytes: output.length,
  };
}

async function flushCompressionBatch({ productOps, products }) {
  if (!productOps.length) return;

  if (productOps.length) await products.bulkWrite(productOps, { ordered: false });
  productOps.length = 0;
}

async function compressProducts({ db, cfg, args }) {
  const products = db.collection(cfg.productsCollection);

  const query = args.force
    ? {}
    : {
        compressedStorage: { $exists: false },
        $or: [
          ...DEFAULT_COMPRESSED_FIELDS.map((field) => ({ [field]: { $exists: true } })),
        ],
      };

  const cursor = products.find(query, { batchSize: args.batchSize }).sort({ _id: 1 });
  let processed = 0;
  let compressed = 0;
  let skipped = 0;
  let jsonBytes = 0;
  let gzipBytes = 0;
  const productOps = [];

  for await (const doc of cursor) {
    if (args.limit && processed >= args.limit) break;
    processed += 1;

    if (!args.force && doc.compressedStorage?.type) {
      skipped += 1;
      continue;
    }

    const fields = getCompressedFields(doc);
    if (!Object.keys(fields).length) {
      skipped += 1;
      continue;
    }

    const now = new Date();
    const payload = {
      version: COMPRESSION_VERSION,
      productId: String(doc._id),
      slug: doc.slug || "",
      sku: doc.sku || "",
      url: doc.url || doc.productUrl || "",
      fields,
      compressedAt: now,
    };
    const packed = await gzipJson(payload);
    jsonBytes += packed.jsonBytes;
    gzipBytes += packed.gzipBytes;
    compressed += 1;

    if (!args.dryRun) {
      const blobMeta = {
        jsonBytes: packed.jsonBytes,
        gzipBytes: packed.gzipBytes,
        gzipBuffer: packed.gzipBuffer,
        updatedAt: now,
      };

      productOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: buildSlimProductUpdate(doc, fields, blobMeta, args),
        },
      });

      if (productOps.length >= args.batchSize) {
        await flushCompressionBatch({ productOps, products });
      }
    }

    if (compressed % 500 === 0) {
      console.log(
        `[compress] processed=${processed} compressed=${compressed} ` +
          `json=${summarizeBytes(jsonBytes)} gzip=${summarizeBytes(gzipBytes)}`
      );
    }
  }

  if (!args.dryRun) await flushCompressionBatch({ productOps, products });

  return {
    mode: args.dryRun ? "dry-run" : "write",
    processed,
    compressed,
    skipped,
    jsonBytes,
    gzipBytes,
    estimatedSavedBytes: Math.max(0, jsonBytes - gzipBytes),
    ratio: jsonBytes ? Number((gzipBytes / jsonBytes).toFixed(4)) : 0,
  };
}

async function restoreProducts({ db, cfg, args }) {
  const products = db.collection(cfg.productsCollection);
  const blobs = db.collection(cfg.productBlobsCollection);
  const query = { "compressedStorage.type": { $in: ["mongo-gzip", "inline-gzip"] } };
  const cursor = products.find(query, { batchSize: args.batchSize }).sort({ _id: 1 });
  let processed = 0;
  let restored = 0;
  let skipped = 0;
  const productOps = [];

  for await (const doc of cursor) {
    if (args.limit && processed >= args.limit) break;
    processed += 1;

    const isInline = doc.compressedStorage?.type === "inline-gzip";
    const key = doc.compressedStorage?.key || getBlobKey(doc);
    const blob = isInline ? null : await blobs.findOne({ key });
    const gzipSource = isInline ? doc.compressedBlob : blob?.gzip;

    if (!gzipSource) {
      skipped += 1;
      continue;
    }

    const buffer = Buffer.from(gzipSource.buffer || gzipSource);
    const payload = JSON.parse((await gunzip(buffer)).toString("utf8"));
    const fields = payload.fields || {};
    if (!Object.keys(fields).length) {
      skipped += 1;
      continue;
    }

    restored += 1;
    if (!args.dryRun) {
      productOps.push({
        updateOne: {
          filter: { _id: ObjectId.isValid(doc._id) ? doc._id : new ObjectId(String(doc._id)) },
          update: {
            $set: {
              ...fields,
              restoredFromCompressedAt: new Date(),
              updatedAt: new Date(),
            },
            $unset: {
              compressedStorage: "",
              compressedBlob: "",
              compressedAt: "",
              compressionVersion: "",
              imagesPreviewCount: "",
              sourceUrlsPreviewCount: "",
              specificationsCount: "",
              specificationRowsCount: "",
            },
          },
        },
      });

      if (productOps.length >= args.batchSize) {
        await products.bulkWrite(productOps, { ordered: false });
        productOps.length = 0;
      }
    }
  }

  if (!args.dryRun && productOps.length) await products.bulkWrite(productOps, { ordered: false });

  return {
    mode: args.dryRun ? "restore-dry-run" : "restore",
    processed,
    restored,
    skipped,
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
      `[start] ${args.restore ? "restore" : "compress"} ${cfg.dbName}.${cfg.productsCollection} ` +
        `blob=${cfg.productBlobsCollection} dryRun=${args.dryRun} limit=${args.limit || "all"}`
    );
    const result = args.restore
      ? await restoreProducts({ db, cfg, args })
      : await compressProducts({ db, cfg, args });
    console.log("[done]", JSON.stringify({
      ...result,
      json: summarizeBytes(result.jsonBytes || 0),
      gzip: summarizeBytes(result.gzipBytes || 0),
      estimatedSaved: summarizeBytes(result.estimatedSavedBytes || 0),
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[fatal]", error.stack || error.message);
  process.exit(1);
});
