const path = require("path");
const fs = require("fs/promises");
const { createMongoClient, getMongoConfig } = require("./mongodb");
const { repairObjectText } = require("./text-utils");

function parseLimit(argv) {
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const parsed = Number(limitArg ? limitArg.split("=")[1] : 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 10;
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  const client = createMongoClient();
  const { dbName, productsCollection } = getMongoConfig();

  try {
    await client.connect();
    const db = client.db(dbName);
    const products = db.collection(productsCollection);
    const totalProducts = await products.countDocuments({ source: "cellphones" });
    const sampleProducts = await products
      .find(
        { source: "cellphones" },
        {
          projection: {
            _id: 0,
            source: 1,
            url: 1,
            name: 1,
            brand: 1,
            sku: 1,
            price: 1,
            priceCurrency: 1,
            availability: 1,
            categories: 1,
            primaryImage: 1,
            images: { $slice: 3 },
            sourceUrls: 1,
            scrapedAt: 1,
          },
        }
      )
      .sort({ scrapedAt: -1, name: 1 })
      .limit(limit)
      .toArray();

    const output = repairObjectText({
      exportedAt: new Date().toISOString(),
      source: "cellphones",
      database: dbName,
      collection: productsCollection,
      totalProducts,
      sampleSize: sampleProducts.length,
      products: sampleProducts,
    });

    const outputPath = path.join(
      process.cwd(),
      "data",
      "cellphones-products.sample.json"
    );
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

    console.log(`Exported ${sampleProducts.length} sample products to ${outputPath}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
