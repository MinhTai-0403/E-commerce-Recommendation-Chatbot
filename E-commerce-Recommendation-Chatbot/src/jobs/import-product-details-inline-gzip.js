const fs = require("node:fs/promises");
const path = require("node:path");
const { Binary } = require("mongodb");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");

const DEFAULT_BATCH_SIZE = 3000;
const STORAGE_VERSION = 1;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    sourceDir: process.env.PRODUCT_DETAILS_IMPORT_DIR || "data/product-details",
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    limit: 0,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--source-dir=")) args.sourceDir = arg.slice("--source-dir=".length);
    else if (arg.startsWith("--batch-size=")) args.batchSize = Number(arg.slice("--batch-size=".length)) || DEFAULT_BATCH_SIZE;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length)) || 0;
  }

  return args;
}

function normalizePathForMongo(filePath) {
  return filePath.split(path.sep).join("/");
}

function summarizeBytes(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findProductDetailsRoot(sourceDir) {
  const absolute = path.resolve(sourceDir);
  const directCellphones = path.join(absolute, "cellphones");
  if (await pathExists(directCellphones)) return absolute;

  const nested = path.join(
    absolute,
    "cosarii",
    "E-commerce-Recommendation-Chatbot",
    "data",
    "product-details"
  );
  if (await pathExists(path.join(nested, "cellphones"))) return nested;

  const queue = [absolute];
  while (queue.length) {
    const current = queue.shift();
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    if (path.basename(current) === "product-details" && entries.some((entry) => entry.isDirectory() && entry.name === "cellphones")) {
      return current;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      queue.push(path.join(current, entry.name));
    }
  }

  throw new Error(`Cannot find data/product-details under ${absolute}`);
}

async function collectGzipFiles(root, args) {
  const files = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".json.gz")) continue;
      files.push(fullPath);
      if (args.limit && files.length >= args.limit) return files;
    }
  }

  return files;
}

async function buildUpdateOp(root, filePath) {
  const [buffer, stat] = await Promise.all([
    fs.readFile(filePath),
    fs.stat(filePath),
  ]);
  const relativePath = normalizePathForMongo(path.relative(root, filePath));
  const now = new Date();

  return {
    bytes: buffer.length,
    op: {
      updateOne: {
        filter: { "storage.path": relativePath },
        update: {
          $set: {
            detailBlob: new Binary(buffer),
            "storage.type": "inline-gzip",
            "storage.version": STORAGE_VERSION,
            "storage.path": relativePath,
            "storage.bytes": buffer.length,
            "storage.updatedAt": stat.mtime,
            storageStatus: "inline-backed",
            storageVersion: STORAGE_VERSION,
            inlineImportedAt: now,
            updatedAt: now,
          },
        },
      },
    },
  };
}

async function importDetails({ db, cfg, args }) {
  const details = db.collection(cfg.productDetailsCollection);
  const root = await findProductDetailsRoot(args.sourceDir);
  const files = await collectGzipFiles(root, args);

  if (!args.dryRun) {
    await details.createIndex({ "storage.path": 1 }, { sparse: true, name: "product_details_storage_path" });
    await details.createIndex({ "storage.type": 1 }, { name: "product_details_storage_type" });
  }

  let processed = 0;
  let matched = 0;
  let modified = 0;
  let bytes = 0;

  for (let index = 0; index < files.length; index += args.batchSize) {
    const batchFiles = files.slice(index, index + args.batchSize);
    const built = await Promise.all(batchFiles.map((filePath) => buildUpdateOp(root, filePath)));
    const ops = built.map((item) => item.op);
    const batchBytes = built.reduce((sum, item) => sum + item.bytes, 0);

    processed += batchFiles.length;
    bytes += batchBytes;

    if (!args.dryRun && ops.length) {
      const result = await details.bulkWrite(ops, { ordered: false });
      matched += result.matchedCount || 0;
      modified += result.modifiedCount || 0;
    }

    console.log(
      `[import-details] processed=${processed}/${files.length} ` +
        `matched=${matched} modified=${modified} gzip=${summarizeBytes(bytes)}`
    );
  }

  const inlineCount = await details.countDocuments({ "storage.type": "inline-gzip", detailBlob: { $exists: true } });
  const localCount = await details.countDocuments({ "storage.type": "local-gzip" });

  return {
    mode: args.dryRun ? "dry-run" : "write",
    sourceRoot: root,
    files: files.length,
    processed,
    matched,
    modified,
    unmatched: args.dryRun ? 0 : Math.max(0, processed - matched),
    gzipBytes: bytes,
    inlineCount,
    localCount,
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
      `[start] import inline gzip details into ${cfg.dbName}.${cfg.productDetailsCollection} ` +
        `source=${path.resolve(args.sourceDir)} batchSize=${args.batchSize} dryRun=${args.dryRun}`
    );
    const result = await importDetails({ db, cfg, args });
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
