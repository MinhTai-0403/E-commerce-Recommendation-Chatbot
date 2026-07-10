const cheerio = require("cheerio");
const { XMLParser } = require("fast-xml-parser");
const { ProxyAgent } = require("undici");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const { buildRealWorldRecency } = require("../cellphones/realworld-product-recency");
const { repairMojibake, repairObjectText } = require("../utils/text-utils");

const SITEMAP_INDEX_URL =
  "https://cellphones.com.vn/sitemap/sitemap_index.xml?v=google";
const SITE_ORIGIN = "https://cellphones.com.vn";
const SOURCE_SITE = "cellphones";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; cosarii-cellphones-scraper/1.0)";
const proxyAgents = new Map();
const proxyFailures = new Map();
const proxyDisabledUntil = new Map();
let proxyCursor = Math.floor(Math.random() * 10000);
const BAD_PROXY_FAILURE_LIMIT = Number(process.env.SCRAPER_PROXY_FAILURE_LIMIT || 3);
const BAD_PROXY_COOLDOWN_MS =
  Number(process.env.SCRAPER_PROXY_COOLDOWN_SECONDS || 300) * 1000;

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
    inStockOnly: false,
    availableOrContact: false,
    directSitemap: false,
    seedOnlyQueue: false,
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
    else if (arg === "--in-stock-only") args.inStockOnly = true;
    else if (arg === "--available-or-contact") args.availableOrContact = true;
    else if (arg === "--direct-sitemap") args.directSitemap = true;
    else if (arg === "--seed-only-queue") args.seedOnlyQueue = true;
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
  --in-stock-only    Save only products with schema.org/InStock.
  --direct-sitemap   Build product sitemap URLs directly instead of fetching sitemap_index.xml.
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

function maskProxyUrl(proxyUrl) {
  return String(proxyUrl || "")
    .replace(/\/\/([^:\s/@]+):([^@\s]+)@/g, "//***:***@");
}

function isProxyDisabled(proxyUrl, now = Date.now()) {
  const disabledUntil = proxyDisabledUntil.get(proxyUrl) || 0;
  if (disabledUntil <= now) {
    proxyDisabledUntil.delete(proxyUrl);
    return false;
  }
  return true;
}

function getNextProxyAgent() {
  const proxies = getProxyUrls();
  if (!proxies.length) return null;

  let proxyUrl = null;
  const now = Date.now();

  for (let index = 0; index < proxies.length; index += 1) {
    const candidate = proxies[proxyCursor % proxies.length];
    proxyCursor += 1;

    if (!isProxyDisabled(candidate, now)) {
      proxyUrl = candidate;
      break;
    }
  }

  if (!proxyUrl) {
    console.warn("[proxy-pool] All proxies are cooling down. Waiting instead of falling back to direct fetch.");
    return null;
  }

  if (!proxyAgents.has(proxyUrl)) {
    proxyAgents.set(proxyUrl, new ProxyAgent(proxyUrl));
  }

  return {
    proxyUrl,
    agent: proxyAgents.get(proxyUrl),
  };
}

function shouldCooldownProxy(error) {
  if (!error) return false;

  if (error.isBotChallenge) return true;

  if ([401, 403, 407, 408, 429, 500, 502, 503, 504].includes(error.status)) {
    return true;
  }

  return isRetryableOperationError(error);
}

function recordProxySuccess(proxyUrl) {
  if (!proxyUrl) return;
  proxyFailures.delete(proxyUrl);
}

