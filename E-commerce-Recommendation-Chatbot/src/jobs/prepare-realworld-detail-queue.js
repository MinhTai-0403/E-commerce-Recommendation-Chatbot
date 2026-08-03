const fs = require("fs/promises");
const path = require("path");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const {
  buildRealWorldRecency,
  normalizeCellphonesUrl,
} = require("../cellphones/realworld-product-recency");

function parseArgs(argv = []) {
  const args = {
    limit: 10_000,
    output: path.join("logs", `realworld-detail-queue-${Date.now()}.txt`),
    update: true,
    includeOutOfStock: false,
  };

  for (const arg of argv) {
    const [name, value] = arg.split("=");
    if (name === "--limit") args.limit = Math.max(1, Number(value || args.limit));
    else if (name === "--output" && value) args.output = value;
    else if (arg === "--no-update") args.update = false;
    else if (arg === "--include-out-of-stock") args.includeOutOfStock = true;
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
  node src/jobs/prepare-realworld-detail-queue.js --limit=10000 --output=logs/realworld-detail-queue-10k.txt

Options:
  --limit=N               Number of product URLs to queue. Default: 10000.
  --output=PATH           Newline-delimited queue output file.
  --no-update             Only write queue; do not update MongoDB recency fields.
  --include-out-of-stock  Keep out-of-stock products in queue. Default: excluded.
`);
}

function sortByRealWorldRecency(a, b) {
  return (
    (b.recency.webFreshnessScore - a.recency.webFreshnessScore) ||
    ((b.recency.realWorldYear || 0) - (a.recency.realWorldYear || 0)) ||
    ((b.recency.latestDateMs || 0) - (a.recency.latestDateMs || 0)) ||
    String(a.recency.name || a.recency.slug).localeCompare(String(b.recency.name || b.recency.slug))
  );
}

async function bulkUpdateRecency(collection, items) {
  let updated = 0;

  for (let index = 0; index < items.length; index += 1000) {
    const chunk = items.slice(index, index + 1000);
    const result = await collection.bulkWrite(
      chunk.map(({ doc, recency }) => ({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              realWorldYear: recency.realWorldYear,
              effectiveRealWorldYear: recency.effectiveYear,
              webFreshnessScore: recency.webFreshnessScore,
              webFreshnessReason: recency.webFreshnessReason,
              webFreshnessUpdatedAt: new Date(),
            },
          },
        },
      })),
      { ordered: false }
    );

    updated += result.modifiedCount || result.matchedCount || 0;
  }

  await Promise.all([
    collection.createIndex({ webFreshnessScore: -1, realWorldYear: -1, updatedAt: -1 }, { background: true }),
    collection.createIndex({ realWorldYear: -1 }, { background: true }),
    collection.createIndex({ statusLabel: 1 }, { background: true }),
  ]);

  return updated;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = createMongoClient();
  const config = getMongoConfig();

  await client.connect();

  try {
    const db = client.db(config.dbName);
    const details = db.collection(config.productDetailsCollection);
    const docs = await details
      .find(
        { source: "cellphones" },
        {
          projection: {
            source: 1,
            url: 1,
            sourceUrl: 1,
            inputUrl: 1,
            sourceUrls: 1,
            slug: 1,
            sku: 1,
            name: 1,
            productName: 1,
            title: 1,
            brand: 1,
            brandKey: 1,
            category: 1,
            categories: 1,
            categoryTrail: 1,
            statusLabel: 1,
            storageStatus: 1,
            availability: 1,
            currentPrice: 1,
            price: 1,
            thumbnail: 1,
            image: 1,
            primaryImage: 1,
            images: { $slice: 1 },
            releaseDate: 1,
            publishedAt: 1,
            sourceCapturedAt: 1,
            updatedAt: 1,
            createdAt: 1,
            scrapedAt: 1,
            sitemap: 1,
          },
        }
      )
      .toArray();

    const seenUrls = new Set();
    const items = docs
      .map((doc) => ({ doc, recency: buildRealWorldRecency(doc) }))
      .filter(({ recency }) => recency.url)
      .filter(({ recency }) => args.includeOutOfStock || !recency.isOutOfStock)
      .sort(sortByRealWorldRecency);

    const queue = [];
    for (const item of items) {
      const url = normalizeCellphonesUrl(item.recency.url);
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      queue.push({ ...item, url });
      if (queue.length >= args.limit) break;
    }

    let updated = 0;
    if (args.update) {
      updated = await bulkUpdateRecency(details, items);
    }

    await fs.mkdir(path.dirname(args.output), { recursive: true });
    await fs.writeFile(args.output, `${queue.map((item) => item.url).join("\n")}\n`, "utf8");

    const yearBuckets = {};
    const statusBuckets = {};
    for (const item of queue) {
      const year = item.recency.realWorldYear || "unknown";
      yearBuckets[year] = (yearBuckets[year] || 0) + 1;
      const status = item.doc.statusLabel || item.doc.availability?.status || "unknown";
      statusBuckets[status] = (statusBuckets[status] || 0) + 1;
    }

    const summary = {
      db: config.dbName,
      collection: config.productDetailsCollection,
      scanned: docs.length,
      candidates: items.length,
      queued: queue.length,
      output: args.output,
      recencyFieldsUpdated: args.update ? updated : 0,
      includeOutOfStock: args.includeOutOfStock,
      yearBuckets,
      statusBuckets,
      top10: queue.slice(0, 10).map((item) => ({
        name: item.recency.name || item.recency.slug,
        url: item.url,
        realWorldYear: item.recency.realWorldYear,
        score: item.recency.webFreshnessScore,
        statusLabel: item.doc.statusLabel || "",
      })),
    };

    await fs.writeFile(`${args.output}.summary.json`, JSON.stringify(summary, null, 2), "utf8");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[fatal]", error);
  process.exit(1);
});
