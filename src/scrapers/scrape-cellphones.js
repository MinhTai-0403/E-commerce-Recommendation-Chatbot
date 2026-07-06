const cheerio = require("cheerio");
const { XMLParser } = require("fast-xml-parser");
const { ProxyAgent } = require("undici");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const { repairMojibake, repairObjectText } = require("../utils/text-utils");

const SITEMAP_INDEX_URL =
  "https://cellphones.com.vn/sitemap/sitemap_index.xml?v=google";
const SITE_ORIGIN = "https://cellphones.com.vn";
const SOURCE_SITE = "cellphones";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; cosarii-cellphones-scraper/1.0)";
const proxyAgents = new Map();
let proxyCursor = Math.floor(Math.random() * 10000);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function parseArgs(argv) {
  const args = {
    limit: null,
    start: 0,
    concurrency: 3,
    delayMs: 500,
    sitemapStart: 0,
    sitemapLimit: null,
    skipExisting: false,
    dryRun: false,
    timeoutMs: 30000,
    retries: 2,
  };

  for (const arg of argv) {
    const [name, value] = arg.split("=");

    if (name === "--limit") args.limit = numberOrNull(value);
    else if (name === "--start") args.start = Number(value || 0);
    else if (name === "--concurrency") args.concurrency = Number(value || 3);
    else if (name === "--delay-ms") args.delayMs = Number(value || 500);
    else if (name === "--sitemap-start") args.sitemapStart = Number(value || 0);
    else if (name === "--sitemap-limit") args.sitemapLimit = numberOrNull(value);
    else if (name === "--timeout-ms") args.timeoutMs = Number(value || 30000);
    else if (name === "--retries") args.retries = Number(value || 2);
    else if (arg === "--skip-existing") args.skipExisting = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  if (args.limit === 0) args.limit = null;
  args.start = Math.max(0, args.start || 0);
  args.concurrency = Math.max(1, args.concurrency || 1);
  args.delayMs = Math.max(0, args.delayMs || 0);
  args.sitemapStart = Math.max(0, args.sitemapStart || 0);
  args.timeoutMs = Math.max(1000, args.timeoutMs || 30000);
  args.retries = Math.max(0, args.retries || 0);

  return args;
}

function numberOrNull(value) {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function printHelp() {
  console.log(`
Usage:
  npm run scrape:cellphones -- [options]

Options:
  --limit=N          Only scrape N products. Omit or use 0 for all products.
  --start=N          Skip the first N product URLs from the sitemap list.
  --concurrency=N    Number of product pages fetched at once. Default: 3.
  --delay-ms=N       Wait this many ms between batches. Default: 500.
  --sitemap-start=N  Skip the first N product sitemaps.
  --sitemap-limit=N  Only read the first N product sitemaps.
  --skip-existing    Skip URLs already present in MongoDB.
  --dry-run          Fetch sitemaps and print sample entries without scraping pages.
  --timeout-ms=N     Fetch timeout per request. Default: 30000.
  --retries=N        Retry failed requests. Default: 2.
`);
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseProxyEntry(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  const parts = raw.split(":");
  if (parts.length < 2) return null;

  const [host, port, username, ...passwordParts] = parts;
  if (!host || !port) return null;

  if (!username) {
    return `http://${host}:${port}`;
  }

  const password = passwordParts.join(":");
  return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
}

function getProxyUrls() {
  return uniqueStrings(
    String(process.env.SCRAPER_PROXIES || "")
      .split(/[\r\n,;\s]+/)
      .map(parseProxyEntry)
      .filter(Boolean)
  );
}

function getNextProxyAgent() {
  const proxies = getProxyUrls();
  if (!proxies.length) return null;

  const proxyUrl = proxies[proxyCursor % proxies.length];
  proxyCursor += 1;

  if (!proxyAgents.has(proxyUrl)) {
    proxyAgents.set(proxyUrl, new ProxyAgent(proxyUrl));
  }

  return proxyAgents.get(proxyUrl);
}

async function retryOperation(label, operation, retries = 3) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < retries && isRetryableOperationError(error)) {
        const waitMs = 1000 * (attempt + 1);
        console.warn(`[retry] ${label} failed: ${error.message}. Retrying in ${waitMs}ms.`);
        await sleep(waitMs);
        continue;
      }

      break;
    }
  }

  throw lastError;
}

