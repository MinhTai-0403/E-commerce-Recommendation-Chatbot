const { createMongoClient, getMongoConfig } = require("../config/mongodb");

async function main() {
  const client = createMongoClient();
  const { dbName, productsCollection } = getMongoConfig();

  try {
    await client.connect();
    const db = client.db(dbName);
    const products = db.collection(productsCollection);
    const errors = db.collection(`${productsCollection}_errors`);
    const productCount = await products.countDocuments({ source: "cellphones" });
    const labeledCount = await products.countDocuments({
      source: "cellphones",
      trainingLabels: { $exists: true },
    });
    const errorCount = await errors.countDocuments({ source: "cellphones" });
    const sample = await products.findOne(
      { source: "cellphones" },
      {
        projection: {
          _id: 0,
          url: 1,
          name: 1,
          brand: 1,
          price: 1,
          priceCurrency: 1,
          availability: 1,
          categories: 1,
          primaryImage: 1,
          sourceUrls: 1,
          scrapedAt: 1,
          trainingLabels: 1,
        },
      }
    );

    console.log(`Database: ${dbName}`);
    console.log(`Products collection: ${productsCollection}`);
    console.log(`CellphoneS products: ${productCount}`);
    console.log(`CellphoneS labeled products: ${labeledCount}`);
    console.log(`CellphoneS scrape errors: ${errorCount}`);
    console.log("Sample product:");
    console.log(JSON.stringify(sample, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