function recordProxyFailure(proxyUrl, error) {
  if (!proxyUrl || !shouldCooldownProxy(error)) return;

  const nextCount = (proxyFailures.get(proxyUrl) || 0) + 1;
  proxyFailures.set(proxyUrl, nextCount);

  const immediateCooldown =
    error.isBotChallenge || [401, 403, 407, 429].includes(error.status);

  if (immediateCooldown || nextCount >= BAD_PROXY_FAILURE_LIMIT) {
    proxyFailures.delete(proxyUrl);
    proxyDisabledUntil.set(proxyUrl, Date.now() + BAD_PROXY_COOLDOWN_MS);
    console.warn(
      `[proxy-pool] Cooling down ${maskProxyUrl(proxyUrl)} for ${Math.round(
        BAD_PROXY_COOLDOWN_MS / 1000
      )}s after ${formatErrorMessage(error)}`
    );
  }
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
  const message = [
    error && error.message,
    error && error.cause && error.cause.message,
    error && error.code,
    error && error.cause && error.cause.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("connect timeout") ||
    message.includes("etimedout") ||
    message.includes("cancelled") ||
    message.includes("canceled") ||
    message.includes("aborted") ||
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

async function fetchText(
  url,
  args,
  accept = "text/html,application/xhtml+xml",
  options = {}
) {
  const useProxy = options.useProxy !== false;
  const proxyMode = String(process.env.SCRAPER_PROXY_MODE || "rotate").toLowerCase();

  if (useProxy && proxyMode === "fallback" && getProxyUrls().length) {
    try {
      return await fetchTextRaw(url, args, accept, { useProxy: false });
    } catch (error) {
      console.warn(
        `[proxy-fallback] Direct fetch failed for ${url}: ${formatErrorMessage(
          error
        )}. Retrying with proxy rotation...`
      );
      return fetchTextRaw(url, args, accept, { useProxy: true });
    }
  }

  return fetchTextRaw(url, args, accept, options);
}

async function fetchTextRaw(
  url,
  args,
  accept = "text/html,application/xhtml+xml",
  options = {}
) {
  const useProxy = options.useProxy !== false;
  const retries = Number.isFinite(options.retries) ? options.retries : args.retries;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const proxyLease = useProxy ? getNextProxyAgent() : null;

    if (useProxy && getProxyUrls().length && !proxyLease) {
      const error = new Error("All proxies are cooling down");
      error.transient = true;
      lastError = error;
      if (attempt < retries) {
        await sleep(2500 * (attempt + 1));
        continue;
      }
      break;
    }

    try {
      const response = await fetch(url, {
        headers: {
          accept,
          "accept-language": "vi,en;q=0.8",
          "user-agent": process.env.SCRAPER_USER_AGENT || DEFAULT_USER_AGENT,
        },
        dispatcher: proxyLease ? proxyLease.agent : undefined,
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

      recordProxySuccess(proxyLease && proxyLease.proxyUrl);
      return text;
    } catch (error) {
      recordProxyFailure(proxyLease && proxyLease.proxyUrl, error);
      lastError = error;
      const retryable =
        error.transient || !error.status || error.status === 429 || error.status >= 500;

      if (attempt < retries && retryable) {
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

async function fetchSitemapText(url, args) {
  const accept = "application/xml,text/xml,*/*";
  const hasProxyFallback = getProxyUrls().length > 0;

  try {
    return await fetchTextRaw(url, args, accept, {
      useProxy: false,
      retries: hasProxyFallback ? 0 : args.retries,
    });
  } catch (error) {
    if (!hasProxyFallback) throw error;

    console.warn(
      `[sitemap-fallback] Direct sitemap fetch failed for ${url}: ${formatErrorMessage(
        error
      )}. Retrying with proxy rotation...`
    );
    return fetchText(url, args, accept);
  }
}

function parseSitemapIndex(xml) {
  const parsed = xmlParser.parse(xml);
  const sitemaps = asArray(parsed.sitemapindex && parsed.sitemapindex.sitemap);

  return sitemaps
    .map((sitemap) => sitemap.loc)
    .filter((url) => /^https:\/\/cellphones\.com\.vn\/sitemap\/product-sitemap/.test(url));
}

function productSitemapUrlByIndex(index) {
  return index === 0
    ? `${SITE_ORIGIN}/sitemap/product-sitemap.xml`
    : `${SITE_ORIGIN}/sitemap/product-sitemap${index + 1}.xml`;
}

function parseProductSitemap(xml, sitemapUrl, sitemapRank = 0) {
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

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()))];
}

async function collectProductEntries(args) {
  let productSitemaps;

  if (args.directSitemap) {
    const count = args.sitemapLimit || 1;
    productSitemaps = Array.from({ length: count }, (_, offset) =>
      productSitemapUrlByIndex(args.sitemapStart + offset)
    );
  } else {
    const indexXml = await fetchSitemapText(SITEMAP_INDEX_URL, args);
    productSitemaps = parseSitemapIndex(indexXml);

    if (productSitemaps.length === 0) {
      throw new Error(
        "No product sitemaps parsed from sitemap index. The site may have returned a challenge page."
      );
    }

    productSitemaps = productSitemaps.slice(
      args.sitemapStart,
      args.sitemapLimit ? args.sitemapStart + args.sitemapLimit : undefined
    );
  }

  const entriesByUrl = new Map();

  for (const [relativeSitemapIndex, sitemapUrl] of productSitemaps.entries()) {
    const xml = await fetchSitemapText(sitemapUrl, args);
    const sitemapRank = args.sitemapStart + relativeSitemapIndex;
    const entries = parseProductSitemap(xml, sitemapUrl, sitemapRank);

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
        if (
          Number.isFinite(entry.sitemapSortRank) &&
          (!Number.isFinite(existing.sitemapSortRank) ||
            entry.sitemapSortRank > existing.sitemapSortRank)
        ) {
          existing.sitemapUrl = entry.sitemapUrl;
          existing.sitemapRank = entry.sitemapRank;
          existing.sitemapProductRank = entry.sitemapProductRank;
          existing.sitemapSortRank = entry.sitemapSortRank;
          existing.sitemapLastmod = entry.sitemapLastmod;
        }
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

function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function searchText(value = "") {
  return repairMojibake(String(value || ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function detectPageStockStatus($) {
  const bodyText = searchText($("body").text().replace(/\s+/g, " "));

  if (bodyText.includes("tam het hang")) {
    return "OutOfStock";
  }

  if (
    bodyText.includes("sap ve hang") ||
    bodyText.includes("gia lien he") ||
    bodyText.includes("dang ky nhan thong tin")
  ) {
    return "Contact";
  }

  return null;
}

function normalizeStatusLabel(availability) {
  const status = availability && availability.status;
  if (/^instock$/i.test(status || "")) return "Còn hàng";
  if (/^outofstock$/i.test(status || "")) return "Hết hàng";
  return "Liên hệ";
}

function isInStockStatus(status) {
  return /^instock$/i.test(status || "");
}

function isOutOfStockStatus(status) {
  return /^(outofstock|soldout|discontinued)$/i.test(status || "");
}

function isAvailableOrContactStatus(status) {
  return !isOutOfStockStatus(status);
}

function dateScore(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function yearFromDate(value) {
  const score = dateScore(value);
  return score ? new Date(score).getFullYear() : null;
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
  let availability = normalizeAvailability(offer.availability);
  const pageStockStatus = detectPageStockStatus($);
  if (pageStockStatus === "Contact") {
    availability = { raw: availability.raw || "UI:Contact", status: "Contact" };
  } else if (pageStockStatus === "OutOfStock") {
    availability = {
      raw: availability.raw || "UI:OutOfStock",
      status: "OutOfStock",
    };
  }
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
  const name = textValue(product.name) || metaContent($, "meta[property='og:title']");
  const brand = normalizeBrand(product.brand);
  const slug = slugFromUrl(entry.url) || slugFromUrl(canonicalUrl);
  const primaryImage = images[0] || null;
  const categories = normalizedBreadcrumbs.slice(1, -1).map((item) => item.name);
  const originalPrice = highPrice && highPrice > price ? highPrice : price;
  const statusLabel = normalizeStatusLabel(availability);
  const now = new Date();

  const baseDoc = {
    source: SOURCE_SITE,
    inputUrl: entry.url,
    sourceUrls: uniqueStrings([entry.url, canonicalUrl]),
    url: entry.url,
    productUrl: canonicalUrl,
    canonicalUrl,
    slug,
    id: slug,
    sku: textValue(product.sku) || slug,
    name,
    productName: name,
    title:
      metaContent($, "meta[property='og:title']") ||
      $("title").first().text().trim() ||
      null,
    description:
      textValue(product.description) ||
      metaContent($, "meta[name='description']") ||
      metaContent($, "meta[property='og:description']"),
    brand,
    brandName: brand,
    brandKey: slugify(brand),
    mpn: textValue(product.mpn),
    price,
    currentPrice: price,
    salePrice: price,
    originalPrice,
    regularPrice: originalPrice,
    priceCurrency: textValue(offer.priceCurrency || product.priceCurrency),
    priceRange: {
      low: lowPrice,
      high: highPrice,
    },
    availability,
    stockStatus: availability.status,
    statusLabel,
    sitemapLastmod: entry.sitemapLastmod || null,
    sitemapRank: entry.sitemapRank ?? null,
    sitemapProductRank: entry.sitemapProductRank ?? null,
    sitemapSortRank: entry.sitemapSortRank ?? null,
    webFreshnessScore: dateScore(entry.sitemapLastmod),
    realWorldYear: yearFromDate(entry.sitemapLastmod),
    effectiveRealWorldYear: yearFromDate(entry.sitemapLastmod),
    itemCondition: textValue(offer.itemCondition),
    images,
    primaryImage,
    thumbnail: primaryImage,
    image: primaryImage,
    breadcrumbs: normalizedBreadcrumbs,
    categories,
    category: categories[0] || null,
    categoryName: categories[0] || null,
    specifications,
    attributes: Object.fromEntries(
      specifications
        .filter((property) => property.name)
        .map((property) => [property.name, property.value])
    ),
    rating: normalizeRating(product),
    sitemap: {
      url: entry.sitemapUrl,
      rank: entry.sitemapRank ?? null,
      productRank: entry.sitemapProductRank ?? null,
      sortRank: entry.sitemapSortRank ?? null,
      lastmod: entry.sitemapLastmod,
      images: entry.sitemapImages,
    },
    rawProductJsonLd: product,
    parseWarnings: errors,
    scrapedAt: now,
    updatedAt: now,
  };

  const recency = buildRealWorldRecency(baseDoc);
  baseDoc.webFreshnessScore = recency.webFreshnessScore;
  baseDoc.webFreshnessReason = recency.webFreshnessReason;
  baseDoc.realWorldYear = recency.realWorldYear;
  baseDoc.effectiveRealWorldYear = recency.effectiveYear;
  baseDoc.latestDateMs = recency.latestDateMs;

  return repairObjectText(baseDoc);
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
  await retryOperation("create product freshness index", () =>
    productsCollection.createIndex({
      webFreshnessScore: -1,
      realWorldYear: -1,
      effectiveRealWorldYear: -1,
      sitemapSortRank: -1,
      updatedAt: -1,
    })
  );
  await retryOperation("create seed-only queue index", () =>
    productsCollection.createIndex({
      seedOnly: 1,
      sitemapSortRank: -1,
      webFreshnessScore: -1,
      updatedAt: 1,
    })
  );
  await retryOperation("create errors url index", () =>
    errorsCollection.createIndex({ url: 1 }, { unique: true })
  );
}

function productUpsertOps(docs) {
  return docs.map((doc) => ({
    updateOne: {
      // `url` is the stable document identity in this collection. Do not match
      // by canonical/productUrl here: CellphoneS often canonicalizes variants
      // to another URL, and updating that matched document would violate the
      // unique `url_1` index or collapse distinct variants into one record.
      filter: { url: doc.url },
      update: {
        $set: withoutKeys(doc, ["sourceUrls"]),
        $addToSet: { sourceUrls: { $each: doc.sourceUrls } },
        $unset: { seedOnly: "", seedReason: "" },
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
          {
            seedOnly: { $ne: true },
            $or: [{ url: { $in: urls } }, { sourceUrls: { $in: urls } }],
          },
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

function seedDocToEntry(doc) {
  const sitemap = doc.sitemap || {};
  return {
    url: doc.url,
    sitemapUrl: sitemap.url || null,
    sitemapRank: doc.sitemapRank ?? sitemap.rank ?? 0,
    sitemapProductRank: doc.sitemapProductRank ?? sitemap.productRank ?? 0,
    sitemapSortRank: doc.sitemapSortRank ?? sitemap.sortRank ?? 0,
    sitemapLastmod: doc.sitemapLastmod || sitemap.lastmod || null,
    sitemapImages: uniqueStrings([
      ...asArray(sitemap.images),
      ...asArray(doc.images),
      doc.primaryImage,
      doc.image,
      doc.thumbnail,
    ]),
  };
}

async function collectSeedOnlyEntries(products, args) {
  const limit = args.limit || 5000;
  const docs = await retryOperation("load seed-only product queue", () =>
    products
      .find(
        {
          source: SOURCE_SITE,
          seedOnly: true,
          url: { $type: "string", $ne: "" },
        },
        {
          projection: {
            url: 1,
            sitemap: 1,
            sitemapRank: 1,
            sitemapProductRank: 1,
            sitemapSortRank: 1,
            sitemapLastmod: 1,
            images: 1,
            primaryImage: 1,
            image: 1,
            thumbnail: 1,
          },
        }
      )
      .sort({
        sitemapSortRank: -1,
        webFreshnessScore: -1,
        updatedAt: 1,
      })
      .limit(limit)
      .toArray()
  );

  return docs.map(seedDocToEntry);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const proxyCount = getProxyUrls().length;
  console.log(
    proxyCount
      ? `[network] Proxy rotation enabled: ${proxyCount} proxies`
      : "[network] Proxy rotation disabled"
  );

  let entries = [];
  let slicedEntries = [];

  if (!args.seedOnlyQueue) {
    entries = await collectProductEntries(args);
    slicedEntries = entries.slice(
      args.start,
      args.limit ? args.start + args.limit : undefined
    );

    console.log(`[crawl] Found ${entries.length} unique product URLs`);
    console.log(`[crawl] Selected ${slicedEntries.length} URLs`);

    if (args.dryRun) {
      console.log(JSON.stringify(slicedEntries.slice(0, 5), null, 2));
      return;
    }
  }

  const client = createMongoClient();
  const { dbName, productsCollection } = getMongoConfig();

  try {
    await client.connect();
    const db = client.db(dbName);
    const products = db.collection(productsCollection);
    const errorsCollection = db.collection(`${productsCollection}_errors`);
    await ensureIndexes(products, errorsCollection);

    let workEntries;
    let existingSkipped = 0;

    if (args.seedOnlyQueue) {
      workEntries = await collectSeedOnlyEntries(products, args);
      slicedEntries = workEntries;
      console.log(`[crawl] Loaded ${workEntries.length} seed-only URLs from MongoDB`);

      if (args.dryRun) {
        console.log(JSON.stringify(workEntries.slice(0, 5), null, 2));
        return;
      }
    } else {
      workEntries = slicedEntries;
    }

    if (!args.seedOnlyQueue && args.skipExisting) {
      workEntries = await filterExisting(workEntries, products);
      existingSkipped = slicedEntries.length - workEntries.length;
      console.log(`[crawl] Remaining after --skip-existing: ${workEntries.length}`);
    }

    const stats = {
      selected: slicedEntries.length,
      existingSkipped,
      processed: 0,
      saved: 0,
      skipped: 0,
      skippedByStatus: {},
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
          const availabilityStatus = result.value?.availability?.status;
          const shouldSkipByStock =
            (args.inStockOnly && !isInStockStatus(availabilityStatus)) ||
            (args.availableOrContact &&
              !isAvailableOrContactStatus(availabilityStatus));

          if (shouldSkipByStock) {
            stats.skipped += 1;
            const key = availabilityStatus || "Unknown";
            stats.skippedByStatus[key] = (stats.skippedByStatus[key] || 0) + 1;
          } else {
            docs.push(result.value);
            stats.saved += 1;
          }
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
        const skippedBreakdown = Object.entries(stats.skippedByStatus)
          .sort((a, b) => b[1] - a[1])
          .map(([status, count]) => `${status}:${count}`)
          .join(", ");
        console.log(
          `[crawl] ${stats.processed}/${workEntries.length} processed, ` +
            `${stats.saved} saved, ${stats.skipped} skipped` +
            (skippedBreakdown ? ` (${skippedBreakdown})` : "") +
            `, ${stats.failed} failed`
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