function isRetryableOperationError(error) {
  const message = (error && error.message ? error.message : "").toLowerCase();

  return (
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("connection") ||
    message.includes("network") ||
    message.includes("timeout")
  );
}

function isBotChallenge(text) {
  const sample = String(text || "").slice(0, 12000).toLowerCase();

  return (
    sample.includes("<html") &&
    sample.includes("captcha") &&
    sample.includes("verify") &&
    sample.includes("security")
  );
}

function createBotChallengeError(url, status) {
  const error = new Error(
    `Bot protection challenge returned for ${url}. Pause and retry later with lower concurrency.`
  );
  error.status = status;
  error.isBotChallenge = true;
  error.transient = true;
  return error;
}

function formatErrorMessage(error) {
  if (!error) return null;

  const parts = [error.message, error.cause && error.cause.message].filter(Boolean);
  return parts
    .join(" / ")
    .replace(/\/\/([^:\s/@]+):([^@\s]+)@/g, "//***:***@");
}

async function fetchText(url, args, accept = "text/html,application/xhtml+xml") {
  let lastError;

  for (let attempt = 0; attempt <= args.retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept,
          "accept-language": "vi,en;q=0.8",
          "user-agent": process.env.SCRAPER_USER_AGENT || DEFAULT_USER_AGENT,
        },
        dispatcher: getNextProxyAgent() || undefined,
        signal: AbortSignal.timeout(args.timeoutMs),
      });

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      const text = await response.text();

      if (isBotChallenge(text)) {
        throw createBotChallengeError(url, response.status);
      }

      return text;
    } catch (error) {
      lastError = error;
      const retryable =
        error.transient || !error.status || error.status === 429 || error.status >= 500;

      if (attempt < args.retries && retryable) {
        console.warn(
          `[retry] ${url} failed: ${formatErrorMessage(error)}. Retrying...`
        );
        await sleep(800 * (attempt + 1));
        continue;
      }

      break;
    }
  }

  throw lastError;
}

function parseSitemapIndex(xml) {
  const parsed = xmlParser.parse(xml);
  const sitemaps = asArray(parsed.sitemapindex && parsed.sitemapindex.sitemap);

  return sitemaps
    .map((sitemap) => sitemap.loc)
    .filter((url) => /^https:\/\/cellphones\.com\.vn\/sitemap\/product-sitemap/.test(url));
}

function parseProductSitemap(xml, sitemapUrl) {
  const parsed = xmlParser.parse(xml);
  const nodes = asArray(parsed.urlset && parsed.urlset.url);

  return nodes
    .map((node) => {
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
        sitemapLastmod: node.lastmod || null,
        sitemapImages: uniqueStrings(images),
      };
    })
    .filter(Boolean);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()))];
}

async function collectProductEntries(args) {
  const indexXml = await fetchText(
    SITEMAP_INDEX_URL,
    args,
    "application/xml,text/xml,*/*"
  );
  let productSitemaps = parseSitemapIndex(indexXml);

  if (productSitemaps.length === 0) {
    throw new Error(
      "No product sitemaps parsed from sitemap index. The site may have returned a challenge page."
    );
  }

  productSitemaps = productSitemaps.slice(
    args.sitemapStart,
    args.sitemapLimit ? args.sitemapStart + args.sitemapLimit : undefined
  );

  const entriesByUrl = new Map();

  for (const sitemapUrl of productSitemaps) {
    const xml = await fetchText(sitemapUrl, args, "application/xml,text/xml,*/*");
    const entries = parseProductSitemap(xml, sitemapUrl);

    if (entries.length === 0) {
      throw new Error(
        `No product URLs parsed from ${sitemapUrl}. The site may have returned a challenge page.`
      );
    }

    for (const entry of entries) {
      const existing = entriesByUrl.get(entry.url);
      if (existing) {
        existing.sitemapImages = uniqueStrings([
          ...existing.sitemapImages,
          ...entry.sitemapImages,
        ]);
      } else {
        entriesByUrl.set(entry.url, entry);
      }
    }

    console.log(`[sitemap] ${sitemapUrl} -> ${entries.length} URLs`);
    await sleep(Math.min(args.delayMs, 250));
  }

  return [...entriesByUrl.values()];
}

