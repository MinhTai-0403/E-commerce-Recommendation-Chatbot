const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const { buildTrainingLabels, LABEL_SOURCE } = require("../cellphones/cellphones-labeler");
const { repairObjectText } = require("../utils/text-utils");

function parseArgs(argv) {
  const args = {
    batchSize: 500,
    limit: null,
    dryRun: false,
    sample: 10,
  };

  for (const arg of argv) {
    const [name, value] = arg.split("=");
    if (name === "--batch-size") args.batchSize = Math.max(1, Number(value || 500));
    else if (name === "--limit") args.limit = Number(value || 0) || null;
    else if (name === "--sample") args.sample = Math.max(1, Number(value || 10));
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  npm run label:cellphones -- [options]

Options:
  --dry-run          Print labeled samples without writing to MongoDB.
  --limit=N          Only label N products.
  --sample=N         Number of dry-run samples. Default: 10.
  --batch-size=N     Mongo bulkWrite batch size. Default: 500.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = createMongoClient();
  const { dbName, productsCollection } = getMongoConfig();

  try {
    await client.connect();
    const db = client.db(dbName);
    const products = db.collection(productsCollection);
    const projection = {
      name: 1,
      brand: 1,
      sku: 1,
      slug: 1,
      url: 1,
      price: 1,
      availability: 1,
      categories: 1,
      breadcrumbs: 1,
      source: 1,
    };
    const query = { source: "cellphones" };
    const total = await products.countDocuments(query);

    if (args.dryRun) {
      const docs = await products
        .find(query, { projection })
        .sort({ scrapedAt: -1, name: 1 })
        .limit(args.sample)
        .toArray();
      const labeled = docs.map((doc) => ({
        name: doc.name,
        brand: doc.brand,
        categories: doc.categories,
        breadcrumbs: doc.breadcrumbs,
        price: doc.price,
        trainingLabels: buildTrainingLabels(doc),
      }));

      console.log(JSON.stringify(repairObjectText(labeled), null, 2));
      return;
    }

    const cursor = products
      .find(query, { projection })
      .sort({ _id: 1 })
      .limit(args.limit || 0);

    let processed = 0;
    let updated = 0;
    let batch = [];
    const startedAt = Date.now();

    for await (const doc of cursor) {
      batch.push({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              trainingLabels: buildTrainingLabels(doc),
              trainingLabelSource: LABEL_SOURCE,
              trainingLabeledAt: new Date(),
            },
          },
        },
      });

      processed += 1;

      if (batch.length >= args.batchSize) {
        updated += await flush(products, batch);
        batch = [];
        logProgress(processed, args.limit || total, updated, startedAt);
      }
    }

    updated += await flush(products, batch);
    await ensureLabelIndexes(products);
    logProgress(processed, args.limit || total, updated, startedAt, true);
  } finally {
    await client.close();
  }
}

async function ensureLabelIndexes(collection) {
  // Atlas free-tier storage is tight for this dataset, so label indexes are skipped by default.
  // Query/export can still read the fields; add indexes later after upgrading or pruning data.
  void collection;
}

async function flush(collection, batch) {
  if (!batch.length) return 0;
  const result = await collection.bulkWrite(batch, { ordered: false });
  return result.modifiedCount + result.upsertedCount;
}

function logProgress(processed, total, updated, startedAt, done = false) {
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const rate = Math.round(processed / elapsedSeconds);
  const prefix = done ? "[done]" : "[label]";
  console.log(`${prefix} ${processed}/${total} processed, ${updated} updated, ~${rate}/s`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
