const fs = require("fs/promises");
const path = require("path");
const { createMongoClient, getMongoConfig } = require("./mongodb");

const DEFAULT_CUTOFF = "2025-07-01";
const LOW_PRIORITY_CATEGORIES = new Set(["Phụ kiện", "Hàng cũ"]);
const CATEGORY_PRIORITY = [
  "Điện thoại",
  "Máy tính bảng",
  "Laptop",
  "Âm thanh",
  "Tivi",
  "Đồ gia dụng",
  "Nhà thông minh",
  "Điều hòa - Máy lạnh",
  "Màn hình",
  "Linh kiện máy tính",
  "Máy ảnh",
  "Đồng hồ thông minh",
  "Sim 4G",
  "Phụ kiện",
  "Hàng cũ",
];

function parseArgs(argv) {
  const args = {
    output: "",
    cutoff: DEFAULT_CUTOFF,
    limit: 0,
    maxAccessory: 0,
    maxUsed: 0,
    includeLowPriority: true,
  };

  for (const arg of argv) {
    const [name, value] = arg.split("=");
    if (name === "--output" && value) args.output = value;
    else if (name === "--cutoff" && value) args.cutoff = value;
    else if (name === "--limit" && value) args.limit = Math.max(0, Number(value || 0));
    else if (name === "--max-accessory" && value) args.maxAccessory = Math.max(0, Number(value || 0));
    else if (name === "--max-used" && value) args.maxUsed = Math.max(0, Number(value || 0));
    else if (arg === "--exclude-low-priority") args.includeLowPriority = false;
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
  node src/build-rich-detail-queue.js --output=logs/rich-detail-queue.txt

Options:
  --output=PATH            Newline-delimited URL output file.
  --cutoff=YYYY-MM-DD      Recent product cutoff. Default: ${DEFAULT_CUTOFF}.
  --limit=N                Limit total URLs. Default: all.
  --max-accessory=N        Cap Phụ kiện URLs. Default: no cap.
  --max-used=N             Cap Hàng cũ URLs. Default: no cap.
  --exclude-low-priority   Drop Phụ kiện and Hàng cũ.
`);
}

function categoryRank(category = "") {
  const index = CATEGORY_PRIORITY.indexOf(category);
  if (index >= 0) return index;
  return CATEGORY_PRIORITY.length - 2;
}

function getCategory(product = {}) {
  return product.category || product.categories?.[0] || "Khác";
}

function detailWeakness(detail) {
  if (!detail) return 0;
  let weakness = 0;
  const counts = detail.counts || {};
  const jsonBytes = Number(detail.storage?.jsonBytes || 0);

  if (!detail.hasArticleHtml) weakness += 4;
  if (!counts.variants) weakness += 2;
  if (!counts.colors) weakness += 2;
  if (!counts.promotions) weakness += 2;
  if (!counts.faqs) weakness += 1;
  if (jsonBytes < 5000) weakness += 3;
  else if (jsonBytes < 15000) weakness += 1;

  return -weakness;
}

function productUrl(product = {}) {
  return product.url || product.sourceUrls?.[0] || "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = args.output || path.join("logs", `rich-detail-queue-${Date.now()}.txt`);
  const cutoff = new Date(`${args.cutoff}T00:00:00.000Z`);
  const config = getMongoConfig();
  const client = createMongoClient();

  await client.connect();
  try {
    const db = client.db(config.dbName);
    const products = db.collection(config.productsCollection);
    const details = db.collection(config.productDetailsCollection);
    const query = {
      source: "cellphones",
      url: { $exists: true, $ne: "" },
      $and: [
        {
          $or: [
            { availability: "InStock" },
            { "availability.status": "InStock" },
            { inStock: true },
          ],
        },
        {
          $or: [
            { currentPrice: { $gt: 0 } },
            { price: { $gt: 0 } },
          ],
        },
        {
          $or: [
            { updatedAt: { $gte: cutoff } },
            { scrapedAt: { $gte: cutoff } },
            { detailSyncedAt: { $gte: cutoff } },
            { "sitemap.lastmod": { $gte: args.cutoff } },
          ],
        },
      ],
    };

    const productDocs = await products
      .find(query, {
        projection: {
          url: 1,
          sourceUrls: 1,
          slug: 1,
          sku: 1,
          name: 1,
          category: 1,
          categories: 1,
          currentPrice: 1,
          price: 1,
          updatedAt: 1,
        },
      })
      .toArray();
    const slugs = [...new Set(productDocs.flatMap((item) => [item.slug, item.sku]).filter(Boolean))];
    const detailDocs = [];

    for (let index = 0; index < slugs.length; index += 500) {
      const batch = slugs.slice(index, index + 500);
      detailDocs.push(
        ...(await details
          .find(
            { slug: { $in: batch } },
            { projection: { slug: 1, counts: 1, hasArticleHtml: 1, storage: 1 } }
          )
          .toArray())
      );
    }

    const detailBySlug = new Map(detailDocs.map((detail) => [detail.slug, detail]));
    const categoryCounts = new Map();
    const lowPriorityCounts = { accessory: 0, used: 0 };
    const seenUrls = new Set();
    const items = productDocs
      .map((product) => {
        const url = productUrl(product);
        const category = getCategory(product);
        const detail = detailBySlug.get(product.slug) || detailBySlug.get(product.sku);

        return {
          product,
          url,
          category,
          detail,
          lowPriority: LOW_PRIORITY_CATEGORIES.has(category),
          sortKey: [
            LOW_PRIORITY_CATEGORIES.has(category) ? 1 : 0,
            categoryRank(category),
            detailWeakness(detail),
            String(product.name || product.slug || ""),
          ],
        };
      })
      .filter((item) => item.url)
      .sort((a, b) => {
        for (let index = 0; index < a.sortKey.length; index += 1) {
          if (a.sortKey[index] < b.sortKey[index]) return -1;
          if (a.sortKey[index] > b.sortKey[index]) return 1;
        }
        return 0;
      });

    const selected = [];
    for (const item of items) {
      if (seenUrls.has(item.url)) continue;
      if (!args.includeLowPriority && item.lowPriority) continue;
      if (item.category === "Phụ kiện" && args.maxAccessory > 0 && lowPriorityCounts.accessory >= args.maxAccessory) continue;
      if (item.category === "Hàng cũ" && args.maxUsed > 0 && lowPriorityCounts.used >= args.maxUsed) continue;

      selected.push(item);
      seenUrls.add(item.url);
      categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + 1);
      if (item.category === "Phụ kiện") lowPriorityCounts.accessory += 1;
      if (item.category === "Hàng cũ") lowPriorityCounts.used += 1;
      if (args.limit > 0 && selected.length >= args.limit) break;
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${selected.map((item) => item.url).join("\n")}\n`);

    const summary = {
      output: outputPath,
      totalCandidates: productDocs.length,
      selected: selected.length,
      cutoff: args.cutoff,
      lowPriorityLast: true,
      categoryCounts: Object.fromEntries([...categoryCounts.entries()].sort((a, b) => b[1] - a[1])),
      firstUrl: selected[0]?.url || null,
      lastUrl: selected[selected.length - 1]?.url || null,
    };

    await fs.writeFile(`${outputPath}.summary.json`, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