function parseJsonLdBlocks($) {
  const blocks = [];
  const errors = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const text = ($(element).html() || "").trim();
    if (!text) return;

    try {
      blocks.push(JSON.parse(text));
    } catch (error) {
      errors.push(error.message);
    }
  });

  return { blocks, errors };
}

function findJsonLdByType(input, type) {
  const matches = [];

  function visit(value) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;

    if (hasJsonLdType(value, type)) matches.push(value);
    if (value["@graph"]) visit(value["@graph"]);
  }

  visit(input);
  return matches;
}

function hasJsonLdType(value, type) {
  const jsonType = value["@type"];
  if (Array.isArray(jsonType)) return jsonType.includes(type);
  return jsonType === type;
}

function firstOffer(offers) {
  const offer = asArray(offers)[0];
  return offer || {};
}

function textValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return repairMojibake(value.trim()) || null;
  if (typeof value === "number") return String(value);
  return null;
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;

  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function imageValues(value) {
  return uniqueStrings(
    asArray(value).map((image) => {
      if (typeof image === "string") return image;
      if (image && typeof image === "object") return image.url || image.contentUrl;
      return null;
    })
  );
}

function metaContent($, selector) {
  return textValue($(selector).attr("content"));
}

function normalizeAvailability(value) {
  const raw = textValue(value);
  if (!raw) return { raw: null, status: null };

  const status = raw.split("/").filter(Boolean).pop() || raw;
  return { raw, status };
}

function normalizeBrand(brand) {
  if (!brand) return null;
  if (typeof brand === "string") return brand;
  return textValue(brand.name) || textValue(brand["@id"]);
}

function normalizeSpecifications(product) {
  return asArray(product.additionalProperty)
    .map((property) => ({
      name: textValue(property && property.name),
      value: textValue(property && property.value),
    }))
    .filter((property) => property.name || property.value);
}

function normalizeBreadcrumbs(breadcrumb) {
  const items = asArray(breadcrumb && breadcrumb.itemListElement);

  return items
    .map((item) => {
      const nested = item.item || {};
      return {
        position: numberValue(item.position),
        name: textValue(nested.name || item.name),
        url: textValue(nested["@id"] || nested.url || nested),
      };
    })
    .filter((item) => item.name || item.url);
}

function normalizeRating(product) {
  const rating = product.aggregateRating || {};

  return {
    value: numberValue(rating.ratingValue),
    count: numberValue(rating.reviewCount || rating.ratingCount),
    best: numberValue(rating.bestRating),
    worst: numberValue(rating.worstRating),
  };
}

function slugFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split("/").pop().replace(/\.html$/, "");
  } catch {
    return null;
  }
}

