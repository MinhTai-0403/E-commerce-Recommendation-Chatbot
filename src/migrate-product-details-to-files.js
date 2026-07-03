const { createMongoClient, getMongoConfig } = require("./mongodb");
const {
  buildProductDetailManifest,
  getDetailStorageRoot,
  writeProductDetailFile,
} = require("./product-detail-storage");

const BATCH_SIZE = Number(process.env.DETAIL_MIGRATION_BATCH_SIZE || 250);

function productDetailFieldUnset() {
  return {
    media: "",
    highlights: "",
    variants: "",
    colors: "",
    promotions: "",
    policies: "",
    specifications: "",
    relatedProducts: "",
    articleSections: "",
    faqs: "",
  };
}

async function insertManifests(collection, manifests) {
  for (let offset = 0; offset < manifests.length; offset += BATCH_SIZE) {
    const batch = manifests.slice(offset, offset + BATCH_SIZE);
    await collection.bulkWrite(
      batch.map((manifest) => ({
        updateOne: {
          filter: { source: manifest.source, slug: manifest.slug },
          update: {
            $set: {
              ...manifest,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    console.log(`[manifest] inserted/upserted ${Math.min(offset + BATCH_SIZE, manifests.length)}/${manifests.length}`);
  }
}

async function main() {
  const client = createMongoClient();
  const { dbName, productsCollection, productDetailsCollection } = getMongoConfig();

  await client.connect();

  try {
    const db = client.db(dbName);
    const details = db.collection(productDetailsCollection);
    const products = db.collection(productsCollection);
    const total = await details.countDocuments({});
    const manifests = [];
    let migrated = 0;

    console.log(`[start] Migrating ${total} detail document(s) to ${getDetailStorageRoot()}`);

    const cursor = details.find({}, { batchSize: 100 });
    for await (const doc of cursor) {
      const storage = await writeProductDetailFile(doc);
      manifests.push(buildProductDetailManifest(doc, storage));
      migrated += 1;
      if (migrated % 250 === 0) console.log(`[files] wrote ${migrated}/${total}`);
    }

    console.log(`[files] wrote ${migrated}/${total}`);
    console.log(`[drop] Dropping ${dbName}.${productDetailsCollection}`);
    try {
      await details.drop();
    } catch (error) {
      if (error.codeName !== "NamespaceNotFound") throw error;
    }

    const manifestCollection = db.collection(productDetailsCollection);
    await insertManifests(manifestCollection, manifests);
    await manifestCollection.createIndex({ source: 1, slug: 1 }, { unique: true });
    await manifestCollection.createIndex({ url: 1 });
    await manifestCollection.createIndex({ "storage.path": 1 });

    console.log("[cleanup] Removing heavy detail fields from product summaries");
    const cleanup = await products.updateMany(
      { source: "cellphones" },
      {
        $unset: productDetailFieldUnset(),
      }
    );

    console.log(
      `[done] Migrated ${migrated} detail(s). ` +
        `Product summaries cleaned: ${cleanup.modifiedCount || cleanup.matchedCount || 0}.`
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[fatal]", error.stack || error.message);
  process.exit(1);
});
