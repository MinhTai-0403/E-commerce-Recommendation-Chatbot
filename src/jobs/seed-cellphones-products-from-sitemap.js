const { XMLParser } = require("fast-xml-parser");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const { buildRealWorldRecency } = require("../cellphones/realworld-product-recency");
const { repairObjectText } = require("../utils/text-utils");

const SITE_ORIGIN = "https://cellphones.com.vn";
const SOURCE_SITE = "cellphones";
const DEFAULT_TARGET = 40000;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function parseArgs(argv) {
  const args = {
    target: DEFAULT_TARGET,
    startSitemap: 0,
    endSitemap: 61,
    batchSize: 1000,
    timeoutMs: 20000,
    urls: [],
  };

  for (const arg of argv) {
    const [name, value] = arg.split("=");
    if (name === "--target") args.target = Number(value || DEFAULT_TARGET);
    else if (name === "--start-sitemap") args.startSitemap = Number(value || 0);
    else if (name === "--end-sitemap") args.endSitemap = Number(value || 61);
    else if (name === "--batch-size") args.batchSize = Number(value || 1000);
    else if (name === "--timeout-ms") args.timeoutMs = Number(value || 20000);
    else if (name === "--urls") {
      args.urls = String(value || "")
        .split(",")
        .map((url) => url.trim())
        .filter((url) => url.startsWith(`${SITE_ORIGIN}/`) && url.endsWith(".html"));
    }
  }

  return args;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()))];
}

function productSitemapUrlByIndex(index) {
  return index === 0
    ? `${SITE_ORIGIN}/sitemap/product-sitemap.xml`
    : `${SITE_ORIGIN}/sitemap/product-sitemap${index + 1}.xml`;
}

function slugFromUrl(url) {
  try {
    return new URL(url).pathname.split("/").pop().replace(/\.html$/, "");
  } catch {
    return null;
  }
}

