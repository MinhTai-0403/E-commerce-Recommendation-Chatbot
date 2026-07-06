const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const { extractCellphonesDetails } = require("../cellphones/cellphones-detail-extractor");
const {
  buildProductDetailManifest,
  writeProductDetailFile,
} = require("../storage/product-detail-storage");
const { ProxyAgent } = require("undici");
const fs = require("fs/promises");

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function parseArgs(argv) {
  const args = {
    urls: [],
    limit: 20,
    timeoutMs: 30000,
    dryRun: false,
    includeHtml: false,
    fromProducts: false,
    urlFile: "",
    syncProducts: true,
    batchSize: 25,
    concurrency: 4,
    retries: 2,
    rescrape: false,
    failFast: false,
    proxyInput: "",
    noProxy: false,
    shards: 1,
    shardIndex: 0,
  };

  for (const arg of argv) {
    const [name, value] = arg.split("=");
    if (name === "--url" && value) args.urls.push(value);
    else if (name === "--urls" && value) args.urls.push(...value.split(",").filter(Boolean));
    else if (name === "--url-file" && value) args.urlFile = value;
    else if (name === "--limit") args.limit = parseLimit(value || 20);
    else if (name === "--timeout-ms") args.timeoutMs = Math.max(1000, Number(value || 30000));
    else if (name === "--batch-size") args.batchSize = Math.max(1, Number(value || 25));
    else if (name === "--concurrency") args.concurrency = Math.max(1, Math.min(50, Number(value || 4)));
    else if (name === "--retries") args.retries = Math.max(0, Number(value || 2));
    else if (name === "--shards") args.shards = Math.max(1, Number(value || 1));
    else if (name === "--shard-index") args.shardIndex = Math.max(0, Number(value || 0));
    else if ((name === "--proxy" || name === "--proxies") && value) args.proxyInput = value;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--fail-fast") args.failFast = true;
    else if (arg === "--no-proxy") args.noProxy = true;
    else if (arg === "--rescrape") args.rescrape = true;
    else if (arg === "--include-html") args.includeHtml = true;
    else if (arg === "--from-products") args.fromProducts = true;
    else if (arg === "--no-sync-products") args.syncProducts = false;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  if (args.shardIndex >= args.shards) {
    throw new Error("--shard-index must be smaller than --shards.");
  }

  return args;
}

function parseLimit(value) {
  if (String(value).toLowerCase() === "all") return Number.MAX_SAFE_INTEGER;
  return Math.max(1, Number(value || 20));
}

function createProxyPool(input = "") {
  return String(input || "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const proxyUrl = normalizeProxyUrl(entry);
      const parsed = new URL(proxyUrl);
      return {
        id: `${parsed.hostname}:${parsed.port}`,
        agent: new ProxyAgent(proxyUrl),
      };
    });
}

function normalizeProxyUrl(entry) {
  if (/^https?:\/\//i.test(entry)) return entry;

  const [host, port, username, ...passwordParts] = entry.split(":");
  if (!host || !port) {
    throw new Error("Invalid proxy format. Use host:port:user:password.");
  }

  if (!username) return `http://${host}:${port}`;

  const password = passwordParts.join(":");
  return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
}

function hashString(value = "") {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextProxy(args) {
  const pool = args.proxyPool || [];
  if (pool.length === 0) return null;

  const proxy = pool[args.proxyCursor % pool.length];
  args.proxyCursor += 1;
  return proxy;
}

function shouldRetryScrapeError(error) {
  if (!error?.statusCode) return true;
  if ([404, 410].includes(error.statusCode)) return false;
  return [403, 408, 425, 429, 500, 502, 503, 504, 520, 522, 524].includes(error.statusCode);
}

function printHelp() {
  console.log(`
Usage:
  npm run scrape:cellphones:details -- --url=https://cellphones.com.vn/iphone-17-pro-max.html

Options:
  --url=URL         Scrape one product detail page. Can be repeated.
  --urls=A,B       Scrape multiple comma-separated URLs.
  --url-file=PATH   Scrape URLs from a newline-delimited file.
  --from-products  Pull product URLs from MongoDB products collection.
  --limit=N        Max products when using --from-products. Default: 20.
  --dry-run        Print extracted details without writing MongoDB.
  --include-html   Store article HTML blocks in addition to text.
  --batch-size=N   Save to MongoDB every N products. Default: 25.
  --concurrency=N  Number of product pages to fetch at once. Default: 4.
  --retries=N      Retry failed network/429/5xx requests with another proxy. Default: 2.
  --proxies=LIST   Comma-separated proxies. Defaults to SCRAPER_PROXIES from .env.
  --no-proxy       Ignore SCRAPER_PROXIES and fetch directly.
  --shards=N       Split product URL list into N deterministic workers. Default: 1.
  --shard-index=N  Worker index from 0 to N-1. Default: 0.
  --rescrape       Include products already present in details collection.
  --fail-fast      Stop on the first failed URL. Default: skip failed URLs.
  --no-sync-products
                   Only write details collection, skip products summary upsert.
  --timeout-ms=N   Fetch timeout. Default: 30000.
`);
}

async function fetchHtml(url, args) {
  const proxy = nextProxy(args);
  const fetchOptions = {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "vi,en;q=0.8",
      "user-agent": process.env.SCRAPER_USER_AGENT || DEFAULT_USER_AGENT,
    },
    signal: AbortSignal.timeout(args.timeoutMs),
  };

  if (proxy) fetchOptions.dispatcher = proxy.agent;

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    error.statusCode = response.status;
    error.proxyId = proxy?.id;
    throw error;
  }

  return response.text();
}

