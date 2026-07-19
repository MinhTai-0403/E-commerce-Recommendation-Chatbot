const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const { hydrateProductDetail } = require("../storage/product-detail-storage");
const { buildProductSpecFacets } = require("../utils/product-spec-facets");

const EXECUTE = process.argv.includes("--execute");
const BATCH_SIZE = 200;
const FACET_VERSION = 8;

async function main() {
  const config = getMongoConfig();
  const client = createMongoClient();
  await client.connect();

  try {
    const details = client.db(config.dbName).collection(config.productDetailsCollection);
    const query = {
      $and: [
        { "specIndex.version": { $ne: FACET_VERSION } },
        {
          $or: [
            { detailBlob: { $exists: true } },
            { "storage.type": { $in: ["inline-gzip", "local-gzip"] } },
            { specifications: { $exists: true } },
          ],
        },
      ],
    };
    const total = await details.countDocuments(query);
    const cursor = details.find(query, {
      projection: {
        detailBlob: 1,
        storage: 1,
        specifications: 1,
        attributes: 1,
        rawProductJsonLd: 1,
        additionalProperty: 1,
        category: 1,
        categories: 1,
        categoryTrail: 1,
        slug: 1,
        name: 1,
        facets: 1,
      },
      batchSize: BATCH_SIZE,
    });

    let scanned = 0;
    let withFacets = 0;
    let withRam = 0;
    let withStorage = 0;
    let withScreen = 0;
    let withBattery = 0;
    let updated = 0;
    let batch = [];

    async function processBatch(manifests) {
      if (!manifests.length) return;
      const indexedAt = new Date();
      const records = await Promise.all(manifests.map(async (manifest) => {
        const detail = await hydrateProductDetail(manifest);
        const computedFacets = buildProductSpecFacets(detail || manifest);
        return {
          manifest,
          facets: {
            ...(manifest.facets || {}),
            ...computedFacets,
            // Luôn ghi lại usage để loại các nhãn cũ được suy luận quá rộng.
            // Với bản ghi không giải nén được detail, giữ usage cũ để tránh làm
            // mất dữ liệu chỉ vì file/blob nguồn tạm thời không khả dụng.
            usage: detail
              ? (Array.isArray(computedFacets.usage) ? computedFacets.usage : [])
              : (Array.isArray(manifest.facets?.usage) ? manifest.facets.usage : []),
          },
        };
      }));

      for (const { facets } of records) {
        const hasFacets = Object.keys(facets).some((key) => key !== "specSource");
        if (hasFacets) withFacets += 1;
        if (facets.ramGb) withRam += 1;
        if (facets.storageGb) withStorage += 1;
        if (facets.screenSizeInch) withScreen += 1;
        if (facets.batteryCapacityMah) withBattery += 1;
      }

      if (EXECUTE) {
        const result = await details.bulkWrite(records.map(({ manifest, facets }) => ({
          updateOne: {
            filter: { _id: manifest._id },
            update: {
              $set: {
                facets,
                filterSpecs: facets,
                specIndex: {
                  version: FACET_VERSION,
                  source: facets.specSource || "summary",
                  indexedAt,
                },
              },
            },
          },
        })), { ordered: false });
        updated += result.modifiedCount;
      }

      scanned += records.length;
      if (scanned % 1000 === 0 || scanned === total) {
        console.log(`[facets:v${FACET_VERSION}] ${scanned}/${total} scanned, ${withFacets} with facets, RAM ${withRam}, storage ${withStorage}, screen ${withScreen}, battery ${withBattery}`);
      }
    }

    for await (const manifest of cursor) {
      batch.push(manifest);
      if (batch.length >= BATCH_SIZE) {
        await processBatch(batch);
        batch = [];
      }
    }
    await processBatch(batch);
    if (EXECUTE) {
      await Promise.all([
        details.createIndex({ category: 1, "facets.ramGb": 1 }, { name: "product_details_category_ram" }),
        details.createIndex({ category: 1, "facets.storageGb": 1 }, { name: "product_details_category_storage" }),
        details.createIndex({ category: 1, "facets.screenSizeInch": 1 }, { name: "product_details_category_screen_size" }),
        details.createIndex({ category: 1, "facets.refreshRateHz": 1 }, { name: "product_details_category_refresh_rate" }),
        details.createIndex({ category: 1, "facets.batteryCapacityMah": -1 }, { name: "product_details_category_battery" }),
        details.createIndex({ category: 1, "facets.display": 1 }, { name: "product_details_category_display" }),
        details.createIndex({ category: 1, "facets.camera": 1 }, { name: "product_details_category_camera" }),
        details.createIndex({ category: 1, "facets.special": 1 }, { name: "product_details_category_special" }),
        details.createIndex({ category: 1, "facets.usage": 1 }, { name: "product_details_category_usage" }),
      ]);
    }

    console.log(JSON.stringify({ execute: EXECUTE, version: FACET_VERSION, total, scanned, withFacets, withRam, withStorage, withScreen, withBattery, updated }, null, 2));
    if (!EXECUTE) console.log("Dry run only. Add --execute to write facets to MongoDB.");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