function titleFromSlug(slug) {
  return String(slug || "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function dateScore(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function yearFromDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
}

async function fetchText(url, timeoutMs) {
  const response = await fetch(url, {
    headers: {
      accept: "application/xml,text/xml,*/*",
      "accept-language": "vi,en;q=0.8",
      "user-agent": process.env.SCRAPER_USER_AGENT || "Mozilla/5.0 (compatible; cosarii-cellphones-sitemap-seeder/1.0)",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseProductSitemap(xml, sitemapUrl, sitemapRank) {
  const parsed = xmlParser.parse(xml);
  const nodes = asArray(parsed.urlset && parsed.urlset.url);

  return nodes
    .map((node, sitemapProductRank) => {
      const url = node.loc;
      if (!url || !url.startsWith(`${SITE_ORIGIN}/`) || !url.endsWith(".html")) {
        return null;
      }

      const images = asArray(node["image:image"])
        .map((image) => image && image["image:loc"])
        .filter(Boolean);

      return {
        url,
        sitemapUrl,
        sitemapRank,
        sitemapProductRank,
        sitemapSortRank: 1_000_000 - sitemapRank * 10_000 - sitemapProductRank,
        sitemapLastmod: node.lastmod || null,
        sitemapImages: uniqueStrings(images),
      };
    })
    .filter(Boolean);
}

function createSeedDoc(entry) {
  const slug = slugFromUrl(entry.url);
  const name = titleFromSlug(slug);
  const primaryImage = entry.sitemapImages[0] || null;
  const now = new Date();

  const doc = {
    source: SOURCE_SITE,
    seedOnly: true,
    seedReason: "sitemap-fast-fill",
    inputUrl: entry.url,
    sourceUrls: [entry.url],
    url: entry.url,
    productUrl: entry.url,
    slug,
    id: slug,
    sku: slug,
    name,
    productName: name,
    title: name,
    description: null,
    brand: null,
    brandName: null,
    brandKey: null,
    price: null,
    currentPrice: null,
    salePrice: null,
    originalPrice: null,
    regularPrice: null,
    priceCurrency: "VND",
    priceRange: { low: null, high: null },
    availability: {
      raw: "sitemap-seed",
      status: "OutOfStock",
    },
    stockStatus: "OutOfStock",
    statusLabel: "Hết hàng",
    sitemapLastmod: entry.sitemapLastmod || null,
    sitemapRank: entry.sitemapRank ?? null,
    sitemapProductRank: entry.sitemapProductRank ?? null,
    sitemapSortRank: entry.sitemapSortRank ?? null,
    webFreshnessScore: dateScore(entry.sitemapLastmod),
    realWorldYear: yearFromDate(entry.sitemapLastmod),
    effectiveRealWorldYear: yearFromDate(entry.sitemapLastmod),
    itemCondition: null,
    images: entry.sitemapImages,
    primaryImage,
    thumbnail: primaryImage,
    image: primaryImage,
    breadcrumbs: [],
    categories: [],
    category: null,
    categoryName: null,
    specifications: [],
    attributes: {},
    rating: { value: null, count: null, best: null, worst: null },
    sitemap: {
      url: entry.sitemapUrl,
      rank: entry.sitemapRank ?? null,
      productRank: entry.sitemapProductRank ?? null,
      sortRank: entry.sitemapSortRank ?? null,
      lastmod: entry.sitemapLastmod,
      images: entry.sitemapImages,
    },
    rawProductJsonLd: null,
    parseWarnings: ["Seeded from sitemap only; pending detail enrichment."],
    scrapedAt: now,
    updatedAt: now,
  };

  const recency = buildRealWorldRecency(doc);
  doc.webFreshnessScore = recency.webFreshnessScore;
  doc.webFreshnessReason = recency.webFreshnessReason;
  doc.realWorldYear = recency.realWorldYear;
  doc.effectiveRealWorldYear = recency.effectiveYear;
  doc.latestDateMs = recency.latestDateMs;

  return repairObjectText(doc);
}

async function ensureIndexes(collection) {
  await collection.createIndex({ url: 1 }, { unique: true });
  await collection.createIndex({ source: 1, slug: 1 });
  await collection.createIndex({ seedOnly: 1 });
}

async function getExistingUrlSet(collection, urls) {
  const existing = new Set();
  const docs = await collection
    .find(
      { $or: [{ url: { $in: urls } }, { sourceUrls: { $in: urls } }] },
      { projection: { url: 1, sourceUrls: 1 } }
    )
    .toArray();

  docs.forEach((doc) => {
    existing.add(doc.url);
    asArray(doc.sourceUrls).forEach((url) => existing.add(url));
  });

  return existing;
}

function productUpsertOps(docs) {
  return docs.map((doc) => ({
    updateOne: {
      filter: { url: doc.url },
      update: {
        $setOnInsert: {
          ...doc,
          createdAt: new Date(),
        },
      },
      upsert: true,
    },
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { dbName, productsCollection } = getMongoConfig();
  const client = createMongoClient();

  await client.connect();
  try {
    const collection = client.db(dbName).collection(productsCollection);
    await ensureIndexes(collection);

    let total = await collection.countDocuments({ source: SOURCE_SITE });
    let inserted = 0;

    console.log(`[seed] Current ${productsCollection}: ${total}`);
    console.log(`[seed] Target: ${args.target}`);

    if (args.urls.length) {
      const entries = args.urls.map((url, index) => ({
        url,
        sitemapUrl: "manual-route-manifest",
        sitemapRank: null,
        sitemapProductRank: index,
        sitemapSortRank: null,
        sitemapLastmod: null,
        sitemapImages: [],
      }));
      const existing = await getExistingUrlSet(collection, args.urls);
      const docs = entries.filter((entry) => !existing.has(entry.url)).map(createSeedDoc);
      if (docs.length) {
        const result = await collection.bulkWrite(productUpsertOps(docs), { ordered: false });
        inserted = result.upsertedCount || 0;
      }
      console.log(`[seed] Explicit URLs=${args.urls.length}, inserted=${inserted}`);
      return;
    }

    for (
      let sitemapRank = args.startSitemap;
      sitemapRank <= args.endSitemap && total < args.target;
      sitemapRank += 1
    ) {
      const sitemapUrl = productSitemapUrlByIndex(sitemapRank);
      const xml = await fetchText(sitemapUrl, args.timeoutMs);
      const entries = parseProductSitemap(xml, sitemapUrl, sitemapRank);
      let sitemapInserted = 0;

      for (let index = 0; index < entries.length && total < args.target; index += args.batchSize) {
        const chunk = entries.slice(index, index + args.batchSize);
        const urls = chunk.map((entry) => entry.url);
        const existing = await getExistingUrlSet(collection, urls);
        const docs = chunk
          .filter((entry) => !existing.has(entry.url))
          .slice(0, args.target - total)
          .map(createSeedDoc);

        if (!docs.length) continue;

        const result = await collection.bulkWrite(productUpsertOps(docs), {
          ordered: false,
        });
        const count = result.upsertedCount || 0;
        inserted += count;
        sitemapInserted += count;
        total += count;
      }

      console.log(
        `[seed] sitemap ${sitemapRank}: ${sitemapInserted} inserted, total=${total}`
      );
    }

    console.log(`[seed] Done. Inserted=${inserted}, total=${total}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