async function scrapeDetailUrl(url, args) {
  let lastError = null;
  const attempts = Math.max(1, args.retries + 1);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      console.log(`[details] Scraping ${url}${attempt > 1 ? ` (retry ${attempt - 1})` : ""}`);
      const html = await fetchHtml(url, args);
      return extractCellphonesDetails(html, url, { includeHtml: args.includeHtml });
    } catch (error) {
      lastError = error;
      if (!shouldRetryScrapeError(error) || attempt === attempts) break;
      console.warn(
        `[retry] ${url}: ${error.message}${error.proxyId ? ` via ${error.proxyId}` : ""}`
      );
    }
  }

  throw lastError;
}

async function urlsFromProducts(db, args) {
  const { productsCollection, productDetailsCollection } = getMongoConfig();
  const products = db.collection(productsCollection);
  const details = db.collection(productDetailsCollection);
  const existingUrls = new Set();

  if (!args.rescrape) {
    const urlCursor = details.find({}, { projection: { url: 1 } }).batchSize(1000);
    for await (const doc of urlCursor) {
      if (doc.url) existingUrls.add(doc.url);
    }
  }

  const urls = [];
  const cursor = products
    .find(
      { source: "cellphones", url: { $exists: true, $ne: "" } },
      { projection: { url: 1, sourceUrls: 1 } }
    )
    .sort({ _id: 1 })
    .batchSize(500);

  for await (const doc of cursor) {
    const url = doc.url || (doc.sourceUrls || [])[0];
    if (!url || existingUrls.has(url)) continue;
    if (args.shards > 1 && hashString(url) % args.shards !== args.shardIndex) continue;
    urls.push(url);
    existingUrls.add(url);
    if (urls.length >= args.limit) break;
  }

  return urls;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const proxySource = args.noProxy
    ? ""
    : args.proxyInput || process.env.SCRAPER_PROXIES || "";
  args.proxyPool = createProxyPool(proxySource);
  args.proxyCursor = 0;
  const client = createMongoClient();
  const { dbName, productsCollection, productDetailsCollection } = getMongoConfig();

  try {
    await client.connect();
    const db = client.db(dbName);
    const fileUrls = args.urlFile
      ? (await fs.readFile(args.urlFile, "utf8"))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
      : [];
    const urls = args.fromProducts
      ? await urlsFromProducts(db, args)
      : [...new Set([...args.urls, ...fileUrls])];

    if (urls.length === 0) {
      throw new Error("Missing URL. Use --url=... or --from-products.");
    }

    console.log(
      `[start] ${urls.length} URL(s), concurrency=${args.concurrency}, ` +
        `batchSize=${args.batchSize}, proxies=${args.proxyPool.length}, ` +
        `shard=${args.shardIndex}/${args.shards}, rescrape=${args.rescrape}`
    );

    const details = [];
    const failed = [];
    const totals = {
      detailInserted: 0,
      detailUpdated: 0,
      productInserted: 0,
      productUpdated: 0,
    };
    let nextUrlIndex = 0;
    let processedCount = 0;
    let flushChain = Promise.resolve();
    let fatalError = null;

    if (!args.dryRun) {
      await prepareIndexes(db, args);
    }

    const flushPendingDetails = async (force = false) => {
      if (args.dryRun) return;
      if (!force && details.length < args.batchSize) return;

      const batchSize = force ? details.length : args.batchSize;
      const batch = details.splice(0, batchSize);
      if (batch.length === 0) return;

      const writeTask = flushChain.then(() => saveDetailsBatch(db, batch, args));
      flushChain = writeTask.catch(() => {});
      addWriteCounts(totals, await writeTask);
    };

    const logProgress = () => {
      if (processedCount % 100 !== 0 && processedCount !== urls.length) return;
      console.log(
        `[progress] ${processedCount}/${urls.length} processed, ` +
          `${details.length} pending, ${failed.length} failed`
      );
    };

    const workerCount = Math.min(args.concurrency, urls.length);
    async function runWorker(workerIndex) {
      while (!fatalError) {
        const index = nextUrlIndex;
        nextUrlIndex += 1;
        if (index >= urls.length) return;

        const url = urls[index];
        try {
          const detail = await scrapeDetailUrl(url, args);
          details.push(detail);
          await flushPendingDetails(false);
        } catch (error) {
          failed.push({ url, error: error.message });
          console.warn(`[warn] Worker ${workerIndex} skipped ${url}: ${error.message}`);
          if (args.failFast) {
            fatalError = error;
            throw error;
          }
        } finally {
          processedCount += 1;
          logProgress();
        }
      }
    }

    await Promise.all(
      Array.from({ length: workerCount }, (_, index) => runWorker(index + 1))
    );

    if (args.dryRun) {
      console.log(JSON.stringify({ details, failed }, null, 2));
      return;
    }

    await flushPendingDetails(true);
    await flushChain;

    console.log(
      `[done] Details saved to ${dbName}.${productDetailsCollection}: ` +
        `${totals.detailInserted} inserted, ${totals.detailUpdated} updated`
    );
    if (args.syncProducts) {
      console.log(
        `[done] Product summaries synced to ${dbName}.${productsCollection}: ` +
          `${totals.productInserted} inserted, ${totals.productUpdated} updated`
      );
    }
    if (failed.length > 0) {
      console.warn(`[done] Skipped ${failed.length} failed URL(s). First failed: ${failed[0].url} (${failed[0].error})`);
    }
  } finally {
    await client.close();
  }
}