function normalizeProduct(entry, html) {
  const $ = cheerio.load(html);
  const { blocks, errors } = parseJsonLdBlocks($);
  const products = blocks.flatMap((block) => findJsonLdByType(block, "Product"));
  const breadcrumbs = blocks.flatMap((block) =>
    findJsonLdByType(block, "BreadcrumbList")
  );
  const product = products.find((item) => item.offers) || products[0] || {};
  const offer = firstOffer(product.offers);
  const canonicalUrl =
    $("link[rel='canonical']").attr("href") ||
    metaContent($, "meta[property='og:url']") ||
    entry.url;
  const availability = normalizeAvailability(offer.availability);
  const normalizedBreadcrumbs = normalizeBreadcrumbs(breadcrumbs[0]);
  const images = uniqueStrings([
    ...imageValues(product.image),
    ...imageValues(metaContent($, "meta[property='og:image']")),
    ...entry.sitemapImages,
  ]);
  const price = numberValue(offer.price || product.price);
  const highPrice = numberValue(offer.highPrice);
  const lowPrice = numberValue(offer.lowPrice);
  const specifications = normalizeSpecifications(product);
  const now = new Date();

  return repairObjectText({
    source: SOURCE_SITE,
    inputUrl: entry.url,
    sourceUrls: [entry.url],
    url: canonicalUrl,
    slug: slugFromUrl(canonicalUrl),
    name: textValue(product.name) || metaContent($, "meta[property='og:title']"),
    title:
      metaContent($, "meta[property='og:title']") ||
      $("title").first().text().trim() ||
      null,
    description:
      textValue(product.description) ||
      metaContent($, "meta[name='description']") ||
      metaContent($, "meta[property='og:description']"),
    brand: normalizeBrand(product.brand),
    sku: textValue(product.sku),
    mpn: textValue(product.mpn),
    price,
    priceCurrency: textValue(offer.priceCurrency || product.priceCurrency),
    priceRange: {
      low: lowPrice,
      high: highPrice,
    },
    availability,
    itemCondition: textValue(offer.itemCondition),
    images,
    primaryImage: images[0] || null,
    breadcrumbs: normalizedBreadcrumbs,
    categories: normalizedBreadcrumbs.slice(1, -1).map((item) => item.name),
    specifications,
    attributes: Object.fromEntries(
      specifications
        .filter((property) => property.name)
        .map((property) => [property.name, property.value])
    ),
    rating: normalizeRating(product),
    sitemap: {
      url: entry.sitemapUrl,
      lastmod: entry.sitemapLastmod,
      images: entry.sitemapImages,
    },
    rawProductJsonLd: product,
    parseWarnings: errors,
    scrapedAt: now,
    updatedAt: now,
  });
}

function validateProduct(doc, entry) {
  if (!doc.name) {
    throw new Error(`No product name parsed from ${entry.url}`);
  }
  if (!doc.url) {
    throw new Error(`No canonical URL parsed from ${entry.url}`);
  }
}

async function scrapeOne(entry, args) {
  const html = await fetchText(entry.url, args);
  const doc = normalizeProduct(entry, html);
  validateProduct(doc, entry);
  return doc;
}

async function ensureIndexes(productsCollection, errorsCollection) {
  await retryOperation("create product url index", () =>
    productsCollection.createIndex({ url: 1 }, { unique: true })
  );
  await retryOperation("create product source slug index", () =>
    productsCollection.createIndex({ source: 1, slug: 1 })
  );
  await retryOperation("create product name index", () =>
    productsCollection.createIndex({ name: 1 })
  );
  await retryOperation("create product brand index", () =>
    productsCollection.createIndex({ brand: 1 })
  );
  await retryOperation("create errors url index", () =>
    errorsCollection.createIndex({ url: 1 }, { unique: true })
  );
}

