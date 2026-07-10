const { createMongoClient, getMongoConfig } = require("../config/mongodb");

const COUNT_FIELDS = [
  "media",
  "highlights",
  "variants",
  "colors",
  "promotions",
  "specifications",
  "relatedProducts",
  "news",
  "faqs",
];

function weakExpression(minJsonBytes = 5000) {
  return {
    $or: [
      { detailBlob: { $exists: false } },
      { "storage.jsonBytes": { $exists: false } },
      {
        $expr: {
          $eq: [
            {
              $add: COUNT_FIELDS.map((field) => ({
                $ifNull: [`$counts.${field}`, 0],
              })),
            },
            0,
          ],
        },
      },
    ],
  };
}

async function main() {
  const minArg = process.argv.slice(2).find((arg) => arg.startsWith("--min-json-bytes="));
  const minJsonBytes = Math.max(0, Number(minArg?.split("=")[1] || 5000));
  const client = createMongoClient();
  const config = getMongoConfig();

  await client.connect();
  try {
    const db = client.db(config.dbName);
    const details = db.collection(config.productDetailsCollection);
    const base = { source: "cellphones" };
    const [total, weak, inline, local, dbStats] = await Promise.all([
      details.countDocuments(base),
      details.countDocuments({
        ...base,
        url: { $exists: true, $ne: "" },
        ...weakExpression(minJsonBytes),
      }),
      details.countDocuments({ ...base, "storage.type": "inline-gzip", detailBlob: { $exists: true } }),
      details.countDocuments({ ...base, "storage.type": "local-gzip" }),
      db.command({ dbStats: 1, scale: 1024 * 1024 }).catch(() => ({})),
    ]);

    const summary = {
      database: config.dbName,
      collection: config.productDetailsCollection,
      total,
      rich: Math.max(0, total - weak),
      weak,
      inline,
      local,
      minJsonBytes,
      databaseSizeMB: {
        data: Number(dbStats.dataSize || 0),
        indexes: Number(dbStats.indexSize || 0),
        logicalTotal: Number(dbStats.dataSize || 0) + Number(dbStats.indexSize || 0),
        storage: Number(dbStats.storageSize || 0),
      },
      checkedAt: new Date().toISOString(),
    };

    console.log(JSON.stringify(summary));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`[failed] ${error.message}`);
  process.exitCode = 1;
});