async function prepareIndexes(db, args) {
  const { productsCollection, productDetailsCollection } = getMongoConfig();
  const detailsCollection = db.collection(productDetailsCollection);

  await ensureIndex(detailsCollection, { source: 1, slug: 1 }, { unique: true });
  await ensureIndex(detailsCollection, { url: 1 });
  await ensureIndex(detailsCollection, { sourceUrls: 1 });
  await ensureIndex(detailsCollection, { "storage.path": 1 });

  if (args.syncProducts) {
    const products = db.collection(productsCollection);
    await ensureIndex(products, { source: 1, slug: 1 }, { unique: true });
    await ensureIndex(products, { source: 1, url: 1 });
  }
}

async function saveDetailsBatch(db, details, args) {
  if (!details.length) {
    return {
      detailInserted: 0,
      detailUpdated: 0,
      productInserted: 0,
      productUpdated: 0,
    };
  }

  const { productsCollection, productDetailsCollection } = getMongoConfig();
  const detailsCollection = db.collection(productDetailsCollection);
  const manifestDocs = [];

  for (const detail of details) {
    const storage = await writeProductDetailFile(detail);
    manifestDocs.push(buildProductDetailManifest(detail, storage));
  }

  const detailsResult = await detailsCollection.bulkWrite(
    manifestDocs.map((doc) => ({
      updateOne: {
        filter: { source: doc.source, slug: doc.slug },
        update: {
          $set: {
            ...doc,
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

  const counts = {
    detailInserted: detailsResult.upsertedCount || 0,
    detailUpdated: detailsResult.modifiedCount || 0,
    productInserted: 0,
    productUpdated: 0,
  };

  if (args.syncProducts) {
    const products = db.collection(productsCollection);
    for (const detail of details) {
      const productResult = await syncProductSummary(products, buildProductSummaryFromDetail(detail));
      counts.productInserted += productResult.inserted;
      counts.productUpdated += productResult.updated;
    }
  }

  console.log(`[batch] Saved ${details.length} detail file(s) + manifest(s)`);
  return counts;
}

async function syncProductSummary(products, summary) {
  const now = new Date();
  const sourceUrls = [...new Set([summary.url, ...(summary.sourceUrls || [])].filter(Boolean))];
  const existing = await findExistingProductForSummary(products, summary, sourceUrls);
  const updateSummary = {
    ...summary,
    sourceUrls,
    updatedAt: now,
    detailSyncedAt: now,
  };

  if (existing?.url && sourceUrls.includes(existing.url) && existing.slug && existing.slug !== summary.slug) {
    updateSummary.slug = existing.slug;
    updateSummary.sku = existing.sku || existing.slug;
    updateSummary.detailSlug = summary.slug;
  }

  try {
    if (existing?._id) {
      const result = await products.updateOne(
        { _id: existing._id },
        {
          $set: updateSummary,
          $unset: productDetailFieldUnset(),
        }
      );
      return { inserted: 0, updated: result.modifiedCount || result.matchedCount || 0 };
    }

    const result = await products.updateOne(
      { source: summary.source, slug: summary.slug },
      {
        $set: updateSummary,
        $unset: productDetailFieldUnset(),
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );

    return {
      inserted: result.upsertedCount || 0,
      updated: result.upsertedCount ? 0 : result.modifiedCount || result.matchedCount || 0,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error) || sourceUrls.length === 0) throw error;

    const duplicate = await products.findOne({ url: { $in: sourceUrls } });
    if (!duplicate?._id) throw error;

    updateSummary.slug = duplicate.slug || updateSummary.slug;
    updateSummary.sku = duplicate.sku || updateSummary.sku;
    updateSummary.detailSlug = summary.slug;

    const result = await products.updateOne(
      { _id: duplicate._id },
      {
        $set: updateSummary,
        $unset: productDetailFieldUnset(),
      }
    );
    return { inserted: 0, updated: result.modifiedCount || result.matchedCount || 0 };
  }
}

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

async function findExistingProductForSummary(products, summary, sourceUrls) {
  if (sourceUrls.length > 0) {
    const byUrl = await products.findOne({ url: { $in: sourceUrls } });
    if (byUrl) return byUrl;

    const bySourceUrl = await products.findOne({ sourceUrls: { $in: sourceUrls } });
    if (bySourceUrl) return bySourceUrl;
  }

  return products.findOne({ source: summary.source, slug: summary.slug });
}

function isDuplicateKeyError(error) {
  return error?.code === 11000 || /E11000|duplicate key/i.test(error?.message || "");
}

function addWriteCounts(total, delta) {
  total.detailInserted += delta.detailInserted;
  total.detailUpdated += delta.detailUpdated;
  total.productInserted += delta.productInserted;
  total.productUpdated += delta.productUpdated;
}

async function ensureIndex(collection, keys, options = {}) {
  try {
    await collection.createIndex(keys, options);
  } catch (error) {
    const conflictCodes = new Set([68, 85]);
    const conflictNames = new Set(["IndexKeySpecsConflict", "IndexOptionsConflict"]);
    const isConflict =
      conflictCodes.has(error.code) ||
      conflictNames.has(error.codeName) ||
      /existing index|same name|already exists|equivalent index/i.test(error.message || "");

    if (!isConflict) throw error;

    console.warn(
      `[index] Skipped ${collection.collectionName} ${JSON.stringify(keys)}: ` +
        `${error.codeName || error.message}`
    );
  }
}

function buildProductSummaryFromDetail(detail) {
  const productNameKey = normalizeComparableText(detail.name || detail.productName || "");
  const categories = (detail.categoryTrail || [])
    .map((item) => item.name)
    .filter((name) => {
      if (!name || ["Trang chủ", "CELLPHONES"].includes(name)) return false;
      return normalizeComparableText(name) !== productNameKey;
    });
  return {
    source: detail.source || "cellphones",
    url: detail.url || detail.sourceUrl,
    sourceUrls: [...new Set([detail.url, detail.sourceUrl, detail.inputUrl].filter(Boolean))],
    slug: detail.slug,
    sku: detail.sku || detail.slug,
    name: detail.name || detail.productName,
    brand: detail.brand,
    brandKey: detail.brandKey,
    price: detail.currentPrice,
    currentPrice: detail.currentPrice,
    originalPrice: detail.originalPrice,
    priceCurrency: "VND",
    availability: {
      status: detail.statusLabel === "Còn hàng" ? "InStock" : detail.statusLabel || "Unknown",
      raw: detail.statusLabel,
    },
    categories,
    breadcrumbs: (detail.categoryTrail || []).map((item, index) => ({
      position: index + 1,
      name: item.name,
      url: item.href,
    })),
    primaryImage: detail.thumbnail || detail.image,
    images: Array.isArray(detail.images) ? detail.images.slice(0, 5) : [],
    description: detail.meta?.description || "",
    rating: detail.rating,
    ratingCount: detail.ratingCount,
    detailAvailable: true,
    detailStorage: "local-gzip",
    sourceCapturedAt: detail.sourceCapturedAt,
    scrapedAt: detail.scrapedAt,
  };
}

function normalizeComparableText(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

main().catch((error) => {
  console.error("[fatal]", error.message);
  process.exit(1);
});