function productUpsertOps(docs) {
  return docs.map((doc) => ({
    updateOne: {
      filter: { url: doc.url },
      update: {
        $set: withoutKeys(doc, ["sourceUrls"]),
        $addToSet: { sourceUrls: { $each: doc.sourceUrls } },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    },
  }));
}

function withoutKeys(input, keys) {
  const output = { ...input };
  keys.forEach((key) => delete output[key]);
  return output;
}

function errorUpsertOps(errors) {
  return errors.map((item) => ({
    updateOne: {
      filter: { url: item.url },
      update: {
        $set: {
          ...item,
          source: SOURCE_SITE,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    },
  }));
}

async function writeBatch(productsCollection, errorsCollection, docs, errors) {
  if (docs.length) {
    await retryOperation("products bulkWrite", () =>
      productsCollection.bulkWrite(productUpsertOps(docs), { ordered: false })
    );
    await retryOperation("clear resolved product errors", () =>
      errorsCollection.deleteMany({ url: { $in: docs.map((doc) => doc.url) } })
    );
  }

  if (errors.length) {
    await retryOperation("errors bulkWrite", () =>
      errorsCollection.bulkWrite(errorUpsertOps(errors), { ordered: false })
    );
  }
}

async function filterExisting(entries, collection) {
  const existing = new Set();
  const chunkSize = 1000;

  for (let index = 0; index < entries.length; index += chunkSize) {
    const chunk = entries.slice(index, index + chunkSize);
    const urls = chunk.map((entry) => entry.url);
    const docs = await retryOperation("filter existing products", () =>
      collection
        .find(
          { $or: [{ url: { $in: urls } }, { sourceUrls: { $in: urls } }] },
          { projection: { url: 1, sourceUrls: 1 } }
        )
        .toArray()
    );
    docs.forEach((doc) => {
      existing.add(doc.url);
      asArray(doc.sourceUrls).forEach((url) => existing.add(url));
    });
  }

  return entries.filter((entry) => !existing.has(entry.url));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const proxyCount = getProxyUrls().length;
  console.log(
    proxyCount
      ? `[network] Proxy rotation enabled: ${proxyCount} proxies`
      : "[network] Proxy rotation disabled"
  );

  const entries = await collectProductEntries(args);
  const slicedEntries = entries.slice(
    args.start,
    args.limit ? args.start + args.limit : undefined
  );

  console.log(`[crawl] Found ${entries.length} unique product URLs`);
  console.log(`[crawl] Selected ${slicedEntries.length} URLs`);

  if (args.dryRun) {
    console.log(JSON.stringify(slicedEntries.slice(0, 5), null, 2));
    return;
  }

  const client = createMongoClient();
  const { dbName, productsCollection } = getMongoConfig();

  try {
    await client.connect();
    const db = client.db(dbName);
    const products = db.collection(productsCollection);
    const errorsCollection = db.collection(`${productsCollection}_errors`);
    await ensureIndexes(products, errorsCollection);

    let workEntries = slicedEntries;
    if (args.skipExisting) {
      workEntries = await filterExisting(workEntries, products);
      console.log(`[crawl] Remaining after --skip-existing: ${workEntries.length}`);
    }

    const stats = {
      selected: slicedEntries.length,
      processed: 0,
      saved: 0,
      failed: 0,
      startedAt: new Date(),
    };

    for (let index = 0; index < workEntries.length; index += args.concurrency) {
      const chunk = workEntries.slice(index, index + args.concurrency);
      const results = await Promise.allSettled(
        chunk.map((entry) => scrapeOne(entry, args))
      );
      const docs = [];
      const errors = [];
      let botChallengeError = null;

      results.forEach((result, resultIndex) => {
        const entry = chunk[resultIndex];
        stats.processed += 1;

        if (result.status === "fulfilled") {
          docs.push(result.value);
          stats.saved += 1;
        } else if (result.reason && result.reason.isBotChallenge) {
          botChallengeError = result.reason;
          stats.failed += 1;
        } else {
          errors.push({
            url: entry.url,
            sitemapUrl: entry.sitemapUrl,
            sitemapLastmod: entry.sitemapLastmod,
            message: formatErrorMessage(result.reason),
            status: result.reason && result.reason.status,
          });
          stats.failed += 1;
        }
      });

      if (botChallengeError) {
        await writeBatch(products, errorsCollection, docs, []);
        throw botChallengeError;
      }

      await writeBatch(products, errorsCollection, docs, errors);

      if (stats.processed % 25 === 0 || stats.processed === workEntries.length) {
        console.log(
          `[crawl] ${stats.processed}/${workEntries.length} processed, ` +
            `${stats.saved} saved, ${stats.failed} failed`
        );
      }

      if (index + args.concurrency < workEntries.length) {
        await sleep(args.delayMs);
      }
    }

    const totalInCollection = await products.countDocuments({ source: SOURCE_SITE });
    const totalErrors = await errorsCollection.countDocuments({ source: SOURCE_SITE });
    console.log(`[done] Products in MongoDB: ${totalInCollection}`);
    console.log(`[done] Scrape errors recorded: ${totalErrors}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[fatal]", formatErrorMessage(error));
  process.exit(1);
});
