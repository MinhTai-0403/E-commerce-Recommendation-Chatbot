const http = require("http");
const { ObjectId } = require("mongodb");
const { ProxyAgent } = require("undici");
const { handleAdminRequest, isAdminAuthorized } = require("../services/admin-service");
const { handleAuthRequest, getAuthToken, verifyJwt } = require("../services/auth-service");
const { ensureCommerceDatabase } = require("../services/db-maintenance");
const { extractCellphonesDetails } = require("../cellphones/cellphones-detail-extractor");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const { rateLimitOrSend } = require("../middlewares/rate-limit");
const {
  addressSchema,
  addressUpdateSchema,
  couponSchema,
  invoiceUpdateSchema,
  orderPayloadSchema,
  parseWithSchema,
  questionCreateSchema,
  reviewCreateSchema,
  returnRequestSchema,
  wishlistItemSchema,
} = require("../validators/ecommerce-validators");
const {
  buildProductDetailManifest,
  hydrateProductDetail,
  writeProductDetailFile,
} = require("../storage/product-detail-storage");

const API_PORT = Number(process.env.API_PORT || 5050);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LAZY_SCRAPE_ENABLED = String(process.env.LAZY_SCRAPE_ENABLED || "false") === "true";
const LAZY_SCRAPE_TIMEOUT_MS = Number(process.env.LAZY_SCRAPE_TIMEOUT_MS || 45000);
const LAZY_SCRAPE_RETRIES = Number(process.env.LAZY_SCRAPE_RETRIES || 2);
const LAZY_SCRAPE_FAILURE_COOLDOWN_MS = Number(
  process.env.LAZY_SCRAPE_FAILURE_COOLDOWN_MS || 10 * 60 * 1000
);
const LAZY_SCRAPE_DEBUG = String(process.env.LAZY_SCRAPE_DEBUG || "false") === "true";

let mongoClient;
let lazyProxyPool;
let lazyProxyCursor = 0;
const lazyScrapeFailures = new Map();
const lazyScrapeInflight = new Map();
let cartIndexesReady = false;
let orderIndexesReady = false;
let inventoryIndexesReady = false;
let couponIndexesReady = false;
let userEventIndexesReady = false;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Api-Key, X-Bank-Webhook-Secret",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendError(res, statusCode, message, details) {
  sendJson(res, statusCode, {
    ok: false,
    message,
    error: {
      message,
      ...(details ? { details } : {}),
    },
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "san-pham-moi";
}

function stripHtmlExtension(value = "") {
  return decodeURIComponent(String(value))
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.html$/i, "");
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
  if (!host || !port) throw new Error("Invalid proxy format. Use host:port:user:password.");
  if (!username) return `http://${host}:${port}`;

  return `http://${encodeURIComponent(username)}:${encodeURIComponent(passwordParts.join(":"))}@${host}:${port}`;
}

function nextLazyProxy() {
  if (!lazyProxyPool) lazyProxyPool = createProxyPool(process.env.SCRAPER_PROXIES || "");
  if (lazyProxyPool.length === 0) return null;

  const proxy = lazyProxyPool[lazyProxyCursor % lazyProxyPool.length];
  lazyProxyCursor += 1;
  return proxy;
}

function shouldRetryScrapeError(error) {
  if (!error?.statusCode) return true;
  if ([404, 410].includes(error.statusCode)) return false;
  return [403, 408, 425, 429, 500, 502, 503, 504, 520, 522, 524].includes(error.statusCode);
}

async function fetchCellphonesHtml(url) {
  const proxy = nextLazyProxy();
  const options = {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "vi,en;q=0.8",
      "user-agent": process.env.SCRAPER_USER_AGENT || DEFAULT_USER_AGENT,
    },
    signal: AbortSignal.timeout(LAZY_SCRAPE_TIMEOUT_MS),
  };

  if (proxy) options.dispatcher = proxy.agent;

  const response = await fetch(url, options);
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    error.statusCode = response.status;
    error.proxyId = proxy?.id;
    throw error;
  }

  return response.text();
}

async function scrapeCellphonesDetail(url) {
  let lastError = null;
  const attempts = Math.max(1, LAZY_SCRAPE_RETRIES + 1);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const html = await fetchCellphonesHtml(url);
      return extractCellphonesDetails(html, url);
    } catch (error) {
      lastError = error;
      if (!shouldRetryScrapeError(error) || attempt === attempts) break;
      if (LAZY_SCRAPE_DEBUG) {
        console.warn(`[lazy-detail-retry] ${url}: ${error.message}${error.proxyId ? ` via ${error.proxyId}` : ""}`);
      }
    }
  }

  throw lastError;
}

function getLazyScrapeKey(url = "") {
  return String(url || "").trim().toLowerCase();
}

function getLazyScrapeCooldown(url) {
  const key = getLazyScrapeKey(url);
  const failure = lazyScrapeFailures.get(key);
  if (!failure) return null;

  if (failure.expiresAt <= Date.now()) {
    lazyScrapeFailures.delete(key);
    return null;
  }

  return failure;
}

function rememberLazyScrapeFailure(url, error) {
  const key = getLazyScrapeKey(url);
  if (!key) return;

  lazyScrapeFailures.set(key, {
    message: error?.message || "fetch failed",
    failedAt: Date.now(),
    expiresAt: Date.now() + LAZY_SCRAPE_FAILURE_COOLDOWN_MS,
  });
}

async function scrapeCellphonesDetailCached(url, { force = false } = {}) {
  if (!LAZY_SCRAPE_ENABLED && !force) {
    const error = new Error("Lazy scrape is disabled. Use LAZY_SCRAPE_ENABLED=true or ?lazy=true to enable on-demand scraping.");
    error.code = "LAZY_SCRAPE_DISABLED";
    throw error;
  }

  const key = getLazyScrapeKey(url);
  if (!force) {
    const cooldown = getLazyScrapeCooldown(url);
    if (cooldown) {
      const error = new Error(`Lazy scrape is cooling down after previous failure: ${cooldown.message}`);
      error.code = "LAZY_SCRAPE_COOLDOWN";
      throw error;
    }
  } else {
    lazyScrapeFailures.delete(key);
  }

  if (lazyScrapeInflight.has(key)) return lazyScrapeInflight.get(key);

  const task = scrapeCellphonesDetail(url)
    .then((detail) => {
      lazyScrapeFailures.delete(key);
      return detail;
    })
    .catch((error) => {
      rememberLazyScrapeFailure(url, error);
      if (!["LAZY_SCRAPE_DISABLED", "LAZY_SCRAPE_COOLDOWN"].includes(error.code)) {
        console.warn(`[lazy-detail-failed] ${url}: ${error.message}`);
      }
      throw error;
    })
    .finally(() => {
      lazyScrapeInflight.delete(key);
    });

  lazyScrapeInflight.set(key, task);
  return task;
}

function getSlugFromUrl(url) {
  if (!url) return "";

  try {
    return stripHtmlExtension(new URL(url).pathname.split("/").pop());
  } catch {
    return stripHtmlExtension(String(url).split("/").pop());
  }
}

function getProductSlug(product) {
  return (
    product.slug ||
    product.sku ||
    getSlugFromUrl(product.sourceUrls?.[0]) ||
    getSlugFromUrl(product.url) ||
    slugify(product.name)
  );
}

function normalizeAvailability(availability) {
  if (!availability) return null;
  if (typeof availability === "string") return availability;
  return availability.status || availability.raw || null;
}

function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function getRawProductJsonLd(product = {}) {
  return product.rawProductJsonLd && typeof product.rawProductJsonLd === "object"
    ? product.rawProductJsonLd
    : {};
}

function getRawOffer(product = {}) {
  const raw = getRawProductJsonLd(product);
  return Array.isArray(raw.offers) ? raw.offers[0] || {} : raw.offers || {};
}

function normalizeSchemaAvailability(value) {
  const text = typeof value === "string" ? value : value?.status || value?.raw || "";
  if (/instock/i.test(text)) return "InStock";
  if (/outofstock/i.test(text)) return "OutOfStock";
  return text || null;
}

function getProductDisplayName(product = {}) {
  const raw = getRawProductJsonLd(product);
  return (
    product.name ||
    raw.name ||
    product.trainingLabels?.productName ||
    product.title ||
    product.slug ||
    product.sku ||
    ""
  );
}

function getProductDisplayBrand(product = {}) {
  const raw = getRawProductJsonLd(product);
  return (
    product.brand ||
    raw.brand?.name ||
    product.trainingLabels?.brand ||
    product.trainingLabels?.deviceBrand ||
    ""
  );
}

function getProductDisplayImages(product = {}) {
  const raw = getRawProductJsonLd(product);
  return uniqueStrings([
    product.primaryImage,
    product.thumbnail,
    product.image,
    ...(product.images || []),
    ...asArray(raw.image),
    ...(product.sitemap?.images || []),
  ]);
}

function getProductDisplayPrice(product = {}) {
  const offer = getRawOffer(product);
  return (
    toPositiveNumber(product.price) ||
    toPositiveNumber(product.currentPrice) ||
    toPositiveNumber(offer.price) ||
    null
  );
}

function getProductDisplayCategories(product = {}) {
  const categories = Array.isArray(product.categories) ? product.categories.filter(Boolean) : [];
  if (categories.length) return categories;

  return uniqueStrings([
    product.trainingLabels?.categoryLevel1,
    product.trainingLabels?.categoryLevel2,
    product.trainingLabels?.deviceGroup,
  ]);
}

function buildFallbackSpecificationsFromProduct(product = {}) {
  const raw = getRawProductJsonLd(product);
  const rows = [];
  const seen = new Set();

  const pushRow = (label, value) => {
    if (!label || value === undefined || value === null || value === "") return;
    const key = `${label}:${String(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      id: slugify(label),
      label,
      value: Array.isArray(value) ? value.join(", ") : String(value),
    });
  };

  for (const [label, value] of Object.entries(product.attributes || {})) {
    pushRow(label, value);
  }

  for (const item of raw.additionalProperty || []) {
    pushRow(item.name, item.value);
  }

  return rows.length
    ? [{ id: "specifications", groupName: "Thông số kỹ thuật", rows }]
    : [];
}

function normalizeSpecifications(specifications = []) {
  if (!Array.isArray(specifications)) return [];

  return [
    {
      id: "specifications",
      groupName: "Thông số kỹ thuật",
      rows: specifications
        .filter((item) => item?.name && item?.value)
        .map((item) => ({
          id: slugify(item.name),
          label: item.name,
          value: item.value,
        })),
    },
  ];
}

function normalizeBreadcrumbs(product) {
  if (Array.isArray(product.categoryTrail) && product.categoryTrail.length > 0) {
    return product.categoryTrail.map((item, index) => ({
      id: item.id || slugify(`${index + 1}-${item.name || item.label || ""}`),
      name: item.name || item.label || "Danh mục",
      href: item.href || item.url || "#",
    }));
  }

  if (Array.isArray(product.breadcrumbs) && product.breadcrumbs.length > 0) {
    return product.breadcrumbs.map((item) => ({
      id: slugify(`${item.position || ""}-${item.name || ""}`),
      name: item.name,
      href: item.url || "#",
    }));
  }

  const categories = Array.isArray(product.categories) ? product.categories : [];
  return [
    { id: "home", name: "Trang chủ", href: "/" },
    ...categories.map((category) => ({
      id: slugify(category),
      name: category,
      href: "#",
    })),
  ];
}

function normalizeProduct(product) {
  if (!product) return null;

  const slug = getProductSlug(product);
  const images = getProductDisplayImages(product);
  const primaryImage = images[0] || "";
  const price = getProductDisplayPrice(product);
  const name = getProductDisplayName(product);
  const brand = getProductDisplayBrand(product);
  const categories = getProductDisplayCategories(product);
  const specifications = normalizeSpecifications(product.specifications);
  const fallbackSpecifications = specifications.some((group) => group.rows?.length)
    ? specifications
    : buildFallbackSpecificationsFromProduct(product);

  return {
    id: String(product._id || product.id || product.sku || slug),
    mongoId: product._id ? String(product._id) : null,
    source: product.source || "admin",
    url: product.url || product.detailUrl || "",
    sku: product.sku || slug,
    slug,
    detailBacked: Boolean(product.detailBacked || product.detailAvailable || product.detailSlug),
    detailSlug: product.detailSlug || null,
    detailUrl: product.detailUrl || null,
    storageStatus: product.storageStatus || null,
    name,
    brand,
    brandKey: product.brandKey,
    category: product.category,
    statusLabel: product.statusLabel,
    city: product.city,
    discount: typeof product.discount === "number" ? product.discount : null,
    rating: typeof product.rating === "number" ? product.rating : null,
    ratingCount: typeof product.ratingCount === "number" ? product.ratingCount : null,
    installment: product.installment,
    stock: Number.isFinite(Number(product.stock)) ? Number(product.stock) : null,
    inventory: Number.isFinite(Number(product.inventory)) ? Number(product.inventory) : null,
    currentPrice: price,
    originalPrice: toPositiveNumber(product.originalPrice) || price,
    priceCurrency: product.priceCurrency || "VND",
    availability: normalizeAvailability(product.availability) || normalizeSchemaAvailability(getRawOffer(product).availability),
    categories,
    categoryTrail: normalizeBreadcrumbs(product),
    thumbnail: primaryImage,
    primaryImage,
    images,
    media: images.map((src, index) => ({
      id: `${slug}-image-${index + 1}`,
      type: "image",
      label: index === 0 ? "Ảnh chính" : `Ảnh ${index + 1}`,
      src,
      alt: product.name,
    })),
    variants: product.variants || [],
    colors: product.colors || [],
    promotions: product.promotions || [],
    policies: product.policies || [],
    relatedProducts: product.relatedProducts || [],
    articleSections: product.articleSections || [],
    faqs: product.faqs || [],
    specifications: fallbackSpecifications,
    description: product.description || getRawProductJsonLd(product).description || "",
    sourceUrls: product.sourceUrls || [],
    scrapedAt: product.scrapedAt,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function getProductLookupSlugs(product = {}) {
  return uniqueStrings([
    product.detailSlug,
    product.slug,
    product.sku,
    getSlugFromUrl(product.url),
    ...(product.sourceUrls || []).map(getSlugFromUrl),
  ]);
}

function getProductLookupUrls(product = {}) {
  return uniqueStrings([
    product.detailUrl,
    product.url,
    ...(product.sourceUrls || []),
  ]);
}

function indexDetailSummaries(details = []) {
  const bySlug = new Map();
  const byUrl = new Map();

  const remember = (map, key, detail) => {
    if (key && !map.has(key)) map.set(key, detail);
  };

  for (const detail of details) {
    remember(bySlug, detail.slug, detail);
    remember(bySlug, detail.sku, detail);
    remember(bySlug, getSlugFromUrl(detail.url), detail);
    remember(bySlug, getSlugFromUrl(detail.inputUrl), detail);
    remember(bySlug, getSlugFromUrl(detail.sourceUrl), detail);
    remember(byUrl, detail.url, detail);
    remember(byUrl, detail.inputUrl, detail);
    remember(byUrl, detail.sourceUrl, detail);

    for (const sourceUrl of detail.sourceUrls || []) {
      remember(byUrl, sourceUrl, detail);
      remember(bySlug, getSlugFromUrl(sourceUrl), detail);
    }
  }

  return { bySlug, byUrl };
}

function findDetailForListProduct(product, detailIndex) {
  for (const slug of getProductLookupSlugs(product)) {
    const detail = detailIndex.bySlug.get(slug);
    if (detail) return detail;
  }

  for (const url of getProductLookupUrls(product)) {
    const detail = detailIndex.byUrl.get(url);
    if (detail) return detail;
  }

  return null;
}

function mergeProductWithDetailSummary(product, detail) {
  if (!detail) return product;

  const detailImages = uniqueStrings([
    detail.primaryImage,
    detail.thumbnail,
    detail.image,
    ...(detail.images || []),
  ]);
  const productImages = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
  const productCategories = Array.isArray(product.categories) ? product.categories.filter(Boolean) : [];
  const detailCategories = uniqueStrings([
    detail.category,
    ...(detail.categoryTrail || []).map((item) => item?.name || item?.label),
  ]).filter((category) => category !== "Trang chủ");
  const sourceUrls = uniqueStrings([
    product.url,
    product.detailUrl,
    detail.url,
    detail.inputUrl,
    detail.sourceUrl,
    ...(product.sourceUrls || []),
    ...(detail.sourceUrls || []),
  ]);
  const price = detail.currentPrice ?? product.currentPrice ?? product.price;

  return {
    ...product,
    detailBacked: true,
    detailSlug: detail.slug || product.detailSlug,
    detailUrl: detail.url || product.detailUrl,
    storageStatus: detail.storageStatus || product.storageStatus,
    source: product.source || detail.source,
    sku: product.sku || detail.sku,
    name: detail.name || detail.productName || product.name,
    brand: detail.brand || product.brand,
    brandKey: detail.brandKey || product.brandKey,
    category: detail.category || product.category,
    categories: productCategories.length ? productCategories : detailCategories,
    categoryTrail: Array.isArray(detail.categoryTrail) && detail.categoryTrail.length
      ? detail.categoryTrail
      : product.categoryTrail,
    price,
    currentPrice: price,
    originalPrice: detail.originalPrice ?? product.originalPrice,
    discount: detail.discount ?? product.discount,
    rating: detail.rating ?? product.rating,
    ratingCount: detail.ratingCount ?? product.ratingCount,
    installment: detail.installment ?? product.installment,
    statusLabel: detail.statusLabel || product.statusLabel,
    city: detail.city || product.city,
    primaryImage: detailImages[0] || product.primaryImage,
    thumbnail: detail.thumbnail || detailImages[0] || product.thumbnail,
    image: detail.image || detailImages[0] || product.image,
    images: detailImages.length ? detailImages : productImages,
    sourceUrls,
  };
}

async function mergeProductListWithDetailSummaries(productDetails, docs = []) {
  if (!docs.length) return docs;

  const slugs = uniqueStrings(docs.flatMap(getProductLookupSlugs));
  const urls = uniqueStrings(docs.flatMap(getProductLookupUrls));
  const or = [];

  if (slugs.length) {
    or.push({ slug: { $in: slugs } });
    or.push({ sku: { $in: slugs } });
  }

  if (urls.length) {
    or.push({ url: { $in: urls } });
    or.push({ inputUrl: { $in: urls } });
    or.push({ sourceUrl: { $in: urls } });
    or.push({ sourceUrls: { $in: urls } });
  }

  if (!or.length) return docs;

  const details = await productDetails
    .find(
      { $or: or },
      {
        projection: {
          source: 1,
          sourceUrl: 1,
          inputUrl: 1,
          url: 1,
          sourceUrls: 1,
          slug: 1,
          sku: 1,
          productId: 1,
          name: 1,
          productName: 1,
          title: 1,
          brand: 1,
          brandKey: 1,
          category: 1,
          categoryTrail: 1,
          currentPrice: 1,
          originalPrice: 1,
          discount: 1,
          rating: 1,
          ratingCount: 1,
          installment: 1,
          statusLabel: 1,
          city: 1,
          thumbnail: 1,
          image: 1,
          primaryImage: 1,
          images: { $slice: 8 },
          storageStatus: 1,
          updatedAt: 1,
        },
      }
    )
    .toArray();

  const detailIndex = indexDetailSummaries(details);
  return docs.map((product) => mergeProductWithDetailSummary(
    product,
    findDetailForListProduct(product, detailIndex)
  ));
}

function buildListQuery(searchParams) {
  const query = {};
  const source = searchParams.get("source") || "cellphones";
  const q = searchParams.get("q");
  const category = searchParams.get("category");
  const brand = searchParams.get("brand");
  const segment = searchParams.get("segment");
  const inStock = searchParams.get("inStock");
  const filter = searchParams.get("filter");
  const facet = searchParams.get("facet");
  const priceMin = toPositiveNumber(searchParams.get("priceMin") || searchParams.get("price_min") || searchParams.get("minPrice"));
  const priceMax = toPositiveNumber(searchParams.get("priceMax") || searchParams.get("price_max") || searchParams.get("maxPrice"));
  const ram = searchParams.get("ram");
  const storage = searchParams.get("storage");
  const screenSize = searchParams.get("screen_size") || searchParams.get("screenSize");

  if (source !== "all") query.source = source;

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { name: regex },
      { sku: regex },
      { brand: regex },
      { categories: regex },
      { sourceUrls: regex },
      { url: regex },
    ];
  }

  if (category) appendAndCondition(query, buildCategoryCondition(category));
  if (brand && brand !== "all") appendAndCondition(query, buildBrandCondition(brand));
  if (segment) appendAndCondition(query, buildSegmentCondition(segment));
  if (facet) appendAndCondition(query, buildFacetCondition(facet));
  if (filter) appendAndCondition(query, buildFilterCondition(filter));
  if (ram) appendAndCondition(query, buildFeatureValueCondition("ram", ram));
  if (storage) appendAndCondition(query, buildFeatureValueCondition("storage", storage));
  if (screenSize) appendAndCondition(query, buildFeatureValueCondition("screen-size", screenSize));
  if (priceMin || priceMax) appendAndCondition(query, buildPriceRangeCondition(priceMin, priceMax));

  if (inStock === "true") appendAndCondition(query, buildStockCondition(true));
  if (inStock === "false") appendAndCondition(query, buildStockCondition(false));

  return query;
}

function buildStockCondition(inStock = true) {
  const inStockCondition = {
    $or: [
      { "availability.status": "InStock" },
      { availability: "InStock" },
      { stockStatus: "InStock" },
      { inStock: true },
      { statusLabel: { $regex: "C.n h.ng|Còn hàng|Con hang|InStock", $options: "i" } },
    ],
  };

  if (inStock) return inStockCondition;

  return {
    $or: [
      { "availability.status": { $ne: "InStock" } },
      { availability: { $ne: "InStock" } },
      { statusLabel: { $regex: "Li.n h.|H.t h.ng|OutOfStock", $options: "i" } },
    ],
  };
}

function buildPriceRangeCondition(min, max) {
  const range = {};
  if (min) range.$gte = min;
  if (max) range.$lte = max;

  if (!Object.keys(range).length) return {};

  return {
    $or: [
      { currentPrice: range },
      { price: range },
    ],
  };
}

function buildFeatureValueCondition(kind = "", value = "") {
  const clean = cleanLimitedText(value, 80);
  if (!clean) return {};

  const normalized = normalizeSearchKey(clean);
  const compact = normalized.replace(/\s+/g, "");
  const fields = [
    "name",
    "slug",
    "sku",
    "description",
    "category",
    "categories",
    "specifications.name",
    "specifications.value",
    "specifications.label",
    "specifications.rows.label",
    "specifications.rows.value",
    "articleSections.heading",
    "articleSections.paragraphs",
    "rawProductJsonLd.additionalProperty.name",
    "rawProductJsonLd.additionalProperty.value",
    "trainingLabels.productName",
  ];
  const escaped = escapeRegex(clean);
  const compactEscaped = escapeRegex(compact);

  if (kind === "ram") {
    const number = compact.match(/\d+/)?.[0];
    const regex = number
      ? new RegExp(`\\b${escapeRegex(number)}\\s?gb\\s?(ram)?\\b|ram\\s?${escapeRegex(number)}\\s?gb`, "i")
      : new RegExp(escaped, "i");
    return regexCondition(fields, regex);
  }

  if (kind === "storage") {
    const regex = new RegExp(`${escaped}|${compactEscaped}|\\b${compactEscaped.replace(/gb|tb/gi, "")}\\s?(gb|tb)\\b`, "i");
    return regexCondition(fields, regex);
  }

  if (kind === "screen-size") {
    const number = compact.match(/\d+(?:\\.\\d+)?/)?.[0];
    const regex = number
      ? new RegExp(`${escapeRegex(number)}\\s?(inch|inches|\"|”|in)`, "i")
      : new RegExp(escaped, "i");
    return regexCondition(fields, regex);
  }

  return regexCondition(fields, new RegExp(escaped, "i"));
}

function buildFilterCondition(filter = "") {
  const key = normalizeSearchKey(filter).replace(/[^a-z0-9]+/g, "-");

  if (key === "hot-deal" || key === "discount" || key === "khuyen-mai-hot") {
    return {
      $or: [
        { discount: { $gt: 0 } },
        { promotions: { $exists: true, $ne: [] } },
        { priceBenefits: { $exists: true, $ne: [] } },
      ],
    };
  }

  return {};
}

function buildFacetCondition(facet = "") {
  const key = normalizeSearchKey(facet).replace(/[^a-z0-9]+/g, "-");
  const fields = [
    "name",
    "slug",
    "sku",
    "category",
    "categories",
    "description",
    "articleTitle",
    "articleSections.heading",
    "articleSections.paragraphs",
    "specifications.name",
    "specifications.value",
    "specifications.label",
    "specifications.rows.label",
    "specifications.rows.value",
    "rawProductJsonLd.name",
    "rawProductJsonLd.description",
    "rawProductJsonLd.additionalProperty.name",
    "rawProductJsonLd.additionalProperty.value",
    "trainingLabels.labelPathText",
    "trainingLabels.productName",
    "trainingLabels.deviceLine",
  ];
  const facetRegexes = {
    storage: /\b(32|64|128|256|512)\s?gb\b|\b(1|2|4)\s?tb\b|rom|bộ nhớ|bo nho|storage/i,
    ram: /\b(2|3|4|6|8|12|16|18|24|32|64)\s?gb\s?(ram)?\b|ram/i,
    "screen-size": /\b([1-9]|1[0-9]|2[0-9]|3[0-9])(\.\d)?\s?(inch|inches|")\b|màn hình|man hinh|display/i,
    usage: /gaming|chơi game|choi game|văn phòng|van phong|đồ họa|do hoa|học tập|hoc tap|pin trâu|pin trau|mỏng nhẹ|mong nhe/i,
    display: /oled|amoled|ips|retina|mini-?led|qled|lcd|tft|màn hình|man hinh/i,
    camera: /camera|chụp|chup|zoom|ois|leica|zeiss|hasselblad|gimbal|chống rung|chong rung/i,
    "refresh-rate": /\b(60|75|90|100|120|144|165|180|240|360)\s?hz\b|tần số quét|tan so quet/i,
    special: /5g|nfc|ai|wifi|wi-fi|bluetooth|sạc nhanh|sac nhanh|kháng nước|khang nuoc|chống nước|chong nuoc|active|magsafe/i,
  };
  const regex = facetRegexes[key];

  return regex ? regexCondition(fields, regex) : {};
}

function buildSort(sortKey) {
  const key = String(sortKey || "").trim().toLowerCase().replace(/-/g, "_");
  switch (key) {
    case "price_asc":
      return { currentPrice: 1, price: 1, name: 1 };
    case "price_desc":
      return { currentPrice: -1, price: -1, name: 1 };
    case "name":
      return { name: 1 };
    case "oldest":
      return { scrapedAt: 1, name: 1 };
    case "hot_deal":
    case "promotion_hot":
    case "popular":
      return { discount: -1, webFreshnessScore: -1, updatedAt: -1, scrapedAt: -1, name: 1 };
    case "latest":
    default:
      return {
        webFreshnessScore: -1,
        realWorldYear: -1,
        effectiveRealWorldYear: -1,
        sitemapSortRank: -1,
        updatedAt: -1,
        scrapedAt: -1,
        name: 1,
      };
  }
}

function normalizeLookupText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function getIdentifierAliasCandidates(identifier = "") {
  const clean = stripHtmlExtension(identifier);
  const aliases = new Set();

  const addAlias = (value) => {
    const slug = stripHtmlExtension(value);
    if (slug && slug !== clean) aliases.add(slug);
  };

  // CellphoneS often uses the base URL for the default 256GB iPhone variant:
  // /iphone-17-pro-max.html, while users/cards may naturally request
  // /iphone-17-pro-max-256gb.html.
  if (/^iphone-\d{1,2}(?:-[a-z0-9]+)*-\d+(?:gb|tb)$/i.test(clean)) {
    addAlias(clean.replace(/-\d+(?:gb|tb)$/i, ""));
  }

  // Samsung default variants often omit "12GB 256GB" from the canonical slug.
  if (/^(?:dien-thoai-)?samsung-galaxy-s\d+/i.test(clean)) {
    addAlias(clean.replace(/-\d+gb-\d+(?:gb|tb)$/i, ""));
  }

  return [...aliases];
}

function getDetailSignalScore(product = {}) {
  const counts = product.counts || {};
  const mediaCount = counts.media || product.media?.length || product.images?.length || 0;
  const variantCount = counts.variants || product.variants?.length || 0;
  const colorCount = counts.colors || product.colors?.length || 0;
  const specGroupCount = counts.specifications || product.specifications?.length || 0;
  const articleLength = String(product.articleHtml || product.descriptionHtml || "").length;
  const storageBytes = Number(product.storage?.jsonBytes || 0);

  return (
    Math.min(storageBytes, 150_000) +
    mediaCount * 2_500 +
    variantCount * 4_000 +
    colorCount * 3_000 +
    specGroupCount * 2_000 +
    (product.hasArticleHtml || articleLength > 0 ? 35_000 : 0) +
    Math.min(articleLength, 80_000)
  );
}

function isUsedOrOldProduct(product = {}) {
  const trail = Array.isArray(product.categoryTrail)
    ? product.categoryTrail.map((item) => item?.name || item?.label || "").join(" ")
    : "";
  const text = normalizeLookupText([
    product.slug,
    product.sku,
    product.name,
    product.productName,
    product.title,
    product.category,
    trail,
  ].filter(Boolean).join(" "));

  return /(^|[\s-])(hang cu|cu dep|cu tray xuoc|cu|like new|like-new|da kich hoat|tray xuoc|trung bay|qua su dung|refurbished)([\s-]|$)/i
    .test(text);
}

function getStockScore(product = {}) {
  const status = normalizeLookupText([
    product.statusLabel,
    normalizeAvailability(product.availability),
    normalizeSchemaAvailability(getRawOffer(product).availability),
  ].filter(Boolean).join(" "));

  if (/\b(con hang|instock)\b/.test(status)) return 120_000;
  if (/\b(het hang|outofstock|lien he)\b/.test(status)) return -80_000;
  return 0;
}

function scoreProductCandidate(product = {}, requestedSlug = "", canonicalSlugs = []) {
  const slug = getProductSlug(product);
  const slugKey = normalizeLookupText(slug);
  const requestedKey = normalizeLookupText(requestedSlug);
  const canonicalKeys = new Set(canonicalSlugs.map(normalizeLookupText));
  let score = 0;

  if (slugKey === requestedKey) score += 1_000_000;
  if (canonicalKeys.has(slugKey)) score += 900_000;
  if (product.url && getSlugFromUrl(product.url) === requestedSlug) score += 700_000;
  if (isUsedOrOldProduct(product)) score -= 850_000;

  score += getStockScore(product);
  score += getDetailSignalScore(product);
  score += Number(product.webFreshnessScore || 0) * 2_000;
  score += Number(product.sitemapSortRank || 0);
  score += Number(product.realWorldYear || product.effectiveRealWorldYear || 0);

  return score;
}

function pickBestProductCandidate(candidates = [], requestedSlug = "", canonicalSlugs = []) {
  return candidates
    .filter(Boolean)
    .sort((left, right) => (
      scoreProductCandidate(right, requestedSlug, canonicalSlugs) -
      scoreProductCandidate(left, requestedSlug, canonicalSlugs)
    ))[0] || null;
}

async function findBestProductForLookup(products, lookup, requestedSlug, canonicalSlugs = [], limit = 40) {
  const candidates = await products
    .find(lookup)
    .sort({
      webFreshnessScore: -1,
      realWorldYear: -1,
      effectiveRealWorldYear: -1,
      sitemapSortRank: -1,
      updatedAt: -1,
      scrapedAt: -1,
    })
    .limit(limit)
    .toArray();

  return pickBestProductCandidate(candidates, requestedSlug, canonicalSlugs);
}

async function findProductByIdentifier(products, identifier) {
  const clean = stripHtmlExtension(identifier);
  const escaped = escapeRegex(clean);
  const aliases = getIdentifierAliasCandidates(clean);
  const exactLookups = [
    ...(ObjectId.isValid(clean) ? [{ _id: new ObjectId(clean) }] : []),
    { slug: clean },
    { sku: clean },
    { url: clean },
    { sourceUrls: clean },
    { url: { $regex: `/${escaped}\\.html$`, $options: "i" } },
    { sourceUrls: { $elemMatch: { $regex: `/${escaped}\\.html$`, $options: "i" } } },
  ];
  const aliasLookups = aliases.flatMap((alias) => {
    const aliasEscaped = escapeRegex(alias);
    return [
      { slug: alias },
      { sku: alias },
      { url: { $regex: `/${aliasEscaped}\\.html$`, $options: "i" } },
      { sourceUrls: { $elemMatch: { $regex: `/${aliasEscaped}\\.html$`, $options: "i" } } },
    ];
  });
  const fuzzyLookups = [
    { slug: { $regex: `^${escaped}(-|$)`, $options: "i" } },
    { sku: { $regex: `^${escaped}(-|$)`, $options: "i" } },
    { url: { $regex: `/${escaped}(-[^/]+)?\\.html$`, $options: "i" } },
    { sourceUrls: { $elemMatch: { $regex: `/${escaped}(-[^/]+)?\\.html$`, $options: "i" } } },
  ];

  for (const lookup of exactLookups) {
    const product = await findBestProductForLookup(products, lookup, clean, aliases, 10);
    if (product) return product;
  }

  for (const lookup of aliasLookups) {
    const product = await findBestProductForLookup(products, lookup, clean, aliases, 10);
    if (product) return product;
  }

  const fuzzyCandidates = [];
  for (const lookup of fuzzyLookups) {
    const candidates = await products
      .find(lookup)
      .sort({
        webFreshnessScore: -1,
        realWorldYear: -1,
        effectiveRealWorldYear: -1,
        sitemapSortRank: -1,
        updatedAt: -1,
        scrapedAt: -1,
      })
      .limit(40)
      .toArray();
    fuzzyCandidates.push(...candidates);
  }

  return pickBestProductCandidate(fuzzyCandidates, clean, aliases);
}

async function findBestProductDetailForLookup(productDetails, lookup, requestedSlug, canonicalSlugs = [], limit = 40) {
  const candidates = await productDetails
    .find(lookup)
    .sort({
      webFreshnessScore: -1,
      realWorldYear: -1,
      effectiveRealWorldYear: -1,
      sitemapSortRank: -1,
      updatedAt: -1,
      scrapedAt: -1,
    })
    .limit(limit)
    .toArray();

  return pickBestProductCandidate(candidates, requestedSlug, canonicalSlugs);
}

async function findBestProductDetailForFallback(productDetails, identifier, product) {
  const directSlug = stripHtmlExtension(identifier);
  const canonicalSlugs = uniqueStrings([
    ...getIdentifierAliasCandidates(directSlug),
    product?.detailSlug,
    product?.slug,
    product?.sku,
    getSlugFromUrl(product?.url),
    ...(product?.sourceUrls || []).map(getSlugFromUrl),
  ]);
  const lookup = buildProductDetailLookup(identifier, product);

  return findBestProductDetailForLookup(productDetails, lookup, directSlug, canonicalSlugs, 50);
}

async function findOneBestExactDetail(productDetails, lookup, requestedSlug, canonicalSlugs = []) {
  return findBestProductDetailForLookup(productDetails, lookup, requestedSlug, canonicalSlugs, 10);
}

function normalizeProductDetails(detail) {
  if (!detail) return null;
  const { _id, ...rest } = detail;

  return {
    id: String(_id || detail.url || detail.slug),
    ...rest,
  };
}

function hasUsableProductDetail(detail) {
  if (!detail) return false;
  const name = String(detail.name || detail.productName || "").trim();
  const images = [
    detail.primaryImage,
    detail.thumbnail,
    detail.image,
    ...(detail.images || []),
    ...(detail.media || []).map((item) => item?.src || item?.thumbnail),
  ].filter(Boolean);
  const specCount = Array.isArray(detail.specifications)
    ? detail.specifications.reduce((total, group) => total + (group.rows?.length || 0), 0)
    : 0;

  return Boolean(name && (images.length > 0 || toPositiveNumber(detail.currentPrice)) && (
    toPositiveNumber(detail.currentPrice) ||
    specCount > 0 ||
    detail.articleHtml ||
    detail.description
  ));
}

function buildSummaryBackedDetail(product, detail = {}, identifier = "") {
  if (!product) return detail;

  const summary = normalizeProduct(product);
  const slug = detail.slug || summary.detailSlug || summary.slug || stripHtmlExtension(identifier);
  const images = uniqueStrings([
    detail.primaryImage,
    detail.thumbnail,
    detail.image,
    ...(detail.images || []),
    summary.primaryImage,
    summary.thumbnail,
    ...(summary.images || []),
  ]);
  const media = Array.isArray(detail.media) && detail.media.length
    ? detail.media
    : images.map((src, index) => ({
      id: `${slug}-summary-image-${index + 1}`,
      type: "image",
      label: index === 0 ? "Ảnh chính" : `Ảnh ${index + 1}`,
      src,
      thumbnail: src,
      alt: summary.name,
    }));
  const specifications = Array.isArray(detail.specifications) && detail.specifications.some((group) => group.rows?.length)
    ? detail.specifications
    : summary.specifications || [];
  const price = toPositiveNumber(detail.currentPrice) || summary.currentPrice;

  return {
    ...detail,
    source: detail.source || summary.source || "cellphones",
    sourceUrl: detail.sourceUrl || detail.url || summary.url,
    inputUrl: detail.inputUrl || summary.url,
    url: detail.url || summary.url,
    sourceUrls: uniqueStrings([
      detail.url,
      detail.inputUrl,
      detail.sourceUrl,
      ...(detail.sourceUrls || []),
      summary.url,
      ...(summary.sourceUrls || []),
    ]),
    slug,
    sku: detail.sku || summary.sku || slug,
    name: detail.name || summary.name,
    productName: detail.productName || detail.name || summary.name,
    title: detail.title || product.title || summary.name,
    brand: detail.brand || summary.brand,
    brandKey: detail.brandKey || summary.brandKey,
    category: detail.category || summary.category || summary.categories?.[0],
    categoryTrail: Array.isArray(detail.categoryTrail) && detail.categoryTrail.length
      ? detail.categoryTrail
      : summary.categoryTrail,
    currentPrice: price,
    originalPrice: toPositiveNumber(detail.originalPrice) || summary.originalPrice || price,
    discount: detail.discount ?? summary.discount,
    rating: detail.rating ?? summary.rating,
    ratingCount: detail.ratingCount ?? summary.ratingCount,
    installment: detail.installment ?? summary.installment,
    statusLabel: detail.statusLabel || summary.statusLabel || (summary.availability === "InStock" ? "Còn hàng" : "Liên hệ"),
    city: detail.city || summary.city,
    thumbnail: detail.thumbnail || images[0] || "",
    image: detail.image || images[0] || "",
    primaryImage: detail.primaryImage || images[0] || "",
    images,
    media,
    specifications,
    description: detail.description || summary.description || "",
    detailCompleteness: hasUsableProductDetail(detail) ? "full" : "summary-fallback",
  };
}

function buildProductDetailLookup(identifier, product) {
  const directSlug = stripHtmlExtension(identifier);
  const slugs = new Set(
    [
      directSlug,
      product?.detailSlug,
      product?.slug,
      product?.sku,
      getSlugFromUrl(product?.url),
      ...(product?.sourceUrls || []).map(getSlugFromUrl),
    ].filter(Boolean)
  );
  const urls = new Set(
    [
      product?.url,
      product?.detailUrl,
      ...(product?.sourceUrls || []),
      directSlug ? `https://cellphones.com.vn/${directSlug}.html` : "",
    ].filter(Boolean)
  );
  const or = [];

  if (slugs.size > 0) {
    or.push({ slug: { $in: [...slugs] } });
  }

  if (urls.size > 0) {
    or.push({ url: { $in: [...urls] } });
    or.push({ inputUrl: { $in: [...urls] } });
    or.push({ sourceUrls: { $in: [...urls] } });
  }

  if (directSlug) {
    const escaped = escapeRegex(directSlug);
    or.push({ url: { $regex: `${escaped}\\.html$`, $options: "i" } });
    or.push({ inputUrl: { $regex: `${escaped}\\.html$`, $options: "i" } });
    or.push({ sourceUrls: { $regex: `${escaped}\\.html$`, $options: "i" } });
  }

  return or.length > 0 ? { $or: or } : { slug: "__not_found__" };
}

async function findProductDetailByIdentifier(productDetails, identifier, product) {
  const directSlug = stripHtmlExtension(identifier);
  const directUrl = directSlug ? `https://cellphones.com.vn/${directSlug}.html` : "";
  const canonicalSlugs = uniqueStrings([
    ...getIdentifierAliasCandidates(directSlug),
    product?.detailSlug,
    product?.slug,
    product?.sku,
    getSlugFromUrl(product?.url),
    ...(product?.sourceUrls || []).map(getSlugFromUrl),
  ]);
  const exactUrls = uniqueStrings([
    directUrl,
    product?.url,
    product?.detailUrl,
    ...(product?.sourceUrls || []),
  ]);
  const exactSlugs = uniqueStrings([
    directSlug,
    product?.detailSlug,
    product?.slug,
    product?.sku,
    getSlugFromUrl(product?.url),
    ...(product?.sourceUrls || []).map(getSlugFromUrl),
  ]);
  const exactLookups = [
    ...(ObjectId.isValid(directSlug) ? [{ _id: new ObjectId(directSlug) }] : []),
    ...exactSlugs.flatMap((slug) => [
      { slug },
      { sku: slug },
    ]),
    ...exactUrls.flatMap((url) => [
      { url },
      { inputUrl: url },
      { sourceUrl: url },
    ]),
    ...(exactUrls.length ? [{ sourceUrls: { $in: exactUrls } }] : []),
  ];
  const seen = new Set();

  for (const lookup of exactLookups) {
    const key = JSON.stringify(lookup);
    if (seen.has(key)) continue;
    seen.add(key);

    const detail = await findOneBestExactDetail(productDetails, lookup, directSlug, canonicalSlugs);
    if (detail) return detail;
  }

  return findBestProductDetailForFallback(productDetails, identifier, product);
}

function appendAndCondition(query, condition) {
  if (!condition || Object.keys(condition).length === 0) return query;

  if (query.$or) {
    query.$and = [...(query.$and || []), { $or: query.$or }, condition];
    delete query.$or;
    return query;
  }

  query.$and = [...(query.$and || []), condition];
  return query;
}

function regexCondition(fields = [], regex) {
  return {
    $or: fields.map((field) => ({ [field]: regex })),
  };
}

function normalizeSearchKey(value = "") {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function buildCategoryCondition(category = "") {
  const text = String(category || "").trim();
  if (!text) return {};

  const key = normalizeSearchKey(text);
  const escaped = escapeRegex(text);
  const aliasCategories = {
    "do gia dung": ["Đồ gia dụng", "Nhà thông minh"],
  };
  const exactOnlyCategories = new Set([
    "dien thoai",
    "may tinh bang",
    "laptop",
    "phu kien",
    "do gia dung",
    "am thanh",
    "tivi",
    "dong ho thong minh",
    "hang cu",
  ]);
  const prefixCategories = new Set([
    "tai nghe",
    "loa",
    "man hinh",
    "may giat",
    "may say quan ao",
    "dieu hoa - may lanh",
    "camera",
  ]);

  const regexes = aliasCategories[key]
    ? aliasCategories[key].map((alias) => new RegExp(`^${escapeRegex(alias)}$`, "i"))
    : exactOnlyCategories.has(key)
      ? [new RegExp(`^${escaped}$`, "i")]
      : prefixCategories.has(key)
        ? [new RegExp(`^${escaped}(\\b|\\s|$)`, "i")]
        : [
          new RegExp(`^${escaped}$`, "i"),
          new RegExp(`^${escaped}(\\b|\\s|$)`, "i"),
        ];

  return {
    $or: regexes.flatMap((regex) => [
      { category: regex },
      { categories: regex },
      { "categoryTrail.name": regex },
      { "categoryTrail.label": regex },
      { "trainingLabels.categoryLevel1": regex },
      { "trainingLabels.categoryLevel2": regex },
      { "trainingLabels.deviceGroup": regex },
    ]),
  };
}

function createBrandRegex(brand = "") {
  const key = String(brand || "").trim().toLowerCase();
  const aliases = {
    macbook: "\\bmacbook\\b",
    apple: "apple|iphone|ipad|\\bmacbook\\b|\\bmac\\b",
    samsung: "samsung|galaxy",
    xiaomi: "xiaomi|redmi|poco",
    oppo: "\\boppo\\b|realme|oneplus",
    honor: "honor",
    asus: "\\basus\\b|\\brog\\b|\\btuf\\b",
    lenovo: "lenovo|legion",
    hp: "\\bhp\\b|\\bomen\\b|pavilion|probook|elitebook|omnibook",
    lg: "\\blg\\b",
    coocaa: "\\bcoocaa\\b",
    garmin: "\\bgarmin\\b",
    sharp: "\\bsharp\\b",
    roborock: "\\broborock\\b",
    dreame: "\\bdreame\\b",
    tineco: "\\btineco\\b",
  };

  return new RegExp(aliases[key] || `\\b${escapeRegex(key)}\\b`, "i");
}

function buildBrandCondition(brand = "") {
  const regex = createBrandRegex(brand);
  return regexCondition([
    "brand",
    "brandKey",
    "name",
    "slug",
    "trainingLabels.brand",
    "trainingLabels.deviceBrand",
    "rawProductJsonLd.brand.name",
  ], regex);
}

function buildSegmentCondition(segment = "") {
  const key = String(segment || "").trim().toLowerCase();
  const fields = [
    "name",
    "slug",
    "categories",
    "trainingLabels.labelPathText",
    "trainingLabels.productName",
    "trainingLabels.deviceLine",
    "rawProductJsonLd.name",
    "rawProductJsonLd.description",
    "rawProductJsonLd.additionalProperty.value",
    "attributes.Công nghệ mạng",
    "attributes.Thông số pin",
    "attributes.Pin",
    "attributes.Camera sau",
    "attributes.Camera trước",
    "attributes.Tính năng camera",
    "attributes.Tính năng khác",
  ];
  if (key === "monitor" || key === "man-hinh") {
    const monitorFields = [
      "name",
      "slug",
      "categories",
      "trainingLabels.labelPathText",
      "trainingLabels.productName",
      "trainingLabels.deviceLine",
      "rawProductJsonLd.name",
      "rawProductJsonLd.description",
    ];

    return {
      $and: [
        regexCondition(monitorFields, /màn hình|man hinh|monitor|gaming monitor/i),
        {
          $nor: [
            { category: /tivi/i },
            { categories: /tivi/i },
            { "categoryTrail.name": /tivi/i },
            { "categoryTrail.label": /tivi/i },
            { name: /tivi|smart tv|smart tivi/i },
            { slug: /tivi|smart-tv|smart-tivi/i },
            { category: /laptop/i },
            { categories: /laptop/i },
            { "categoryTrail.name": /laptop/i },
            { "categoryTrail.label": /laptop/i },
            { name: /laptop/i },
            { slug: /laptop/i },
          ],
        },
      ],
    };
  }

  if (key === "pc" || key === "pc-gaming") {
    return {
      $and: [
        regexCondition(fields, /pc gaming|pc cps|máy tính để bàn|desktop|may tinh de ban/i),
        {
          $nor: [
            { categories: /Laptop/i },
            { name: /laptop/i },
            { slug: /laptop/i },
          ],
        },
      ],
    };
  }

  const segments = {
    game: /game|gaming|rog|legion|redmagic|red magic|black shark|nubia|poco/i,
    gaming: /game|gaming|rog|legion|redmagic|red magic|black shark|nubia|poco/i,
    pin: /pin|mah|mAh|6000|6500|7000|8000|10000|pin trâu|pin-trau/i,
    battery: /pin|mah|mAh|6000|6500|7000|8000|10000|pin trâu|pin-trau/i,
    "5g": /5g/i,
    camera: /camera|chụp|chup|pro max|ultra|find x|xiaomi 15|vivo x|zeiss|leica|hasselblad/i,
    photography: /camera|chụp|chup|pro max|ultra|find x|xiaomi 15|vivo x|zeiss|leica|hasselblad/i,
    gap: /fold|flip|gập|gap|z fold|z flip|find n/i,
    fold: /fold|flip|gập|gap|z fold|z flip|find n/i,
  };
  const regex = segments[key];

  return regex ? regexCondition(fields, regex) : {};
}

function resolveProductDetailUrl(identifier, product) {
  const candidates = [
    product?.url,
    ...(product?.sourceUrls || []),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (/^https?:\/\/cellphones\.com\.vn\//i.test(candidate)) return candidate;
  }

  const slug = stripHtmlExtension(identifier || product?.slug || product?.sku);
  return slug ? `https://cellphones.com.vn/${slug}.html` : "";
}

async function persistProductDetailManifest({ productDetails, detail }) {
  const storage = await writeProductDetailFile(detail);
  const manifest = buildProductDetailManifest(detail, storage);
  const now = new Date();

  await productDetails.updateOne(
    { source: manifest.source, slug: manifest.slug },
    {
      $set: {
        ...manifest,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  return manifest;
}

function sanitizeProductInput(input, { isCreate = false } = {}) {
  const allowed = [
    "source",
    "url",
    "sourceUrls",
    "name",
    "brand",
    "sku",
    "slug",
    "price",
    "currentPrice",
    "originalPrice",
    "priceCurrency",
    "availability",
    "stock",
    "inventory",
    "categories",
    "breadcrumbs",
    "primaryImage",
    "images",
    "specifications",
    "description",
    "variants",
    "colors",
    "promotions",
    "policies",
    "relatedProducts",
    "articleSections",
    "faqs",
  ];

  const product = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, key)) product[key] = input[key];
  }

  if (typeof product.name === "string") product.name = product.name.trim();
  if (typeof product.brand === "string") product.brand = product.brand.trim();
  if (product.currentPrice !== undefined && product.price === undefined) product.price = product.currentPrice;
  if (product.price !== undefined) product.price = Number(product.price);
  if (product.originalPrice !== undefined) product.originalPrice = Number(product.originalPrice);
  if (!product.slug && (product.sku || product.name)) product.slug = slugify(product.sku || product.name);
  if (!product.sku && product.slug) product.sku = product.slug;
  if (!product.source) product.source = "admin";
  if (!product.priceCurrency) product.priceCurrency = "VND";

  if (isCreate && !product.name) {
    throw new Error("Product name is required.");
  }

  if (product.price !== undefined && !Number.isFinite(product.price)) {
    throw new Error("Product price must be a number.");
  }

  delete product._id;
  delete product.id;
  delete product.mongoId;

  return product;
}

function isWriteAuthorized(req) {
  return isAdminAuthorized(req);
}

async function getDb() {
  if (!mongoClient) {
    mongoClient = createMongoClient();
    await mongoClient.connect();
  }

  const {
    dbName,
    productsCollection,
    productDetailsCollection,
    productReviewsCollection,
    productQuestionsCollection,
    cartsCollection,
    ordersCollection,
    paymentsCollection,
    couponsCollection,
    inventoryCollection,
    userEventsCollection,
    shipmentsCollection,
    wishlistsCollection,
    notificationsCollection,
    addressesCollection,
    returnsCollection,
    warrantiesCollection,
    adminAuditLogsCollection,
  } = getMongoConfig();
  const db = mongoClient.db(dbName);
  const context = {
    db,
    dbName,
    productsCollection,
    productDetailsCollection,
    productReviewsCollection,
    productQuestionsCollection,
    cartsCollection,
    ordersCollection,
    paymentsCollection,
    couponsCollection,
    inventoryCollection,
    userEventsCollection,
    shipmentsCollection,
    wishlistsCollection,
    notificationsCollection,
    addressesCollection,
    returnsCollection,
    warrantiesCollection,
    adminAuditLogsCollection,
    products: db.collection(productsCollection),
    productDetails: db.collection(productDetailsCollection),
    productReviews: db.collection(productReviewsCollection),
    productQuestions: db.collection(productQuestionsCollection),
    carts: db.collection(cartsCollection),
    orders: db.collection(ordersCollection),
    payments: db.collection(paymentsCollection),
    coupons: db.collection(couponsCollection),
    inventory: db.collection(inventoryCollection),
    userEvents: db.collection(userEventsCollection),
    shipments: db.collection(shipmentsCollection),
    wishlists: db.collection(wishlistsCollection),
    notifications: db.collection(notificationsCollection),
    addresses: db.collection(addressesCollection),
    returns: db.collection(returnsCollection),
    warranties: db.collection(warrantiesCollection),
    adminAuditLogs: db.collection(adminAuditLogsCollection),
  };
  await ensureCommerceDatabase({
    ...context,
    collectionNames: {
      productDetailsCollection,
      productReviewsCollection,
      productQuestionsCollection,
      cartsCollection,
      ordersCollection,
      couponsCollection,
      inventoryCollection,
      paymentsCollection,
      shipmentsCollection,
      wishlistsCollection,
      notificationsCollection,
      addressesCollection,
      returnsCollection,
      warrantiesCollection,
    },
  });
  return context;
}

async function handleHealth(_req, res) {
  const {
    db,
    dbName,
    productsCollection,
    productDetailsCollection,
    productReviewsCollection,
    productQuestionsCollection,
    cartsCollection,
    ordersCollection,
    paymentsCollection,
    couponsCollection,
    inventoryCollection,
    userEventsCollection,
    shipmentsCollection,
    wishlistsCollection,
    notificationsCollection,
    addressesCollection,
    adminAuditLogsCollection,
    products,
    productDetails,
    productReviews,
    productQuestions,
    carts,
    orders,
    payments,
    coupons,
    inventory,
    userEvents,
    shipments,
    wishlists,
    notifications,
    addresses,
    adminAuditLogs,
  } =
    await getDb();
  await db.command({ ping: 1 });
  const [
    totalProducts,
    totalProductDetails,
    totalReviews,
    totalQuestions,
    totalCarts,
    totalOrders,
    totalPayments,
    totalCoupons,
    totalInventory,
    totalUserEvents,
    totalShipments,
    totalWishlists,
    totalNotifications,
    totalAddresses,
    totalAdminAuditLogs,
  ] = await Promise.all([
    products.estimatedDocumentCount(),
    productDetails.estimatedDocumentCount(),
    productReviews.estimatedDocumentCount(),
    productQuestions.estimatedDocumentCount(),
    carts.estimatedDocumentCount(),
    orders.estimatedDocumentCount(),
    payments.estimatedDocumentCount(),
    coupons.estimatedDocumentCount(),
    inventory.estimatedDocumentCount(),
    userEvents.estimatedDocumentCount(),
    shipments.estimatedDocumentCount(),
    wishlists.estimatedDocumentCount(),
    notifications.estimatedDocumentCount(),
    addresses.estimatedDocumentCount(),
    adminAuditLogs.estimatedDocumentCount(),
  ]);
  sendJson(res, 200, {
    ok: true,
    database: dbName,
    productsCollection,
    productDetailsCollection,
    productReviewsCollection,
    productQuestionsCollection,
    cartsCollection,
    ordersCollection,
    paymentsCollection,
    couponsCollection,
    inventoryCollection,
    userEventsCollection,
    shipmentsCollection,
    wishlistsCollection,
    notificationsCollection,
    addressesCollection,
    adminAuditLogsCollection,
    totalProducts,
    totalProductDetails,
    totalReviews,
    totalQuestions,
    totalCarts,
    totalOrders,
    totalPayments,
    totalCoupons,
    totalInventory,
    totalUserEvents,
    totalShipments,
    totalWishlists,
    totalNotifications,
    totalAddresses,
    totalAdminAuditLogs,
  });
}

async function handleApiIndex(_req, res) {
  const {
    dbName,
    productsCollection,
    productDetailsCollection,
    productReviewsCollection,
    productQuestionsCollection,
    cartsCollection,
    ordersCollection,
    paymentsCollection,
    couponsCollection,
    inventoryCollection,
    userEventsCollection,
    shipmentsCollection,
    wishlistsCollection,
    notificationsCollection,
    addressesCollection,
    adminAuditLogsCollection,
  } = getMongoConfig();
  sendJson(res, 200, {
    ok: true,
    message: "CellphoneS clone API is running.",
    database: dbName,
    productsCollection,
    productDetailsCollection,
    productReviewsCollection,
    productQuestionsCollection,
    cartsCollection,
    ordersCollection,
    paymentsCollection,
    couponsCollection,
    inventoryCollection,
    userEventsCollection,
    shipmentsCollection,
    wishlistsCollection,
    notificationsCollection,
    addressesCollection,
    adminAuditLogsCollection,
    endpoints: {
      health: "/api/health",
      products: "/api/products",
      productDetail: "/api/products/:slug",
      productDetails: "/api/products/:slug/details",
      productReviews: "/api/products/:slug/reviews",
      productQuestions: "/api/products/:slug/questions",
      cart: "/api/cart",
      cartItems: "/api/cart/items",
      orders: "/api/orders",
      addresses: "/api/addresses",
      wishlist: "/api/wishlist",
      notifications: "/api/notifications",
      bankPaymentWebhook: "/api/payments/bank-transfer-webhook",
      confirmOrderPayment: "/api/orders/:orderCode/payment/confirm",
      requestRegisterOtp: "/api/auth/request-register-otp",
      verifyRegisterOtp: "/api/auth/verify-register-otp",
      login: "/api/auth/login",
      me: "/api/auth/me",
      adminSummary: "/api/admin/summary",
      adminOrders: "/api/admin/orders",
      adminShipments: "/api/admin/shipments",
      adminPayments: "/api/admin/payments",
      adminInventory: "/api/admin/inventory",
      adminUsers: "/api/admin/users",
      adminReviews: "/api/admin/reviews",
      adminQuestions: "/api/admin/questions",
      adminCoupons: "/api/admin/coupons",
      adminRevenue: "/api/admin/revenue",
      adminAuditLogs: "/api/admin/audit-logs",
    },
  });
}

async function handleListProducts(req, res) {
  const { productDetails } = await getDb();
  const webProducts = productDetails;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const skip = (page - 1) * limit;
  const query = buildListQuery(url.searchParams);
  const sort = buildSort(url.searchParams.get("sort"));
  const includeRaw = url.searchParams.get("raw") === "true";
  const includeDetails = url.searchParams.get("include") === "details";

  const projection = includeRaw
    ? undefined
    : {
      name: 1,
      brand: 1,
      brandKey: 1,
      url: 1,
      sku: 1,
      slug: 1,
      detailAvailable: 1,
      detailBacked: 1,
      detailSlug: 1,
      detailUrl: 1,
      price: 1,
      currentPrice: 1,
      originalPrice: 1,
      discount: 1,
      rating: 1,
      ratingCount: 1,
      installment: 1,
      statusLabel: 1,
      city: 1,
      priceCurrency: 1,
      availability: 1,
      stock: 1,
      inventory: 1,
      category: 1,
      categories: 1,
      categoryTrail: 1,
      breadcrumbs: 1,
      primaryImage: 1,
      thumbnail: 1,
      image: 1,
      images: { $slice: 5 },
      source: 1,
      sourceUrls: 1,
      scrapedAt: 1,
      updatedAt: 1,
      ...(includeDetails
        ? {
          title: 1,
          inputUrl: 1,
          attributes: 1,
          rawProductJsonLd: 1,
          sitemap: 1,
          trainingLabels: 1,
          description: 1,
          specifications: 1,
          variants: 1,
          colors: 1,
          promotions: 1,
          policies: 1,
          relatedProducts: 1,
          articleSections: 1,
          faqs: 1,
        }
        : {}),
    };

  const [total, docs] = await Promise.all([
    webProducts.countDocuments(query),
    webProducts.find(query, { projection }).sort(sort).skip(skip).limit(limit).toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: includeRaw ? docs : docs.map(normalizeProduct),
  });
}

async function handleGetProduct(_req, res, identifier) {
  const { productDetails } = await getDb();
  const doc = await findProductByIdentifier(productDetails, identifier);

  if (!doc) {
    sendError(res, 404, "Product not found.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    data: normalizeProduct(doc),
    raw: doc,
  });
}

async function handleGetProductDetails(req, res, identifier) {
  const { productDetails } = await getDb();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const includeRaw = url.searchParams.get("raw") === "true";
  const forceLazyScrape = url.searchParams.get("lazy") === "true" || url.searchParams.get("forceLazy") === "true";
  const product = await findProductByIdentifier(productDetails, identifier);
  const manifest = await findProductDetailByIdentifier(productDetails, identifier, product);
  let detail = await hydrateProductDetail(manifest);
  let cacheStatus = detail ? "hit" : "miss";

  if (!detail) {
    const detailUrl = resolveProductDetailUrl(identifier, product);

    if (!detailUrl) {
      sendError(res, 404, "Product details not found and no CellphoneS URL is available for lazy scrape.");
      return;
    }

    try {
      detail = await scrapeCellphonesDetailCached(detailUrl, { force: forceLazyScrape });
      await persistProductDetailManifest({ productDetails, detail });
      cacheStatus = "lazy-scraped";
    } catch (error) {
      if (!product) {
        const statusCode = ["LAZY_SCRAPE_DISABLED", "LAZY_SCRAPE_COOLDOWN"].includes(error.code) ? 404 : 502;
        sendError(res, statusCode, "Product details not found and lazy scrape is unavailable.", error.message);
        return;
      }

      detail = buildSummaryBackedDetail(product, {}, identifier);
      cacheStatus = error.code === "LAZY_SCRAPE_DISABLED"
        ? "summary-fallback:lazy-scrape-disabled"
        : error.code === "LAZY_SCRAPE_COOLDOWN"
          ? "summary-fallback:lazy-scrape-cooldown"
          : "summary-fallback:lazy-scrape-failed";
    }
  }

  if (detail && !hasUsableProductDetail(detail) && product) {
    detail = buildSummaryBackedDetail(product, detail, identifier);
    cacheStatus = `${cacheStatus}:summary-fallback`;
  }

  const payload = {
    ok: true,
    cacheStatus,
    product: product ? normalizeProduct(product) : null,
    data: normalizeProductDetails(detail),
  };

  if (includeRaw) payload.raw = manifest || detail;
  sendJson(res, 200, payload);
}

async function handleRelatedProducts(req, res, identifier) {
  const { productDetails } = await getDb();
  const webProducts = productDetails;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = toPositiveInt(url.searchParams.get("limit"), 8, 20);
  const product = await findProductByIdentifier(webProducts, identifier);

  if (!product) {
    sendError(res, 404, "Product not found.");
    return;
  }

  const relatedQuery = {
    _id: { $ne: product._id },
    source: product.source || "cellphones",
    $or: [
      ...(product.categories || []).map((category) => ({ categories: category })),
      ...(product.brand ? [{ brand: product.brand }] : []),
    ],
  };

  if (relatedQuery.$or.length === 0) delete relatedQuery.$or;

  const categories = Array.isArray(product.categories) ? product.categories.filter(Boolean) : [];
  const focusedCategories = categories.slice(-2);
  const broadCategories = categories.slice(0, -2);
  const scoreParts = [
    product.brand ? { $cond: [{ $eq: ["$brand", product.brand] }, 6, 0] } : 0,
    focusedCategories.length
      ? {
        $multiply: [
          {
            $size: {
              $setIntersection: [{ $ifNull: ["$categories", []] }, focusedCategories],
            },
          },
          3,
        ],
      }
      : 0,
    broadCategories.length
      ? {
        $size: {
          $setIntersection: [{ $ifNull: ["$categories", []] }, broadCategories],
        },
      }
      : 0,
  ];

  const docs = await webProducts
    .aggregate([
      { $match: relatedQuery },
      { $addFields: { _relatedScore: { $add: scoreParts } } },
      { $sort: { _relatedScore: -1, scrapedAt: -1, name: 1 } },
      { $limit: limit },
      {
        $project: {
          name: 1,
          brand: 1,
          sku: 1,
          slug: 1,
          price: 1,
          originalPrice: 1,
          priceCurrency: 1,
          availability: 1,
          categories: 1,
          primaryImage: 1,
          images: { $slice: [{ $ifNull: ["$images", []] }, 3] },
          source: 1,
          sourceUrls: 1,
          scrapedAt: 1,
        },
      },
    ])
    .toArray();

  sendJson(res, 200, {
    ok: true,
    baseProduct: normalizeProduct(product),
    data: docs.map(normalizeProduct),
  });
}

function getBearerToken(req) {
  return getAuthToken(req);
}

function getRequestUser(req) {
  const token = getAuthToken(req);
  if (!token) return null;

  try {
    return verifyJwt(token);
  } catch {
    return null;
  }
}

function cleanLimitedText(value = "", maxLength = 1000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase().slice(0, 160);
}

function sanitizePhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "").slice(0, 24);
}

function sanitizeRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return 5;
  return Math.min(5, Math.max(1, Math.round(rating)));
}

async function ensureCartIndexes(carts) {
  if (cartIndexesReady) return;

  await Promise.all([
    carts.createIndex({ userId: 1 }, { unique: true, name: "unique_cart_user" }),
    carts.createIndex({ updatedAt: -1 }, { name: "cart_updated_at" }),
  ]);

  cartIndexesReady = true;
}

function getCartOwner(req) {
  const requester = getRequestUser(req);
  const userId = String(requester?.sub || requester?.id || "").trim();

  if (!userId) return null;

  return {
    userId,
    email: normalizeEmail(requester.email),
    phone: sanitizePhone(requester.phone),
    role: requester.role || "customer",
  };
}

function cleanCartText(value = "", maxLength = 300) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanCartPrice(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

function cleanCartQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(99, Math.max(1, Math.round(parsed)));
}

function sanitizeCartOptions(input = {}) {
  const source = input.selectedOptions || input.options || {};
  const variant = input.variant || {};
  const color = input.color || {};
  const options = {
    variantId: cleanCartText(source.variantId || variant.id || input.variantId, 80),
    variantName: cleanCartText(source.variantName || variant.name || input.variantName, 120),
    colorId: cleanCartText(source.colorId || color.id || input.colorId, 80),
    colorName: cleanCartText(source.colorName || color.name || input.colorName, 120),
  };

  return Object.fromEntries(Object.entries(options).filter(([, value]) => Boolean(value)));
}

function getCartImage(input = {}) {
  const media = Array.isArray(input.media) ? input.media : [];
  const images = Array.isArray(input.images) ? input.images : [];
  const firstMedia = media.find((item) => item?.src || item?.thumbnail) || {};

  return cleanCartText(
    input.image ||
    input.thumbnail ||
    input.primaryImage ||
    firstMedia.src ||
    firstMedia.thumbnail ||
    images[0],
    700
  );
}

function buildCartItemId(item = {}) {
  const base = cleanCartText(
    item.productId ||
    item.mongoId ||
    item.sku ||
    item.slug ||
    getSlugFromUrl(item.url) ||
    item.name,
    160
  );
  const optionSuffix = uniqueStrings([
    item.selectedOptions?.variantId,
    item.selectedOptions?.variantName,
    item.selectedOptions?.colorId,
    item.selectedOptions?.colorName,
  ])
    .map(slugify)
    .filter(Boolean)
    .join("-");

  return [slugify(base), optionSuffix].filter(Boolean).join("--").slice(0, 220);
}

function sanitizeCartItem(input = {}) {
  const product = input.product || input.item || input;
  const name = cleanCartText(product.name, 300);
  const slug = stripHtmlExtension(
    product.slug ||
    product.detailSlug ||
    getSlugFromUrl(product.url || product.productUrl) ||
    slugify(name)
  );
  const selectedOptions = sanitizeCartOptions(product);
  const item = {
    productId: cleanCartText(product.productId || product.id || product.mongoId || product._id || slug, 180),
    mongoId: cleanCartText(product.mongoId || product._id, 80),
    sku: cleanCartText(product.sku || slug, 180),
    slug,
    name: name || "Sản phẩm CellphoneS",
    image: getCartImage(product),
    url: cleanCartText(product.url || product.productUrl || (slug ? `/${slug}.html` : ""), 700),
    price: cleanCartPrice(product.price ?? product.currentPrice),
    currentPrice: cleanCartPrice(product.currentPrice ?? product.price),
    originalPrice: cleanCartPrice(product.originalPrice),
    brand: cleanCartText(product.brandName || product.brand || product.brandKey, 120),
    selectedOptions,
    quantity: cleanCartQuantity(input.quantity ?? product.quantity ?? 1),
  };

  item.id = cleanCartText(input.itemId || input.cartItemId || product.cartItemId || buildCartItemId(item), 240);
  return item;
}

function mergeCartItems(existingItems = [], incomingItems = []) {
  const byId = new Map();
  const now = new Date();

  [...existingItems, ...incomingItems].forEach((rawItem) => {
    const item = sanitizeCartItem(rawItem);
    if (!item.id || !item.name) return;

    const previous = byId.get(item.id);
    if (previous) {
      byId.set(item.id, {
        ...previous,
        ...item,
        quantity: Math.min(99, Number(previous.quantity || 1) + Number(item.quantity || 1)),
        addedAt: previous.addedAt || item.addedAt || now,
        updatedAt: now,
      });
      return;
    }

    byId.set(item.id, {
      ...item,
      addedAt: rawItem.addedAt ? new Date(rawItem.addedAt) : now,
      updatedAt: now,
    });
  });

  return [...byId.values()].slice(0, 100);
}

function replaceCartItems(items = []) {
  const now = new Date();
  return items
    .map((item) => ({
      ...sanitizeCartItem(item),
      addedAt: item.addedAt ? new Date(item.addedAt) : now,
      updatedAt: now,
    }))
    .filter((item) => item.id && item.name)
    .slice(0, 100);
}

function summarizeCart(items = []) {
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const subtotal = items.reduce(
    (sum, item) => sum + cleanCartPrice(item.currentPrice || item.price) * Number(item.quantity || 0),
    0
  );
  const originalSubtotal = items.reduce(
    (sum, item) =>
      sum +
      cleanCartPrice(item.originalPrice || item.currentPrice || item.price) * Number(item.quantity || 0),
    0
  );

  return {
    totalItems: items.length,
    totalQuantity,
    subtotal,
    originalSubtotal,
    discount: Math.max(0, originalSubtotal - subtotal),
  };
}

function normalizeCart(cart = {}, owner = {}) {
  const items = Array.isArray(cart.items) ? cart.items.map(sanitizeCartItem) : [];
  return {
    id: String(cart._id || cart.id || ""),
    userId: cart.userId || owner.userId || "",
    email: cart.email || owner.email || "",
    items,
    summary: summarizeCart(items),
    createdAt: cart.createdAt || null,
    updatedAt: cart.updatedAt || null,
  };
}

async function findOrCreateCart(carts, owner) {
  await ensureCartIndexes(carts);

  let cart = await carts.findOne({ userId: owner.userId });
  if (cart) return cart;

  const now = new Date();
  const result = await carts.insertOne({
    userId: owner.userId,
    email: owner.email,
    phone: owner.phone,
    items: [],
    createdAt: now,
    updatedAt: now,
  });

  return carts.findOne({ _id: result.insertedId });
}

async function handleCartRequest(req, res, pathParts) {
  const owner = getCartOwner(req);
  if (!owner) {
    sendError(res, 401, "Vui lòng đăng nhập để đồng bộ giỏ hàng.");
    return;
  }

  const { carts } = await getDb();
  const section = pathParts[2];
  const itemId = decodeURIComponent(pathParts[3] || "");
  const now = new Date();

  if (!section && req.method === "GET") {
    const cart = await findOrCreateCart(carts, owner);
    sendJson(res, 200, { ok: true, data: normalizeCart(cart, owner) });
    return;
  }

  if (!section && req.method === "PUT") {
    const body = await parseJsonBody(req);
    const currentCart = await findOrCreateCart(carts, owner);
    const incomingItems = Array.isArray(body.items) ? body.items : [];
    const mode = cleanCartText(body.mode || "replace", 20);
    const items = mode === "merge"
      ? mergeCartItems(currentCart.items || [], incomingItems)
      : replaceCartItems(incomingItems);

    await carts.updateOne(
      { userId: owner.userId },
      {
        $set: {
          email: owner.email,
          phone: owner.phone,
          items,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );

    const cart = await carts.findOne({ userId: owner.userId });
    sendJson(res, 200, { ok: true, data: normalizeCart(cart, owner) });
    return;
  }

  if (!section && req.method === "DELETE") {
    await findOrCreateCart(carts, owner);
    await carts.updateOne(
      { userId: owner.userId },
      { $set: { items: [], updatedAt: now } }
    );
    const cart = await carts.findOne({ userId: owner.userId });
    sendJson(res, 200, { ok: true, data: normalizeCart(cart, owner) });
    return;
  }

  if (section !== "items") {
    sendError(res, 404, "Cart route not found.");
    return;
  }

  const currentCart = await findOrCreateCart(carts, owner);

  if (req.method === "POST") {
    const body = await parseJsonBody(req);
    const incomingItem = sanitizeCartItem(body.item || body.product || body);
    const items = mergeCartItems(currentCart.items || [], [incomingItem]);

    await carts.updateOne(
      { userId: owner.userId },
      { $set: { email: owner.email, phone: owner.phone, items, updatedAt: now } }
    );

    const cart = await carts.findOne({ userId: owner.userId });
    sendJson(res, 201, { ok: true, data: normalizeCart(cart, owner), item: incomingItem });
    return;
  }

  if (!itemId) {
    sendError(res, 400, "Missing cart item id.");
    return;
  }

  if (req.method === "PATCH") {
    const body = await parseJsonBody(req);
    const quantity = Number(body.quantity);
    const items = (currentCart.items || [])
      .map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          quantity: cleanCartQuantity(quantity),
          updatedAt: now,
        };
      })
      .filter((item) => Number(item.quantity || 0) > 0);

    await carts.updateOne(
      { userId: owner.userId },
      { $set: { items, updatedAt: now } }
    );
    const cart = await carts.findOne({ userId: owner.userId });
    sendJson(res, 200, { ok: true, data: normalizeCart(cart, owner) });
    return;
  }

  if (req.method === "DELETE") {
    const items = (currentCart.items || []).filter((item) => item.id !== itemId);
    await carts.updateOne(
      { userId: owner.userId },
      { $set: { items, updatedAt: now } }
    );
    const cart = await carts.findOne({ userId: owner.userId });
    sendJson(res, 200, { ok: true, data: normalizeCart(cart, owner) });
    return;
  }

  sendError(res, 405, "Method not allowed.");
}

async function ensureOrderIndexes(orders) {
  if (orderIndexesReady) return;

  await Promise.all([
    orders.createIndex({ orderCode: 1 }, { unique: true, name: "unique_order_code" }),
    orders.createIndex({ userId: 1, createdAt: -1 }, { name: "orders_user_created_at" }),
    orders.createIndex({ status: 1, createdAt: -1 }, { name: "orders_status_created_at" }),
    orders.createIndex({ "payment.reference": 1 }, { name: "orders_payment_reference" }),
    orders.createIndex({ "payment.status": 1, createdAt: -1 }, { name: "orders_payment_status_created_at" }),
    orders.createIndex({ "paymentHistory.transactionId": 1 }, { sparse: true, name: "orders_payment_history_transaction" }),
    orders.createIndex({ "customer.phone": 1 }, { name: "orders_customer_phone" }),
    orders.createIndex({ "customer.email": 1 }, { name: "orders_customer_email" }),
  ]);

  orderIndexesReady = true;
}

function getOptionalOrderOwner(req) {
  const requester = getRequestUser(req);
  const userId = String(requester?.sub || requester?.id || "").trim();

  if (!userId) return null;

  return {
    userId,
    email: normalizeEmail(requester.email),
    phone: sanitizePhone(requester.phone),
    role: requester.role || "customer",
    username: requester.username || "",
  };
}

function getRequiredCustomer(req, res) {
  const owner = getOptionalOrderOwner(req);
  if (!owner?.userId) {
    sendError(res, 401, "Vui lòng đăng nhập để sử dụng tính năng này.");
    return null;
  }
  return owner;
}

function generateOrderCode() {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CPS${datePart}${randomPart}`;
}

const ORDER_TRACKING_LABELS = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  packing: "Đang chuẩn bị hàng",
  ready_for_pickup: "Sẵn sàng nhận tại cửa hàng",
  shipping: "Đang giao",
  completed: "Giao thành công",
  cancelled: "Đã hủy",
  refunded: "Hoàn tiền",
};

const ORDER_TRACKING_FLOW = [
  "pending",
  "confirmed",
  "packing",
  "shipping",
  "completed",
];

function normalizeTimelineEntry(entry = {}, fallbackStatus = "pending") {
  const status = entry.status || fallbackStatus;
  return {
    status,
    label: entry.label || ORDER_TRACKING_LABELS[status] || status,
    note: entry.note || "",
    changedBy: entry.changedBy || "",
    changedByRole: entry.changedByRole || "",
    time: entry.changedAt || entry.createdAt || null,
  };
}

function buildOrderTracking(order = {}) {
  const currentStatus = order.status || "pending";
  const history = Array.isArray(order.statusHistory) && order.statusHistory.length
    ? order.statusHistory.map((entry) => normalizeTimelineEntry(entry, currentStatus))
    : [
      {
        status: "pending",
        label: ORDER_TRACKING_LABELS.pending,
        note: "Đặt hàng thành công.",
        changedBy: order.userId || "guest",
        changedByRole: order.userRole || "guest",
        time: order.createdAt || null,
      },
    ];

  const completedStatuses = new Set(history.map((entry) => entry.status));
  const flow = ORDER_TRACKING_FLOW.map((status) => ({
    status,
    label: ORDER_TRACKING_LABELS[status],
    completed: completedStatuses.has(status) || ORDER_TRACKING_FLOW.indexOf(status) <= ORDER_TRACKING_FLOW.indexOf(currentStatus),
    current: status === currentStatus,
  }));

  if (["cancelled", "refunded"].includes(currentStatus)) {
    flow.push({
      status: currentStatus,
      label: ORDER_TRACKING_LABELS[currentStatus],
      completed: true,
      current: true,
    });
  }

  return {
    orderCode: order.orderCode || "",
    status: currentStatus,
    statusLabel: order.statusLabel || ORDER_TRACKING_LABELS[currentStatus] || "",
    paymentStatus: order.payment?.status || "unpaid",
    paymentLabel: order.payment?.statusLabel || "",
    trackingCode: order.shippingChoice?.trackingCode || order.shipment?.trackingCode || "",
    carrier: order.shippingChoice?.carrier || order.shipment?.carrier || "",
    etaText: order.shippingChoice?.etaText || "",
    timeline: history.sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0)),
    flow,
    updatedAt: order.updatedAt || order.createdAt || null,
  };
}

function sanitizeOrderPerson(input = {}, fallback = {}) {
  return {
    fullName: cleanLimitedText(input.fullName || input.name || fallback.fullName || fallback.name, 120),
    phone: sanitizePhone(input.phone || fallback.phone),
    email: normalizeEmail(input.email || fallback.email),
    memberTier: cleanLimitedText(input.memberTier || fallback.memberTier || "S-NEW", 40),
  };
}

function sanitizeShippingAddress(input = {}) {
  const addressLine = cleanLimitedText(input.addressLine || input.address || input.street, 260);
  const ward = cleanLimitedText(input.ward, 120);
  const district = cleanLimitedText(input.district, 120);
  const province = cleanLimitedText(input.province || input.city, 120);
  const fullAddress = cleanLimitedText(
    input.fullAddress || [addressLine, ward, district, province].filter(Boolean).join(", "),
    700
  );

  return {
    receiverName: cleanLimitedText(input.receiverName || input.fullName || input.name, 120),
    receiverPhone: sanitizePhone(input.receiverPhone || input.phone),
    province,
    district,
    ward,
    addressLine,
    fullAddress,
  };
}

function sanitizeCompanyInvoice(input = {}) {
  const requested = Boolean(input.requested);
  const invoiceEmail = requested ? normalizeEmail(input.invoiceEmail || input.email) : "";
  return {
    requested,
    companyName: requested ? cleanLimitedText(input.companyName, 180) : "",
    taxCode: requested ? cleanLimitedText(input.taxCode, 40) : "",
    companyAddress: requested ? cleanLimitedText(input.companyAddress, 320) : "",
    invoiceEmail,
    email: invoiceEmail,
    invoiceStatus: requested ? cleanLimitedText(input.invoiceStatus || "pending", 40) : "not_requested",
    note: requested ? cleanLimitedText(input.note, 1000) : "",
  };
}

function sanitizeShippingChoice(input = {}) {
  const type = ["store", "express", "standard"].includes(input.type) ? input.type : "express";
  const fallbackLabel = type === "express" ? "Giao siêu tốc" : "Giao thông thường";
  const choiceLabel = type === "store"
    ? "Nhận tại cửa hàng"
    : fallbackLabel;
  return {
    type,
    label: cleanLimitedText(input.label || choiceLabel, 80),
    etaText: cleanLimitedText(input.etaText || input.eta, 180),
    fee: cleanCartPrice(input.fee),
  };
}

function sanitizePaymentMethod(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (["bank_qr", "bank-qr", "vietqr", "qr", "bank_transfer", "bank-transfer"].includes(raw)) {
    return "bank_qr";
  }
  return "cod";
}

function getBankQrConfig() {
  const bankId = cleanLimitedText(
    process.env.BANK_QR_BANK_ID || process.env.BANK_QR_BANK_CODE,
    40
  );
  const accountNumber = cleanLimitedText(
    process.env.BANK_QR_ACCOUNT_NUMBER || process.env.BANK_ACCOUNT_NUMBER,
    80
  );
  const accountName = cleanLimitedText(
    process.env.BANK_QR_ACCOUNT_NAME || process.env.BANK_ACCOUNT_NAME || "CELLPHONES CLONE",
    120
  );
  const template = cleanLimitedText(process.env.BANK_QR_TEMPLATE || "compact2", 32);

  return {
    provider: "vietqr",
    enabled: Boolean(bankId && accountNumber),
    bankId,
    accountNumber,
    accountName,
    template,
  };
}

function buildBankQrImageUrl({ amount, transferContent }) {
  const config = getBankQrConfig();
  if (!config.enabled) return "";

  const base = `https://img.vietqr.io/image/${encodeURIComponent(config.bankId)}-${encodeURIComponent(config.accountNumber)}-${encodeURIComponent(config.template)}.png`;
  const params = new URLSearchParams({
    amount: String(Math.max(0, Math.round(Number(amount || 0)))),
    addInfo: transferContent,
    accountName: config.accountName,
  });

  return `${base}?${params.toString()}`;
}

function buildOrderPayment({ method, orderCode, totals }) {
  if (method === "bank_qr") {
    const amount = Math.max(0, Math.round(Number(totals.total || totals.roundedTotal || 0)));
    const transferContent = orderCode;
    const bankConfig = getBankQrConfig();

    return {
      method: "bank_qr",
      methodLabel: "Chuyển khoản ngân hàng qua mã QR",
      status: "pending",
      statusLabel: "Chờ chuyển khoản",
      provider: bankConfig.provider,
      reference: orderCode,
      transferContent,
      amount,
      currency: totals.currency || "VND",
      qrImageUrl: buildBankQrImageUrl({ amount, transferContent }),
      expiresAt: new Date(Date.now() + Number(process.env.BANK_QR_EXPIRES_MINUTES || 30) * 60 * 1000),
      bank: {
        bankId: bankConfig.bankId,
        accountNumber: bankConfig.accountNumber,
        accountName: bankConfig.accountName,
      },
      instructions: bankConfig.enabled
        ? "Quét mã QR và giữ nguyên nội dung chuyển khoản để hệ thống tự xác nhận khi ngân hàng gửi thông báo giao dịch."
        : "Chưa cấu hình BANK_QR_BANK_ID và BANK_QR_ACCOUNT_NUMBER trong .env.",
      createdAt: new Date(),
    };
  }

  return {
    method: "cod",
    methodLabel: "Thanh toán khi nhận hàng",
    status: "unpaid",
    statusLabel: "Chưa thanh toán",
  };
}

function buildOrderTotals(items = [], options = {}) {
  const cartSummary = summarizeCart(items);
  const shippingFee = cleanCartPrice(options.shippingFee);
  const educationOffer = Boolean(options.educationOffer);
  const couponDiscount = cleanCartPrice(options.couponDiscount);
  const educationDiscount = educationOffer
    ? Math.min(300000, cartSummary.subtotal)
    : 0;
  const totalBeforePayment = Math.max(0, cartSummary.subtotal + shippingFee - educationDiscount - couponDiscount);

  return {
    currency: "VND",
    quantity: cartSummary.totalQuantity,
    totalGoods: cartSummary.originalSubtotal,
    subtotal: cartSummary.subtotal,
    shippingFee,
    discounts: {
      direct: cartSummary.discount,
      education: educationDiscount,
      coupon: couponDiscount,
    },
    totalDiscount: cartSummary.discount + educationDiscount + couponDiscount,
    total: totalBeforePayment,
    roundedTotal: totalBeforePayment,
    vatIncluded: true,
  };
}

function computeCouponDiscount(coupon = {}, totalsBase = {}) {
  if (!coupon || coupon.status !== "active") return 0;

  const now = new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) return 0;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return 0;
  if (coupon.usageLimit && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) return 0;

  const subtotal = cleanCartPrice(totalsBase.subtotal);
  if (subtotal < cleanCartPrice(coupon.minSubtotal)) return 0;

  if (coupon.type === "free_shipping") return cleanCartPrice(totalsBase.shippingFee);
  if (coupon.type === "percent") {
    const rawDiscount = Math.floor((subtotal * Number(coupon.value || 0)) / 100);
    return coupon.maxDiscount ? Math.min(rawDiscount, cleanCartPrice(coupon.maxDiscount)) : rawDiscount;
  }

  return Math.min(subtotal, cleanCartPrice(coupon.value));
}

function normalizeCouponForPublic(coupon = {}, discount = 0) {
  if (!coupon) return null;
  return {
    id: String(coupon._id || ""),
    code: coupon.code || "",
    name: coupon.name || "",
    description: coupon.description || "",
    type: coupon.type || "fixed",
    value: coupon.value || 0,
    minSubtotal: coupon.minSubtotal || 0,
    maxDiscount: coupon.maxDiscount || 0,
    discount,
    startsAt: coupon.startsAt || null,
    expiresAt: coupon.expiresAt || null,
  };
}

function getCouponInvalidReason(coupon = null, totalsBase = {}) {
  if (!coupon) return "Mã giảm giá không tồn tại hoặc đã ngừng áp dụng.";
  if (coupon.status !== "active") return "Mã giảm giá đang không hoạt động.";

  const now = new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) return "Mã giảm giá chưa tới thời gian áp dụng.";
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return "Mã giảm giá đã hết hạn.";
  if (coupon.usageLimit && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) {
    return "Mã giảm giá đã hết lượt sử dụng.";
  }

  const subtotal = cleanCartPrice(totalsBase.subtotal);
  if (subtotal < cleanCartPrice(coupon.minSubtotal)) {
    return `Đơn hàng cần tối thiểu ${cleanCartPrice(coupon.minSubtotal).toLocaleString("vi-VN")}đ để áp dụng mã này.`;
  }

  return "";
}

async function findActiveCoupon(coupons, code = "") {
  const couponCode = cleanLimitedText(code, 80).toUpperCase();
  if (!couponCode) return null;
  await ensureCouponIndexes(coupons);
  return coupons.findOne({ code: couponCode, status: "active" });
}

async function buildCheckoutPreview({ productDetails, products, coupons, body = {} }) {
  const parsed = parseWithSchema(orderPayloadSchema, {
    ...body,
    items: Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.cart?.items)
        ? body.cart.items
        : [],
  });

  if (!parsed.ok) {
    const error = new Error(parsed.message);
    error.statusCode = 400;
    throw error;
  }

  const bodyData = parsed.data;
  const items = await resolveOrderItemsFromDb({
    productDetails,
    products,
    rawItems: bodyData.items,
  });
  const shippingChoice = sanitizeShippingChoice(bodyData.shippingChoice || bodyData.shipping || {});
  const educationOffer = Boolean(bodyData.educationOffer);
  const preCouponTotals = buildOrderTotals(items, {
    shippingFee: shippingChoice.fee,
    educationOffer,
  });

  let coupon = null;
  let couponDiscount = 0;
  let couponError = "";
  if (bodyData.couponCode || body.coupon?.code) {
    coupon = await findActiveCoupon(coupons, bodyData.couponCode || body.coupon?.code);
    couponError = getCouponInvalidReason(coupon, preCouponTotals);
    couponDiscount = couponError ? 0 : computeCouponDiscount(coupon, preCouponTotals);
    if (!couponError && couponDiscount <= 0) {
      couponError = "Đơn hàng chưa đủ điều kiện áp dụng mã giảm giá.";
    }
  }

  const totals = buildOrderTotals(items, {
    shippingFee: shippingChoice.fee,
    educationOffer,
    couponDiscount,
  });

  return {
    items,
    shippingChoice,
    educationOffer,
    coupon: coupon && !couponError ? normalizeCouponForPublic(coupon, couponDiscount) : null,
    couponError,
    totals,
  };
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const parsed = toPositiveNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function collectOptionCandidates(product = {}) {
  return [
    ...(Array.isArray(product.variants) ? product.variants : []),
    ...(Array.isArray(product.variantOptions) ? product.variantOptions : []),
    ...(Array.isArray(product.options) ? product.options : []),
    ...(Array.isArray(product.storageOptions) ? product.storageOptions : []),
    ...(Array.isArray(product.memoryOptions) ? product.memoryOptions : []),
    ...(Array.isArray(product.colors) ? product.colors : []),
  ].filter(Boolean);
}

function matchProductOption(product = {}, selectedOptions = {}) {
  const candidates = collectOptionCandidates(product);
  const wanted = uniqueStrings([
    selectedOptions.variantId,
    selectedOptions.variantName,
    selectedOptions.optionId,
    selectedOptions.optionName,
    selectedOptions.storage,
    selectedOptions.memory,
    selectedOptions.colorId,
    selectedOptions.colorName,
  ]).map((value) => slugify(value));

  if (!wanted.length || !candidates.length) return null;

  return candidates.find((candidate) => {
    const candidateValues = uniqueStrings([
      candidate.id,
      candidate._id,
      candidate.sku,
      candidate.slug,
      candidate.name,
      candidate.label,
      candidate.title,
      candidate.value,
      candidate.colorName,
      candidate.storage,
      candidate.memory,
    ]).map((value) => slugify(value));

    return wanted.some((needle) =>
      candidateValues.some((value) => value === needle || value.includes(needle) || needle.includes(value))
    );
  }) || null;
}

function buildOrderItemFromProduct(product = {}, rawItem = {}) {
  const normalized = normalizeProduct(product);
  const selectedOptions = {
    ...sanitizeCartOptions(rawItem),
    ...(rawItem.selectedOptions || {}),
    ...(rawItem.option || {}),
    ...(rawItem.options || {}),
  };
  const matchedOption = matchProductOption(product, selectedOptions);
  const price = firstPositiveNumber(
    matchedOption?.currentPrice,
    matchedOption?.price,
    matchedOption?.salePrice,
    matchedOption?.specialPrice,
    product.currentPrice,
    product.price,
    normalized.currentPrice,
    normalized.price
  );
  const originalPrice = firstPositiveNumber(
    matchedOption?.originalPrice,
    matchedOption?.listedPrice,
    matchedOption?.priceBeforeDiscount,
    product.originalPrice,
    product.listedPrice,
    normalized.originalPrice,
    price
  );
  const quantity = cleanCartQuantity(rawItem.quantity || 1);

  if (!price) {
    throw new Error(`Sản phẩm "${normalized.name || rawItem.name || rawItem.slug}" chưa có giá bán hợp lệ.`);
  }

  const item = sanitizeCartItem({
    productId: String(product._id || normalized.id || rawItem.productId || normalized.slug),
    mongoId: String(product._id || rawItem.mongoId || ""),
    sku: normalized.sku || product.sku || rawItem.sku,
    slug: normalized.slug || product.slug || rawItem.slug,
    name: normalized.name || product.name || rawItem.name,
    image: normalized.image || normalized.primaryImage || rawItem.image,
    url: normalized.url || product.url || rawItem.url,
    price,
    currentPrice: price,
    originalPrice,
    brand: normalized.brand || product.brand,
    quantity,
    selectedOptions: {
      ...selectedOptions,
      ...(matchedOption
        ? {
          variantId: selectedOptions.variantId || String(matchedOption.id || matchedOption._id || ""),
          variantName: selectedOptions.variantName || matchedOption.name || matchedOption.label || "",
        }
        : {}),
    },
  });

  item.productSnapshot = {
    productId: item.productId,
    slug: item.slug,
    sku: item.sku,
    name: item.name,
    image: item.image,
    url: item.url,
    brand: item.brand,
    price,
    originalPrice,
  };

  return item;
}

function getOrderItemIdentifier(rawItem = {}) {
  return cleanCartText(
    rawItem.productId ||
    rawItem.mongoId ||
    rawItem.id ||
    rawItem.slug ||
    rawItem.sku ||
    getSlugFromUrl(rawItem.url || rawItem.productUrl) ||
    rawItem.name,
    240
  );
}

async function resolveOrderItemsFromDb({ productDetails, products, rawItems = [] }) {
  const resolvedItems = [];

  for (const rawItem of rawItems) {
    const identifier = getOrderItemIdentifier(rawItem);
    if (!identifier) throw new Error("Thiếu mã sản phẩm trong giỏ hàng.");

    const product =
      (await findProductByIdentifier(productDetails, identifier)) ||
      (await findProductByIdentifier(products, identifier));

    if (!product) {
      throw new Error(`Không tìm thấy sản phẩm "${identifier}" trong MongoDB.`);
    }

    resolvedItems.push(buildOrderItemFromProduct(product, rawItem));
  }

  return replaceCartItems(resolvedItems);
}

function buildInventoryKey(item = {}) {
  return [
    item.productId || item.mongoId || item.slug || item.sku,
    item.selectedOptions?.variantId || item.selectedOptions?.variantName || "",
    item.selectedOptions?.colorId || item.selectedOptions?.colorName || "",
  ].map((value) => slugify(value)).filter(Boolean).join("::");
}

async function ensureInventoryIndexes(inventory) {
  if (inventoryIndexesReady) return;

  await Promise.all([
    inventory.createIndex({ key: 1 }, { unique: true, name: "unique_inventory_key" }),
    inventory.createIndex({ productId: 1 }, { name: "inventory_product_id" }),
    inventory.createIndex({ updatedAt: -1 }, { name: "inventory_updated_at" }),
  ]);

  inventoryIndexesReady = true;
}

async function reserveInventoryForOrder(inventory, items = [], orderCode = "") {
  await ensureInventoryIndexes(inventory);
  const reserved = [];

  try {
    for (const item of items) {
      const key = buildInventoryKey(item);
      const quantity = cleanCartQuantity(item.quantity);
      const now = new Date();
      let doc = await inventory.findOne({ key });

      if (!doc) {
        const initialStock = Number(item.stock || item.availableStock || 100);
        await inventory.updateOne(
          { key },
          {
            $setOnInsert: {
              key,
              productId: item.productId,
              slug: item.slug,
              sku: item.sku,
              name: item.name,
              variantId: item.selectedOptions?.variantId || "",
              colorId: item.selectedOptions?.colorId || "",
              stock: Number.isFinite(initialStock) && initialStock > 0 ? initialStock : 100,
              reservedStock: 0,
              soldCount: 0,
              createdAt: now,
            },
            $set: { updatedAt: now },
          },
          { upsert: true }
        );
        doc = await inventory.findOne({ key });
      }

      const stock = Number(doc.stock || 0);
      const reservedStock = Number(doc.reservedStock || 0);
      const availableStock = Math.max(0, stock - reservedStock);
      if (availableStock < quantity) {
        throw new Error(`Sản phẩm "${item.name}" chỉ còn ${availableStock} sản phẩm trong kho.`);
      }

      await inventory.updateOne(
        { key },
        {
          $inc: { reservedStock: quantity },
          $push: {
            reservations: {
              orderCode,
              quantity,
              createdAt: now,
              status: "reserved",
            },
          },
          $set: { updatedAt: now },
        }
      );
      reserved.push({ key, quantity });
    }
  } catch (error) {
    await Promise.all(
      reserved.map((entry) =>
        inventory.updateOne(
          { key: entry.key },
          { $inc: { reservedStock: -entry.quantity }, $set: { updatedAt: new Date() } }
        )
      )
    );
    throw error;
  }

  return reserved;
}

async function releaseInventoryReservations(inventory, reservations = []) {
  await Promise.all(
    reservations.map((entry) =>
      inventory.updateOne(
        { key: entry.key },
        { $inc: { reservedStock: -entry.quantity }, $set: { updatedAt: new Date() } }
      )
    )
  );
}

function validateOrderPayload({ customer, receiver, shippingAddress, shippingChoice, items }) {
  if (!items.length) return "Giỏ hàng đang trống, không thể tạo đơn hàng.";
  if (!customer.fullName) return "Vui lòng nhập họ tên khách hàng.";
  if (!/^0\d{9}$/.test(customer.phone)) return "Số điện thoại khách hàng cần gồm 10 chữ số và bắt đầu bằng 0.";
  if (!customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return "Vui lòng nhập email hợp lệ để nhận hóa đơn VAT.";
  }
  if (!receiver.fullName) return "Vui lòng nhập họ tên người nhận.";
  if (!/^0\d{9}$/.test(receiver.phone)) return "Số điện thoại người nhận cần gồm 10 chữ số và bắt đầu bằng 0.";
  const isStorePickup = shippingChoice?.type === "store";
  if (!shippingAddress.province || !shippingAddress.district || !shippingAddress.addressLine) {
    return "Vui lòng nhập đầy đủ tỉnh/thành, quận/huyện, phường/xã và địa chỉ nhận hàng.";
  }
  if (!isStorePickup && !shippingAddress.ward) return "Vui lòng nhập đầy đủ Phường / Xã.";
  return "";
}

function normalizeOrder(doc = {}) {
  return {
    id: String(doc._id || doc.id || ""),
    orderCode: doc.orderCode || "",
    userId: doc.userId || "",
    status: doc.status || "pending",
    statusLabel: doc.statusLabel || "",
    statusHistory: doc.statusHistory || [],
    adminNote: doc.adminNote || "",
    paymentStatus: doc.payment?.status || "unpaid",
    paymentMethod: doc.payment?.method || "cod",
    payment: doc.payment || {},
    customer: doc.customer || {},
    receiver: doc.receiver || {},
    shippingAddress: doc.shippingAddress || {},
    shippingChoice: doc.shippingChoice || {},
    items: doc.items || [],
    gifts: doc.gifts || [],
    totals: doc.totals || {},
    marketingOptIn: Boolean(doc.marketingOptIn),
    educationOffer: Boolean(doc.educationOffer),
    companyInvoice: doc.companyInvoice || {},
    note: doc.note || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function extractOrderCodeFromPaymentText(value = "") {
  const match = String(value || "").toUpperCase().match(/CPS\d{8}[A-Z0-9]{6}/);
  return match ? match[0] : "";
}

function getPaymentConfirmationReference(body = {}, fallback = "") {
  const candidates = [
    fallback,
    body.orderCode,
    body.paymentCode,
    body.reference,
    body.transferContent,
    body.content,
    body.description,
    body.memo,
    body.transactionId,
    body.bankReference,
    body.transaction?.description,
    body.transaction?.content,
    body.transaction?.memo,
    body.transaction?.referenceCode,
    body.data?.description,
    body.data?.content,
    body.data?.memo,
    body.data?.referenceCode,
    body.referenceCode,
    body.tid,
    body.code,
  ];

  for (const candidate of candidates) {
    const direct = cleanLimitedText(candidate, 120);
    if (!direct) continue;
    const extracted = extractOrderCodeFromPaymentText(direct);
    if (extracted) return extracted;
    if (/^CPS\d{8}[A-Z0-9]{6}$/i.test(direct)) return direct.toUpperCase();
  }

  return "";
}

function getPaymentConfirmationAmount(body = {}) {
  return cleanCartPrice(
    body.amount ??
    body.transferAmount ??
    body.paidAmount ??
    body.creditAmount ??
    body.inAmount ??
    body.value ??
    body.transaction?.amount ??
    body.transaction?.transferAmount ??
    body.data?.amount ??
    body.data?.transferAmount
  );
}

function isBankPaymentConfirmationAuthorized(req, body = {}) {
  if (isAdminAuthorized(req)) return true;

  const expectedSecret = process.env.BANK_QR_WEBHOOK_SECRET;
  if (!expectedSecret) return false;

  const providedSecret =
    req.headers["x-bank-webhook-secret"] ||
    req.headers["x-webhook-secret"] ||
    body.secret ||
    body.webhookSecret;

  return String(providedSecret || "") === String(expectedSecret);
}

function compactPaymentConfirmation(body = {}) {
  return {
    transactionId: cleanLimitedText(
      body.transactionId || body.bankReference || body.reference || body.referenceCode || body.tid || body.transaction?.id || body.data?.id,
      120
    ),
    bankReference: cleanLimitedText(body.bankReference || body.refNo || body.referenceCode || body.transaction?.reference || body.data?.reference, 120),
    description: cleanLimitedText(body.description || body.content || body.memo || body.transaction?.description || body.data?.description, 500),
    amount: getPaymentConfirmationAmount(body),
    receivedAt: new Date(),
  };
}

function normalizeBankWebhookTransactions(body = {}) {
  const candidates = [
    body,
    body.transaction,
    ...(Array.isArray(body.transactions) ? body.transactions : []),
    ...(Array.isArray(body.records) ? body.records : []),
    ...(Array.isArray(body.data) ? body.data : []),
  ];

  const seen = new Set();
  return candidates
    .filter((item) => item && typeof item === "object")
    .filter((item) => {
      const signature = JSON.stringify({
        id: item.id || item.transactionId || item.tid || item.referenceCode || "",
        content: item.content || item.description || item.memo || "",
        amount: item.amount || item.transferAmount || "",
      });
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .filter((item) => {
      const type = cleanLimitedText(item.transferType || item.type || item.direction, 40).toLowerCase();
      return !type || !["out", "withdraw", "debit", "chi"].includes(type);
    });
}

async function markOrderBankPaymentPaid({ orders, identifier = "", body = {}, actor = "webhook" }) {
  const paymentReference = getPaymentConfirmationReference(body, identifier);
  const query = {
    $or: [
      ...(paymentReference
        ? [
          { orderCode: paymentReference },
          { "payment.reference": paymentReference },
          { "payment.transferContent": paymentReference },
          { "payment.transferContent": `CPS ${paymentReference}` },
        ]
        : []),
      ...(identifier
        ? [
          { orderCode: identifier },
          { "payment.reference": identifier },
          ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
        ]
        : []),
    ],
  };

  if (!query.$or.length) {
    return { error: "Không tìm thấy mã đơn trong nội dung thanh toán." };
  }

  const order = await orders.findOne(query);
  if (!order) {
    return { error: "Không tìm thấy đơn hàng tương ứng với giao dịch." };
  }

  const confirmation = compactPaymentConfirmation(body);
  if (confirmation.transactionId) {
    const duplicate = await orders.findOne({
      "paymentHistory.transactionId": confirmation.transactionId,
    });
    if (duplicate) {
      return {
        order: duplicate,
        duplicate: true,
      };
    }
  }

  const expectedAmount = Number(order.totals?.total || order.totals?.roundedTotal || order.payment?.amount || 0);
  const receivedAmount = getPaymentConfirmationAmount(body);
  if (receivedAmount > 0 && expectedAmount > 0 && receivedAmount < expectedAmount) {
    return {
      error: `Số tiền thanh toán chưa đủ. Cần ${expectedAmount}, đã nhận ${receivedAmount}.`,
      statusCode: 400,
    };
  }

  const now = new Date();
  const result = await orders.findOneAndUpdate(
    { _id: order._id },
    {
      $set: {
        status: order.status === "pending" ? "confirmed" : order.status,
        statusLabel: order.status === "pending" ? "Đã xác nhận" : order.statusLabel,
        "payment.status": "paid",
        "payment.statusLabel": "Đã thanh toán",
        "payment.paidAt": now,
        "payment.confirmedBy": actor,
        "payment.receivedAmount": receivedAmount || expectedAmount,
        "payment.transactionId": confirmation.transactionId,
        "payment.bankReference": confirmation.bankReference,
        "payment.lastConfirmation": confirmation,
        updatedAt: now,
      },
      $push: {
        paymentHistory: {
          status: "paid",
          label: "Đã thanh toán",
          note: `Xác nhận thanh toán qua QR ngân hàng (${actor}).`,
          amount: receivedAmount || expectedAmount,
          transactionId: confirmation.transactionId,
          changedAt: now,
        },
        statusHistory: {
          status: order.status === "pending" ? "confirmed" : order.status,
          label: order.status === "pending" ? "Đã xác nhận" : order.statusLabel,
          note: `Tự động cập nhật sau khi nhận thanh toán QR (${actor}).`,
          changedBy: actor,
          changedByRole: actor,
          changedAt: now,
        },
      },
    },
    { returnDocument: "after" }
  );

  return { order: result };
}

async function handleBankPaymentWebhook(req, res) {
  const { orders, payments, notifications } = await getDb();
  await ensureOrderIndexes(orders);
  const body = await parseJsonBody(req);

  if (!isBankPaymentConfirmationAuthorized(req, body)) {
    sendError(res, 401, "Webhook thanh toán không hợp lệ.");
    return;
  }

  const transactions = normalizeBankWebhookTransactions(body);
  const results = [];

  for (const transaction of transactions) {
    const result = await markOrderBankPaymentPaid({ orders, body: transaction, actor: "bank-webhook" });
    const confirmation = compactPaymentConfirmation(transaction);
    if (confirmation.transactionId || result.order?.orderCode) {
      try {
        await payments.updateOne(
          {
            transactionId: confirmation.transactionId || `${result.order?.orderCode || "unmatched"}-${confirmation.receivedAt.getTime()}`,
          },
          {
            $setOnInsert: {
              transactionId: confirmation.transactionId || `${result.order?.orderCode || "unmatched"}-${confirmation.receivedAt.getTime()}`,
              orderCode: result.order?.orderCode || getPaymentConfirmationReference(transaction),
              amount: confirmation.amount,
              status: result.error ? "unmatched" : "paid",
              raw: transaction,
              createdAt: new Date(),
            },
            $set: {
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        );
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    if (!result.error && !result.duplicate && result.order?.userId) {
      await createUserNotification(notifications, {
        userId: result.order.userId,
        type: "payment_paid",
        title: "Thanh toán đã được xác nhận",
        message: `Đơn hàng ${result.order.orderCode} đã được xác nhận thanh toán tự động.`,
        orderCode: result.order.orderCode,
        metadata: { paymentStatus: "paid" },
      });
    }
    results.push({
      ok: !result.error,
      duplicate: Boolean(result.duplicate),
      error: result.error || "",
      orderCode: result.order?.orderCode || "",
      paymentStatus: result.order?.payment?.status || "",
    });
  }

  const matched = results.filter((item) => item.ok).length;
  if (!matched) {
    sendJson(res, 200, {
      ok: true,
      matched: 0,
      message: "Đã nhận webhook nhưng chưa tìm thấy đơn hàng khớp nội dung chuyển khoản.",
      results,
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    matched,
    message: "Đã tự động xác nhận thanh toán QR ngân hàng.",
    results,
  });
}

async function handleOrdersRequest(req, res, pathParts) {
  const { orders, carts, products, productDetails, inventory, coupons, userEvents, notifications } = await getDb();
  await ensureOrderIndexes(orders);

  const owner = getOptionalOrderOwner(req);
  const identifier = decodeURIComponent(pathParts[2] || "");

  if (!identifier && req.method === "POST") {
    const body = await parseJsonBody(req);
    const parsed = parseWithSchema(orderPayloadSchema, {
      ...body,
      items: Array.isArray(body.items)
        ? body.items
        : Array.isArray(body.cart?.items)
          ? body.cart.items
          : [],
    });

    if (!parsed.ok) {
      sendError(res, 400, "Dữ liệu đặt hàng không hợp lệ.", parsed.message);
      return;
    }

    if (
      !rateLimitOrSend({
        req,
        res,
        sendError,
        scope: "orders:create",
        identifier: owner?.userId || parsed.data.customer?.email || parsed.data.customer?.phone || "",
        max: Number(process.env.RATE_LIMIT_ORDER_MAX || 20),
        message: "Bạn tạo đơn hàng quá nhanh. Vui lòng thử lại sau ít phút.",
      })
    ) {
      return;
    }

    const bodyData = parsed.data;
    const rawItems = Array.isArray(bodyData.items) ? bodyData.items : [];
    let items;

    try {
      items = await resolveOrderItemsFromDb({ productDetails, products, rawItems });
    } catch (error) {
      sendError(res, 400, error.message || "Không thể xác thực sản phẩm trong đơn hàng.");
      return;
    }

    const customer = sanitizeOrderPerson(bodyData.customer, owner || {});
    const receiver = sanitizeOrderPerson(bodyData.receiver || bodyData.recipient, customer);
    const shippingAddress = sanitizeShippingAddress({
      ...(bodyData.shippingAddress || bodyData.address || {}),
      receiverName: receiver.fullName,
      receiverPhone: receiver.phone,
    });
    const educationOffer = Boolean(bodyData.educationOffer);
    const companyInvoice = sanitizeCompanyInvoice({
      ...(bodyData.companyInvoice || {}),
      requested: educationOffer ? false : Boolean(bodyData.companyInvoice?.requested),
    });
    const shippingChoice = sanitizeShippingChoice(bodyData.shippingChoice || bodyData.shipping || {});
    const validationError = validateOrderPayload({ customer, receiver, shippingAddress, shippingChoice, items });

    if (validationError) {
      sendError(res, 400, validationError);
      return;
    }

    const orderCode = generateOrderCode();
    const now = new Date();
    let appliedCoupon = null;
    let couponDiscount = 0;
    const preCouponTotals = buildOrderTotals(items, {
      shippingFee: shippingChoice.fee,
      educationOffer,
    });

    if (bodyData.couponCode) {
      appliedCoupon = await findActiveCoupon(coupons, bodyData.couponCode);
      const couponError = getCouponInvalidReason(appliedCoupon, preCouponTotals);
      if (couponError) {
        sendError(res, 400, couponError);
        return;
      }
      couponDiscount = computeCouponDiscount(appliedCoupon, preCouponTotals);
      if (couponDiscount <= 0) {
        sendError(res, 400, "Đơn hàng chưa đủ điều kiện áp dụng mã giảm giá.");
        return;
      }
    }

    const totals = buildOrderTotals(items, {
      shippingFee: shippingChoice.fee,
      educationOffer,
      couponDiscount,
    });
    const paymentMethod = sanitizePaymentMethod(bodyData.paymentMethod || bodyData.payment?.method);
    let reservations = [];

    try {
      reservations = await reserveInventoryForOrder(inventory, items, orderCode);
    } catch (error) {
      sendError(res, 409, error.message || "Không đủ tồn kho để tạo đơn hàng.");
      return;
    }

    const doc = {
      orderCode,
      userId: owner?.userId || "",
      userRole: owner?.role || "guest",
      status: "pending",
      statusLabel: ORDER_TRACKING_LABELS.pending,
      statusHistory: [
        {
          status: "pending",
          label: ORDER_TRACKING_LABELS.pending,
          note: "Đặt hàng thành công trên website CellphoneS Clone.",
          changedBy: owner?.userId || "guest",
          changedByRole: owner?.role || "guest",
          changedAt: now,
        },
      ],
      source: "cellphones-clone",
      customer,
      receiver,
      shippingAddress,
      shippingChoice,
      items,
      gifts: Array.isArray(bodyData.gifts)
        ? bodyData.gifts.map((gift) => cleanLimitedText(gift, 180)).filter(Boolean).slice(0, 10)
        : ["Tặng Túi phụ kiện phiên bản CellphoneS"],
      totals,
      coupon: appliedCoupon
        ? {
          couponId: String(appliedCoupon._id),
          code: appliedCoupon.code,
          type: appliedCoupon.type,
          value: appliedCoupon.value,
          discount: couponDiscount,
        }
        : null,
      payment: buildOrderPayment({ method: paymentMethod, orderCode, totals }),
      marketingOptIn: Boolean(bodyData.marketingOptIn),
      educationOffer,
      companyInvoice,
      note: cleanLimitedText(bodyData.note, 1000),
      termsAccepted: Boolean(bodyData.termsAccepted),
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
      userAgent: req.headers["user-agent"] || "",
      createdAt: now,
      updatedAt: now,
    };

    let inserted;
    try {
      const result = await orders.insertOne(doc);
      inserted = await orders.findOne({ _id: result.insertedId });

      if (appliedCoupon && couponDiscount > 0) {
        await coupons.updateOne(
          { _id: appliedCoupon._id },
          { $inc: { usedCount: 1 }, $set: { updatedAt: now } }
        );
      }

      await userEvents.insertOne({
        type: "order_created",
        userId: owner?.userId || "",
        orderCode,
        productIds: items.map((item) => item.productId).filter(Boolean),
        slugs: items.map((item) => item.slug).filter(Boolean),
        total: totals.total,
        createdAt: now,
      });

      if (owner?.userId) {
        await createUserNotification(notifications, {
          userId: owner.userId,
          type: "order_created",
          title: "Đặt hàng thành công",
          message: `Đơn hàng ${orderCode} đã được tạo và đang chờ xác nhận.`,
          orderCode,
          metadata: { total: totals.total, paymentMethod },
        });
      }

      if (owner?.userId && bodyData.clearCart !== false) {
        await carts.updateOne(
          { userId: owner.userId },
          { $set: { items: [], updatedAt: now } }
        );
      }
    } catch (error) {
      await releaseInventoryReservations(inventory, reservations);
      throw error;
    }

    const normalized = normalizeOrder(inserted);
    sendJson(res, 201, {
      ok: true,
      message: "Đặt hàng thành công. Đơn hàng đã được lưu vào MongoDB.",
      data: {
        ...normalized,
        order: normalized,
        totals: normalized.totals,
        payment: normalized.payment,
      },
    });
    return;
  }

  if (!identifier && req.method === "GET") {
    if (!owner?.userId) {
      sendError(res, 401, "Vui lòng đăng nhập để xem danh sách đơn hàng.");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = toPositiveInt(url.searchParams.get("limit"), 20, MAX_LIMIT);
    const query = owner.role === "admin" ? {} : { userId: owner.userId };
    const docs = await orders.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
    sendJson(res, 200, { ok: true, data: docs.map(normalizeOrder) });
    return;
  }

  if (identifier && pathParts[3] === "tracking" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const phone = sanitizePhone(url.searchParams.get("phone"));
    const doc = await orders.findOne({
      $or: [
        { orderCode: identifier },
        ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
      ],
    });

    if (!doc) {
      sendError(res, 404, "Order not found.");
      return;
    }

    const canViewByOwner = doc.userId && (owner?.role === "admin" || owner?.userId === doc.userId);
    const canViewByPhone = !doc.userId && phone && [doc.customer?.phone, doc.receiver?.phone].filter(Boolean).includes(phone);
    if (!canViewByOwner && !canViewByPhone) {
      sendError(res, 403, "Bạn không có quyền xem trạng thái đơn hàng này.");
      return;
    }

    sendJson(res, 200, {
      ok: true,
      data: buildOrderTracking(doc),
    });
    return;
  }

  if (identifier && pathParts[3] === "invoice" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const phone = sanitizePhone(url.searchParams.get("phone"));
    const doc = await orders.findOne({
      $or: [
        { orderCode: identifier },
        ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
      ],
    });

    if (!doc) {
      sendError(res, 404, "Order not found.");
      return;
    }

    const access = getOrderAccess(owner, doc, phone);
    if (!access.ok) {
      sendError(res, 403, "Bạn không có quyền xem hóa đơn đơn hàng này.");
      return;
    }

    sendJson(res, 200, {
      ok: true,
      data: normalizeOrderInvoice(doc),
    });
    return;
  }

  if (identifier && pathParts[3] === "payment" && pathParts[4] === "qr" && ["GET", "POST"].includes(req.method)) {
    const doc = await orders.findOne({
      $or: [
        { orderCode: identifier },
        ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
      ],
    });

    if (!doc) {
      sendError(res, 404, "Order not found.");
      return;
    }

    if (doc.userId && owner?.role !== "admin" && owner?.userId !== doc.userId) {
      sendError(res, 403, "Bạn không có quyền xem thanh toán đơn hàng này.");
      return;
    }

    const payment = doc.payment?.method === "bank_qr"
      ? doc.payment
      : buildOrderPayment({ method: "bank_qr", orderCode: doc.orderCode, totals: doc.totals || {} });

    if (doc.payment?.method !== "bank_qr") {
      await orders.updateOne(
        { _id: doc._id },
        { $set: { payment, updatedAt: new Date() } }
      );
    }

    sendJson(res, 200, {
      ok: true,
      data: {
        orderCode: doc.orderCode,
        payment,
      },
    });
    return;
  }

  if (identifier && pathParts[3] === "payment" && pathParts[4] === "confirm" && req.method === "POST") {
    const body = await parseJsonBody(req);
    if (!isBankPaymentConfirmationAuthorized(req, body)) {
      sendError(res, 401, "Bạn không có quyền xác nhận thanh toán đơn hàng này.");
      return;
    }

    const actor = isAdminAuthorized(req) ? "admin" : "bank-webhook";
    const result = await markOrderBankPaymentPaid({ orders, identifier, body, actor });
    if (result.error) {
      sendError(res, result.statusCode || 404, result.error);
      return;
    }

    sendJson(res, 200, {
      ok: true,
      message: "Đã xác nhận thanh toán QR ngân hàng.",
      data: normalizeOrder(result.order),
    });
    return;
  }

  if (identifier && req.method === "GET") {
    const doc = await orders.findOne({
      $or: [
        { orderCode: identifier },
        ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
      ],
    });

    if (!doc) {
      sendError(res, 404, "Order not found.");
      return;
    }

    if (doc.userId && owner?.role !== "admin" && owner?.userId !== doc.userId) {
      sendError(res, 403, "Bạn không có quyền xem đơn hàng này.");
      return;
    }

    sendJson(res, 200, { ok: true, data: normalizeOrder(doc) });
    return;
  }

  sendError(res, 405, "Method not allowed.");
}

function normalizeAddressPayload(input = {}, owner = {}) {
  const fullName = cleanLimitedText(input.fullName || input.name || owner.username || owner.email, 120);
  const phone = sanitizePhone(input.phone);
  const province = cleanLimitedText(input.province || input.city, 120);
  const district = cleanLimitedText(input.district, 120);
  const ward = cleanLimitedText(input.ward, 120);
  const addressLine = cleanLimitedText(input.addressLine || input.address || input.street, 260);
  const fullAddress = cleanLimitedText(
    input.fullAddress || [addressLine, ward, district, province].filter(Boolean).join(", "),
    700
  );

  return {
    fullName,
    phone,
    province,
    district,
    ward,
    addressLine,
    fullAddress,
    isDefault: Boolean(input.isDefault),
  };
}

function normalizeAddress(doc = {}) {
  return {
    id: String(doc._id || ""),
    userId: doc.userId || "",
    fullName: doc.fullName || "",
    phone: doc.phone || "",
    province: doc.province || "",
    district: doc.district || "",
    ward: doc.ward || "",
    addressLine: doc.addressLine || "",
    fullAddress: doc.fullAddress || "",
    isDefault: Boolean(doc.isDefault),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function normalizeWishlistItem(doc = {}) {
  return {
    id: String(doc._id || ""),
    userId: doc.userId || "",
    productId: doc.productId || "",
    productSlug: doc.productSlug || "",
    productSku: doc.productSku || "",
    productName: doc.productName || "",
    productUrl: doc.productUrl || "",
    productImage: doc.productImage || "",
    price: doc.price ?? null,
    snapshot: doc.snapshot || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function normalizeNotification(doc = {}) {
  return {
    id: String(doc._id || ""),
    userId: doc.userId || "",
    type: doc.type || "system",
    title: doc.title || "",
    message: doc.message || "",
    orderCode: doc.orderCode || "",
    productId: doc.productId || "",
    metadata: doc.metadata || {},
    readAt: doc.readAt || null,
    createdAt: doc.createdAt,
  };
}

function buildCustomerOrderQuery(owner = {}) {
  const clauses = [
    owner.userId ? { userId: owner.userId } : null,
    owner.email ? { "customer.email": owner.email } : null,
    owner.phone ? { "customer.phone": owner.phone } : null,
    owner.phone ? { "receiver.phone": owner.phone } : null,
  ].filter(Boolean);

  return clauses.length ? { $or: clauses } : { userId: "__missing_user__" };
}

function buildWarrantyItemFromOrder(order = {}, item = {}, index = 0) {
  const warrantyMonths = Number(item.warrantyMonths || item.warranty?.months || 12);
  const startsAt = order.createdAt || new Date();
  const warrantyUntil = addMonths(startsAt, warrantyMonths);

  return {
    id: `${order.orderCode || order._id}-${item.productId || item.slug || index}`,
    orderCode: order.orderCode || "",
    productId: item.productId || "",
    productSlug: item.slug || item.productSlug || "",
    productName: item.name || item.productName || "Sản phẩm CellphoneS",
    productImage: item.image || item.thumbnail || item.primaryImage || "",
    warrantyMonths,
    warrantyUntil,
    returnStatus: order.status === "cancelled" ? "cancelled" : "eligible",
    orderStatus: order.status || "pending",
    createdAt: order.createdAt,
  };
}

function normalizeOrderInvoice(order = {}) {
  const invoice = order.companyInvoice || {};
  return {
    orderCode: order.orderCode || "",
    orderId: String(order._id || order.id || ""),
    invoiceRequested: Boolean(invoice.requested),
    invoiceStatus: invoice.invoiceStatus || invoice.status || (invoice.requested ? "pending" : "not_requested"),
    companyName: invoice.companyName || "",
    taxCode: invoice.taxCode || "",
    companyAddress: invoice.companyAddress || "",
    invoiceEmail: invoice.invoiceEmail || invoice.email || order.customer?.email || "",
    customerName: order.customer?.fullName || "",
    customerPhone: order.customer?.phone || "",
    total: order.totals?.total || order.totals?.roundedTotal || 0,
    paymentStatus: order.payment?.status || "unpaid",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

async function handleMeExtrasRequest(req, res, pathParts) {
  const owner = getRequiredCustomer(req, res);
  if (!owner) return;

  const resource = pathParts[2];
  const { orders } = await getDb();
  const query = buildCustomerOrderQuery(owner);

  if (resource === "warranties" && req.method === "GET") {
    const docs = await orders
      .find({ ...query, status: { $nin: ["cancelled"] } })
      .project({ orderCode: 1, status: 1, items: 1, createdAt: 1 })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .toArray();
    const warranties = docs.flatMap((order) =>
      (order.items || []).map((item, index) => buildWarrantyItemFromOrder(order, item, index))
    );
    sendJson(res, 200, { ok: true, data: warranties });
    return;
  }

  if (resource === "invoices" && req.method === "GET") {
    const docs = await orders
      .find(query)
      .project({ orderCode: 1, companyInvoice: 1, customer: 1, totals: 1, payment: 1, createdAt: 1, updatedAt: 1 })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .toArray();
    sendJson(res, 200, { ok: true, data: docs.map(normalizeOrderInvoice) });
    return;
  }

  if (resource === "vouchers" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      message: "Mã giảm giá không tự gán vào tài khoản. Khách cần nhập mã ở bước thanh toán.",
      data: [],
    });
    return;
  }

  sendError(res, 404, "Me route not found.");
}

async function createUserNotification(notifications, input = {}) {
  if (!notifications || !input.userId) return;

  try {
    await notifications.insertOne({
      userId: String(input.userId),
      type: cleanLimitedText(input.type || "system", 80),
      title: cleanLimitedText(input.title || "CellphoneS", 180),
      message: cleanLimitedText(input.message || "", 1000),
      orderCode: cleanLimitedText(input.orderCode || "", 80),
      productId: cleanLimitedText(input.productId || "", 120),
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      readAt: null,
      createdAt: new Date(),
    });
  } catch (error) {
    console.warn(`[notifications] skip insert: ${error.message}`);
  }
}

function addMonths(dateValue, months = 12) {
  const date = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  const result = new Date(date);
  result.setMonth(result.getMonth() + Number(months || 12));
  return result;
}

function getOrderAccess(owner, order = {}, phone = "") {
  if (owner?.role === "admin") return { ok: true, mode: "admin" };
  if (order.userId && owner?.userId === order.userId) return { ok: true, mode: "owner" };
  const normalizedPhone = sanitizePhone(phone || owner?.phone || "");
  if (normalizedPhone && [order.customer?.phone, order.receiver?.phone].filter(Boolean).includes(normalizedPhone)) {
    return { ok: true, mode: "phone" };
  }
  return { ok: false, mode: "denied" };
}

async function findOrderForService(orders, identifier = "") {
  const clean = cleanLimitedText(identifier, 120);
  if (!clean) return null;
  return orders.findOne({
    $or: [
      { orderCode: clean },
      ...(ObjectId.isValid(clean) ? [{ _id: new ObjectId(clean) }] : []),
    ],
  });
}

function getOrderItemWarranty(item = {}, order = {}, warrantyDoc = null) {
  const warrantyMonths = Number(
    warrantyDoc?.warrantyMonths ||
    item.warrantyMonths ||
    item.productSnapshot?.warrantyMonths ||
    12
  );
  const warrantyUntil = warrantyDoc?.warrantyUntil || addMonths(order.createdAt, warrantyMonths);

  return {
    orderCode: order.orderCode || "",
    productId: item.productId || item.mongoId || "",
    productSlug: item.slug || "",
    productName: item.name || item.productSnapshot?.name || "",
    warrantyMonths,
    warrantyUntil,
    status: new Date(warrantyUntil) >= new Date() ? "active" : "expired",
    orderStatus: order.status || "",
    purchasedAt: order.createdAt || null,
  };
}

function normalizeReturnRequest(doc = {}) {
  return {
    id: String(doc._id || ""),
    returnCode: doc.returnCode || "",
    orderCode: doc.orderCode || "",
    userId: doc.userId || "",
    productId: doc.productId || "",
    productSlug: doc.productSlug || "",
    productName: doc.productName || "",
    reason: doc.reason || "",
    status: doc.status || "pending",
    statusLabel: doc.statusLabel || "Chờ tiếp nhận",
    returnStatus: doc.status || "pending",
    customerPhone: doc.customerPhone || "",
    images: doc.images || [],
    note: doc.note || "",
    adminNote: doc.adminNote || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function generateReturnCode() {
  const now = new Date();
  return `RT${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function handleReturnsRequest(req, res, pathParts) {
  const { orders, returns } = await getDb();
  const owner = getOptionalOrderOwner(req);
  const identifier = decodeURIComponent(pathParts[2] || "");

  if (!identifier && req.method === "POST") {
    const parsed = parseWithSchema(returnRequestSchema, await parseJsonBody(req));
    if (!parsed.ok) {
      sendError(res, 400, "Dữ liệu đổi trả không hợp lệ.", parsed.message);
      return;
    }

    const input = parsed.data;
    const order = await findOrderForService(orders, input.orderCode);
    if (!order) {
      sendError(res, 404, "Không tìm thấy đơn hàng để tạo yêu cầu đổi trả.");
      return;
    }

    const access = getOrderAccess(owner, order, input.customerPhone);
    if (!access.ok) {
      sendError(res, 403, "Bạn không có quyền tạo yêu cầu đổi trả cho đơn hàng này.");
      return;
    }

    if (["cancelled", "refunded"].includes(order.status)) {
      sendError(res, 400, "Đơn hàng đã hủy hoặc hoàn tiền, không thể tạo yêu cầu đổi trả mới.");
      return;
    }

    const orderItems = Array.isArray(order.items) ? order.items : [];
    if (!orderItems.length) {
      sendError(res, 400, "Đơn hàng không có sản phẩm để đổi trả.");
      return;
    }

    const lookupKey = String(input.productId || input.productSlug || input.productName || "").trim();

    let selectedItem = null;

    if (lookupKey) {
      selectedItem = orderItems.find((item) =>
        [item.productId, item.mongoId, item.slug, item.sku, item.name]
          .filter(Boolean)
          .some((value) => String(value).includes(lookupKey))
      );
    } else if (orderItems.length === 1) {
      selectedItem = orderItems[0];
    }

    if (!selectedItem) {
      sendError(res, 400, "Không tìm thấy sản phẩm trong đơn hàng để tạo yêu cầu đổi trả.");
      return;
    }

    const now = new Date();
    const doc = {
      returnCode: generateReturnCode(),
      orderCode: order.orderCode,
      orderId: String(order._id || ""),
      userId: order.userId || owner?.userId || "",
      productId: selectedItem.productId || selectedItem.mongoId || "",
      productSlug: selectedItem.slug || selectedItem.productSlug || "",
      productSku: selectedItem.sku || "",
      productName: selectedItem.name || selectedItem.productName || "Sản phẩm CellphoneS",
      productImage: selectedItem.image || selectedItem.thumbnail || selectedItem.primaryImage || "",
      reason: cleanLimitedText(input.reason, 1000),
      status: "pending",
      statusLabel: "Chờ tiếp nhận",
      customerPhone: sanitizePhone(input.customerPhone || order.customer?.phone || order.receiver?.phone),
      images: Array.isArray(input.images) ? input.images.slice(0, 6).map((item) => cleanLimitedText(item, 1000)).filter(Boolean) : [],
      note: cleanLimitedText(input.note, 1000),
      adminNote: "",
      createdAt: now,
      updatedAt: now,
    };

    const result = await returns.insertOne(doc);
    const inserted = await returns.findOne({ _id: result.insertedId });

    sendJson(res, 201, {
      ok: true,
      message: "Đã tạo yêu cầu đổi trả.",
      data: normalizeReturnRequest(inserted),
    });
    return;
  }

  if (identifier && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const phone = sanitizePhone(url.searchParams.get("phone"));
    const doc = await returns.findOne({
      $or: [
        { returnCode: identifier },
        ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
      ],
    });

    if (!doc) {
      sendError(res, 404, "Không tìm thấy yêu cầu đổi trả.");
      return;
    }

    if (owner?.role !== "admin" && doc.userId && owner?.userId !== doc.userId) {
      sendError(res, 403, "Bạn không có quyền xem yêu cầu đổi trả này.");
      return;
    }

    if (!doc.userId && phone && doc.customerPhone && phone !== doc.customerPhone) {
      sendError(res, 403, "Số điện thoại không khớp yêu cầu đổi trả.");
      return;
    }

    sendJson(res, 200, {
      ok: true,
      data: normalizeReturnRequest(doc),
    });
    return;
  }

  sendError(res, 404, "Returns route not found.");
}

async function handleWarrantyCheck(req, res) {
  const { orders, warranties } = await getDb();
  const owner = getOptionalOrderOwner(req);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const body = req.method === "POST" ? await parseJsonBody(req) : {};
  const orderCode = cleanLimitedText(body.orderCode || url.searchParams.get("orderCode"), 80);
  const phone = sanitizePhone(body.phone || body.customerPhone || url.searchParams.get("phone"));
  const productKey = cleanLimitedText(body.productId || body.productSlug || url.searchParams.get("productId") || url.searchParams.get("slug"), 240);

  const order = await findOrderForService(orders, orderCode);
  if (!order) {
    sendError(res, 404, "Không tìm thấy đơn hàng để tra cứu bảo hành.");
    return;
  }

  const access = getOrderAccess(owner, order, phone);
  if (!access.ok) {
    sendError(res, 403, "Bạn không có quyền tra cứu bảo hành của đơn hàng này.");
    return;
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const filteredItems = productKey
    ? items.filter((item) => [item.productId, item.mongoId, item.slug, item.sku, item.name].some((value) => String(value || "").includes(productKey)))
    : items;
  const warrantyDocs = await warranties.find({ orderCode: order.orderCode }).toArray().catch(() => []);
  const warrantyByProduct = new Map(warrantyDocs.map((doc) => [doc.productId || doc.productSlug || doc.productName, doc]));
  const data = filteredItems.map((item) => {
    const doc = warrantyByProduct.get(item.productId) || warrantyByProduct.get(item.slug) || warrantyByProduct.get(item.name);
    return getOrderItemWarranty(item, order, doc);
  });

  sendJson(res, 200, {
    ok: true,
    data: {
      orderCode: order.orderCode,
      customer: {
        fullName: order.customer?.fullName || "",
        phone: order.customer?.phone || "",
      },
      warranties: data,
    },
  });
}


function buildMemberRank(totalSpent = 0) {
  if (totalSpent >= 20000000) return "S-VIP";
  if (totalSpent >= 3000000) return "S-MEM";
  return "S-NEW";
}

function isCompletedOrderEligibleForStats(order = {}) {
  const paymentStatus = String(order.payment?.status || order.paymentStatus || "").trim().toLowerCase();
  const paymentMethod = String(order.payment?.method || order.paymentMethod || "").trim().toLowerCase();

  if (["failed", "refunded", "cancelled"].includes(paymentStatus)) return false;

  if (["bank_qr", "bank-qr", "vietqr", "qr", "bank_transfer", "bank-transfer"].includes(paymentMethod)) {
    return ["paid", "completed", "success", "succeeded"].includes(paymentStatus);
  }

  return true;
}

async function handleSmemberProfile(req, res) {
  const owner = getRequiredCustomer(req, res);
  if (!owner) return;

  const { orders } = await getDb();

  const docs = await orders
    .find({
      userId: owner.userId,
      status: "completed",
    })
    .project({
      orderCode: 1,
      totals: 1,
      status: 1,
      payment: 1,
      paymentStatus: 1,
      paymentMethod: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .toArray();

  const eligibleDocs = docs.filter(isCompletedOrderEligibleForStats);

  const totalSpent = eligibleDocs.reduce(
    (sum, order) => sum + cleanCartPrice(order.totals?.total || order.totals?.roundedTotal),
    0
  );

  const totalOrders = eligibleDocs.length;
  const points = Math.floor(totalSpent / 100000);
  const memberRank = buildMemberRank(totalSpent);
  const nextRankSpent =
    memberRank === "S-NEW"
      ? 3000000
      : memberRank === "S-MEM"
        ? 20000000
        : null;

  sendJson(res, 200, {
    ok: true,
    data: {
      userId: owner.userId,
      email: owner.email,
      phone: owner.phone,
      totalSpent,
      totalOrders,
      points,
      memberRank,
      nextRankSpent,
      remainingToNextRank: nextRankSpent ? Math.max(0, nextRankSpent - totalSpent) : 0,
      recentOrders: eligibleDocs.slice(0, 5).map((order) => ({
        orderCode: order.orderCode,
        status: order.status,
        total: order.totals?.total || order.totals?.roundedTotal || 0,
        createdAt: order.createdAt,
      })),
    },
  });
}

async function handleAddressesRequest(req, res, pathParts) {
  const owner = getRequiredCustomer(req, res);
  if (!owner) return;

  const { addresses } = await getDb();
  const addressId = decodeURIComponent(pathParts[2] || "");
  const action = pathParts[3];

  if (!addressId && req.method === "GET") {
    const docs = await addresses
      .find({ userId: owner.userId })
      .sort({ isDefault: -1, updatedAt: -1, createdAt: -1 })
      .toArray();
    sendJson(res, 200, { ok: true, data: docs.map(normalizeAddress) });
    return;
  }

  if (!addressId && req.method === "POST") {
    const parsed = parseWithSchema(addressSchema, await parseJsonBody(req));
    if (!parsed.ok) {
      sendError(res, 400, "Địa chỉ nhận hàng không hợp lệ.", parsed.message);
      return;
    }

    const now = new Date();
    const doc = {
      userId: owner.userId,
      ...normalizeAddressPayload(parsed.data, owner),
      createdAt: now,
      updatedAt: now,
    };

    if (doc.isDefault) {
      await addresses.updateMany({ userId: owner.userId }, { $set: { isDefault: false, updatedAt: now } });
    }

    const result = await addresses.insertOne(doc);
    const inserted = await addresses.findOne({ _id: result.insertedId });
    sendJson(res, 201, { ok: true, data: normalizeAddress(inserted) });
    return;
  }

  if (!ObjectId.isValid(addressId)) {
    sendError(res, 400, "Address id không hợp lệ.");
    return;
  }

  const query = { _id: new ObjectId(addressId), userId: owner.userId };

  if (action === "default" && ["POST", "PATCH"].includes(req.method)) {
    const now = new Date();
    const existing = await addresses.findOne(query);
    if (!existing) {
      sendError(res, 404, "Không tìm thấy địa chỉ.");
      return;
    }

    await addresses.updateMany({ userId: owner.userId }, { $set: { isDefault: false, updatedAt: now } });
    const result = await addresses.findOneAndUpdate(
      query,
      { $set: { isDefault: true, updatedAt: now } },
      { returnDocument: "after" }
    );
    sendJson(res, 200, { ok: true, data: normalizeAddress(result?.value || result) });
    return;
  }

  if (["PATCH", "PUT"].includes(req.method)) {
    const parsed = parseWithSchema(addressUpdateSchema, await parseJsonBody(req));
    if (!parsed.ok) {
      sendError(res, 400, "Địa chỉ nhận hàng không hợp lệ.", parsed.message);
      return;
    }

    const now = new Date();
    const update = normalizeAddressPayload(parsed.data);
    if (!Object.prototype.hasOwnProperty.call(parsed.data, "isDefault")) delete update.isDefault;
    for (const [key, value] of Object.entries(update)) {
      if (value === "" || value === undefined) delete update[key];
    }
    update.updatedAt = now;

    if (update.isDefault) {
      await addresses.updateMany({ userId: owner.userId }, { $set: { isDefault: false, updatedAt: now } });
    }

    const result = await addresses.findOneAndUpdate(query, { $set: update }, { returnDocument: "after" });
    const updated = result?.value || result;
    if (!updated) {
      sendError(res, 404, "Không tìm thấy địa chỉ.");
      return;
    }
    sendJson(res, 200, { ok: true, data: normalizeAddress(updated) });
    return;
  }

  if (req.method === "DELETE") {
    const result = await addresses.findOneAndDelete(query);
    const deleted = result?.value || result;
    if (!deleted) {
      sendError(res, 404, "Không tìm thấy địa chỉ.");
      return;
    }
    sendJson(res, 200, { ok: true, deleted: normalizeAddress(deleted) });
    return;
  }

  sendError(res, 405, "Method not allowed.");
}

async function resolveWishlistProduct({ productDetails, products, item }) {
  const identifiers = uniqueStrings([
    item.productId,
    item.slug,
    item.sku,
    item.url,
  ]);

  for (const identifier of identifiers) {
    const fromDetails = await findProductByIdentifier(productDetails, identifier);
    if (fromDetails) return fromDetails;
    const fromProducts = await findProductByIdentifier(products, identifier);
    if (fromProducts) return fromProducts;
  }

  return null;
}

async function handleWishlistRequest(req, res, pathParts) {
  const owner = getRequiredCustomer(req, res);
  if (!owner) return;

  const { wishlists, productDetails, products } = await getDb();
  const identifier = decodeURIComponent(pathParts[2] || "");

  if (!identifier && req.method === "GET") {
    const docs = await wishlists
      .find({ userId: owner.userId })
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    sendJson(res, 200, { ok: true, data: docs.map(normalizeWishlistItem) });
    return;
  }

  if (!identifier && req.method === "POST") {
    const parsed = parseWithSchema(wishlistItemSchema, await parseJsonBody(req));
    if (!parsed.ok) {
      sendError(res, 400, "Sản phẩm yêu thích không hợp lệ.", parsed.message);
      return;
    }

    const product = await resolveWishlistProduct({ productDetails, products, item: parsed.data });
    if (!product) {
      sendError(res, 404, "Không tìm thấy sản phẩm để thêm vào yêu thích.");
      return;
    }

    const normalizedProduct = normalizeProduct(product);
    const productId = String(product._id || normalizedProduct.id || parsed.data.productId || normalizedProduct.slug);
    const now = new Date();
    const doc = {
      userId: owner.userId,
      productId,
      productSlug: normalizedProduct.slug || parsed.data.slug || "",
      productSku: normalizedProduct.sku || parsed.data.sku || "",
      productName: normalizedProduct.name || "",
      productUrl: normalizedProduct.url || parsed.data.url || "",
      productImage: normalizedProduct.image || normalizedProduct.primaryImage || "",
      price: normalizedProduct.price ?? null,
      snapshot: normalizedProduct,
      createdAt: now,
      updatedAt: now,
    };

    const { createdAt, ...wishlistUpdate } = doc;
    await wishlists.updateOne(
      { userId: owner.userId, productId },
      {
        $setOnInsert: { createdAt },
        $set: wishlistUpdate,
      },
      { upsert: true }
    );
    const saved = await wishlists.findOne({ userId: owner.userId, productId });
    sendJson(res, 200, { ok: true, data: normalizeWishlistItem(saved) });
    return;
  }

  if (identifier && req.method === "DELETE") {
    const query = {
      userId: owner.userId,
      $or: [
        { productId: identifier },
        { productSlug: stripHtmlExtension(identifier) },
        { productSku: identifier },
        ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
      ],
    };
    const result = await wishlists.findOneAndDelete(query);
    const deleted = result?.value || result;
    if (!deleted) {
      sendError(res, 404, "Sản phẩm chưa có trong danh sách yêu thích.");
      return;
    }
    sendJson(res, 200, { ok: true, deleted: normalizeWishlistItem(deleted) });
    return;
  }

  sendError(res, 405, "Method not allowed.");
}

async function handleNotificationsRequest(req, res, pathParts) {
  const owner = getRequiredCustomer(req, res);
  if (!owner) return;

  const { notifications } = await getDb();
  const identifier = decodeURIComponent(pathParts[2] || "");
  const action = pathParts[3];

  if (!identifier && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = toPositiveInt(url.searchParams.get("limit"), 30, MAX_LIMIT);
    const query = { userId: owner.userId };
    if (url.searchParams.get("unread") === "true") query.readAt = null;
    const docs = await notifications.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
    sendJson(res, 200, { ok: true, data: docs.map(normalizeNotification) });
    return;
  }

  if (identifier === "read-all" && ["POST", "PATCH"].includes(req.method)) {
    await notifications.updateMany(
      { userId: owner.userId, readAt: null },
      { $set: { readAt: new Date() } }
    );
    sendJson(res, 200, { ok: true, updated: true });
    return;
  }

  if (!ObjectId.isValid(identifier)) {
    sendError(res, 400, "Notification id không hợp lệ.");
    return;
  }

  const query = { _id: new ObjectId(identifier), userId: owner.userId };

  if (action === "read" && ["POST", "PATCH"].includes(req.method)) {
    const result = await notifications.findOneAndUpdate(
      query,
      { $set: { readAt: new Date() } },
      { returnDocument: "after" }
    );
    const updated = result?.value || result;
    if (!updated) {
      sendError(res, 404, "Không tìm thấy thông báo.");
      return;
    }
    sendJson(res, 200, { ok: true, data: normalizeNotification(updated) });
    return;
  }

  if (req.method === "DELETE") {
    const result = await notifications.findOneAndDelete(query);
    const deleted = result?.value || result;
    if (!deleted) {
      sendError(res, 404, "Không tìm thấy thông báo.");
      return;
    }
    sendJson(res, 200, { ok: true, deleted: normalizeNotification(deleted) });
    return;
  }

  sendError(res, 405, "Method not allowed.");
}

function buildInteractionProductIdentity(product, identifier = "") {
  const slug = product?.slug || stripHtmlExtension(identifier) || product?.sku || "";

  return {
    productId: product?._id ? String(product._id) : "",
    productSlug: slug,
    productSku: product?.sku || "",
    productName: product?.name || "Sản phẩm CellphoneS",
    productUrl: product?.url || resolveProductDetailUrl(identifier, product),
    productImage: product?.primaryImage || product?.thumbnail || product?.image || product?.images?.[0] || "",
  };
}

function buildInteractionProductQuery(product, identifier = "") {
  const directSlug = stripHtmlExtension(identifier);
  const slugs = uniqueStrings([
    directSlug,
    product?.slug,
    product?.sku,
    product?.detailSlug,
    getSlugFromUrl(product?.url),
    ...(product?.sourceUrls || []).map(getSlugFromUrl),
  ]);
  const or = [];

  if (product?._id) or.push({ productId: String(product._id) });
  if (slugs.length) or.push({ productSlug: { $in: slugs } });
  if (product?.sku) or.push({ productSku: product.sku });

  return or.length ? { $or: or } : { productSlug: directSlug || "__unknown__" };
}

function normalizeReview(doc = {}, { admin = false } = {}) {
  return {
    id: String(doc._id || doc.id),
    productId: doc.productId || "",
    productSlug: doc.productSlug || "",
    productSku: doc.productSku || "",
    productName: doc.productName || "",
    productUrl: doc.productUrl || "",
    productImage: doc.productImage || "",
    rating: Number(doc.rating || 5),
    authorName: doc.authorName || "Khách hàng CellphoneS",
    content: doc.content || "",
    status: doc.status || "approved",
    adminReply: doc.adminReply || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(admin
      ? {
        email: doc.email || "",
        phone: doc.phone || "",
        userId: doc.userId || "",
        userRole: doc.userRole || "",
        ip: doc.ip || "",
      }
      : {}),
  };
}

function buildReviewSummary(reviews = []) {
  const approvedReviews = reviews.filter((review) => review.status !== "hidden" && review.status !== "rejected");
  const total = approvedReviews.length;
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: approvedReviews.filter((review) => Number(review.rating) === stars).length,
  }));
  const rating = total
    ? approvedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / total
    : 5;

  return {
    rating: Number(rating.toFixed(1)),
    total,
    distribution,
    samples: approvedReviews.slice(0, 5).map((review) => ({
      id: String(review._id || review.id),
      author: review.authorName || "Khách hàng CellphoneS",
      rating: Number(review.rating || 5),
      content: review.content || "",
      adminReply: review.adminReply || null,
      createdAt: review.createdAt,
    })),
  };
}

function normalizeQuestion(doc = {}, { admin = false } = {}) {
  return {
    id: String(doc._id || doc.id),
    productId: doc.productId || "",
    productSlug: doc.productSlug || "",
    productSku: doc.productSku || "",
    productName: doc.productName || "",
    productUrl: doc.productUrl || "",
    productImage: doc.productImage || "",
    authorName: doc.authorName || "Khách hàng CellphoneS",
    question: doc.question || "",
    status: doc.status || "pending",
    answer: doc.answer || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(admin
      ? {
        email: doc.email || "",
        phone: doc.phone || "",
        userId: doc.userId || "",
        userRole: doc.userRole || "",
        ip: doc.ip || "",
      }
      : {}),
  };
}

async function handleListProductReviews(req, res, identifier) {
  const { productDetails, productReviews } = await getDb();
  const product = await findProductByIdentifier(productDetails, identifier);

  if (!product) {
    sendError(res, 404, "Product not found.");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = toPositiveInt(url.searchParams.get("limit"), 20, MAX_LIMIT);
  const query = {
    ...buildInteractionProductQuery(product, identifier),
    status: "approved",
  };
  const docs = await productReviews
    .find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();

  sendJson(res, 200, {
    ok: true,
    product: normalizeProduct(product),
    summary: buildReviewSummary(docs),
    data: docs.map((review) => normalizeReview(review)),
  });
}

async function handleCreateProductReview(req, res, identifier) {
  const { productDetails, productReviews } = await getDb();
  const product = await findProductByIdentifier(productDetails, identifier);

  if (!product) {
    sendError(res, 404, "Product not found.");
    return;
  }

  const requester = getRequestUser(req);
  if (!requester?.sub && !requester?.id) {
    sendError(res, 401, "Please sign in before reviewing this product.");
    return;
  }

  const body = await parseJsonBody(req);
  const parsed = parseWithSchema(reviewCreateSchema, {
    ...body,
    content: body.content || body.comment || body.review,
  });
  if (!parsed.ok) {
    sendError(res, 400, "Đánh giá không hợp lệ.", parsed.message);
    return;
  }

  if (
    !rateLimitOrSend({
      req,
      res,
      sendError,
      scope: "reviews:create",
      identifier: requester?.sub || requester?.email || "",
      max: Number(process.env.RATE_LIMIT_REVIEW_MAX || 20),
      message: "Bạn gửi đánh giá quá nhanh. Vui lòng thử lại sau ít phút.",
    })
  ) {
    return;
  }

  const authorName = cleanLimitedText(
    body.authorName || body.fullName || requester?.fullName || requester?.email || "Khách hàng CellphoneS",
    120
  );
  const content = cleanLimitedText(parsed.data.content || body.comment || body.review, 2000);

  if (!content || content.length < 5) {
    sendError(res, 400, "Vui lòng nhập nội dung đánh giá tối thiểu 5 ký tự.");
    return;
  }

  const now = new Date();
  const doc = {
    ...buildInteractionProductIdentity(product, identifier),
    rating: sanitizeRating(parsed.data.rating),
    authorName,
    email: normalizeEmail(body.email || requester?.email),
    phone: sanitizePhone(body.phone || requester?.phone),
    content,
    status: "pending",
    userId: requester?.sub || requester?.id || "",
    userRole: requester?.role || "",
    ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
    createdAt: now,
    updatedAt: now,
  };

  const result = await productReviews.insertOne(doc);
  const inserted = await productReviews.findOne({ _id: result.insertedId });

  sendJson(res, 201, {
    ok: true,
    message: "Đánh giá đã được gửi và đang chờ duyệt.",
    data: normalizeReview(inserted),
  });
}

async function handleListProductQuestions(req, res, identifier) {
  const { productDetails, productQuestions } = await getDb();
  const product = await findProductByIdentifier(productDetails, identifier);

  if (!product) {
    sendError(res, 404, "Product not found.");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = toPositiveInt(url.searchParams.get("limit"), 20, MAX_LIMIT);
  const docs = await productQuestions
    .find({
      ...buildInteractionProductQuery(product, identifier),
      status: { $in: ["answered", "approved"] },
    })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();

  sendJson(res, 200, {
    ok: true,
    product: normalizeProduct(product),
    data: docs.map((question) => normalizeQuestion(question)),
  });
}

async function handleCreateProductQuestion(req, res, identifier) {
  const { productDetails, productQuestions } = await getDb();
  const product = await findProductByIdentifier(productDetails, identifier);

  if (!product) {
    sendError(res, 404, "Product not found.");
    return;
  }

  const requester = getRequestUser(req);
  if (!requester?.sub && !requester?.id) {
    sendError(res, 401, "Please sign in before asking a question.");
    return;
  }

  const body = await parseJsonBody(req);
  const parsed = parseWithSchema(questionCreateSchema, {
    ...body,
    question: body.question || body.content,
  });
  if (!parsed.ok) {
    sendError(res, 400, "Câu hỏi không hợp lệ.", parsed.message);
    return;
  }

  if (
    !rateLimitOrSend({
      req,
      res,
      sendError,
      scope: "questions:create",
      identifier: requester?.sub || requester?.email || "",
      max: Number(process.env.RATE_LIMIT_QUESTION_MAX || 20),
      message: "Bạn gửi câu hỏi quá nhanh. Vui lòng thử lại sau ít phút.",
    })
  ) {
    return;
  }

  const question = cleanLimitedText(parsed.data.question, 1200);
  const authorName = cleanLimitedText(
    body.authorName || body.fullName || requester?.fullName || requester?.email || "Khách hàng CellphoneS",
    120
  );

  if (!question || question.length < 5) {
    sendError(res, 400, "Vui lòng nhập câu hỏi tối thiểu 5 ký tự.");
    return;
  }

  const now = new Date();
  const doc = {
    ...buildInteractionProductIdentity(product, identifier),
    authorName,
    email: normalizeEmail(body.email || requester?.email),
    phone: sanitizePhone(body.phone || requester?.phone),
    question,
    status: "pending",
    answer: null,
    userId: requester?.sub || requester?.id || "",
    userRole: requester?.role || "",
    ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
    createdAt: now,
    updatedAt: now,
  };

  const result = await productQuestions.insertOne(doc);
  const inserted = await productQuestions.findOne({ _id: result.insertedId });

  sendJson(res, 201, {
    ok: true,
    message: "Câu hỏi đã được gửi. CellphoneS sẽ phản hồi sớm.",
    data: normalizeQuestion(inserted),
  });
}

async function ensureCouponIndexes(coupons) {
  if (couponIndexesReady) return;

  await Promise.all([
    coupons.createIndex({ code: 1 }, { unique: true, name: "unique_coupon_code" }),
    coupons.createIndex({ status: 1, expiresAt: 1 }, { name: "coupons_status_expiry" }),
  ]);

  couponIndexesReady = true;
}

async function handleCouponApply(req, res) {
  const { coupons } = await getDb();
  await ensureCouponIndexes(coupons);

  const body = await parseJsonBody(req);
  const code = cleanLimitedText(body.code || body.couponCode, 80).toUpperCase();
  const subtotal = cleanCartPrice(body.subtotal || body.totals?.subtotal || body.total);
  const shippingFee = cleanCartPrice(body.shippingFee || body.totals?.shippingFee);

  if (!code) {
    sendError(res, 400, "Vui lòng nhập mã giảm giá.");
    return;
  }

  const coupon = await coupons.findOne({ code, status: "active" });
  if (!coupon) {
    sendError(res, 404, "Mã giảm giá không tồn tại hoặc đã ngừng áp dụng.");
    return;
  }

  const discount = computeCouponDiscount(coupon, { subtotal, shippingFee });
  if (discount <= 0) {
    sendError(res, 400, "Đơn hàng chưa đủ điều kiện áp dụng mã giảm giá.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    data: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discount,
      finalTotal: Math.max(0, subtotal + shippingFee - discount),
    },
  });
}

async function handleCouponValidate(req, res) {
  const { coupons, productDetails, products } = await getDb();
  const body = await parseJsonBody(req);
  const code = cleanLimitedText(body.code || body.couponCode || body.coupon?.code, 80).toUpperCase();

  if (!code) {
    sendError(res, 400, "Vui lòng nhập mã giảm giá.");
    return;
  }

  let subtotal = cleanCartPrice(body.subtotal || body.totals?.subtotal || body.total);
  let shippingFee = cleanCartPrice(body.shippingFee || body.totals?.shippingFee);

  if (Array.isArray(body.items) && body.items.length) {
    try {
      const preview = await buildCheckoutPreview({
        productDetails,
        products,
        coupons,
        body: { ...body, couponCode: code },
      });
      if (preview.couponError) {
        sendError(res, 400, preview.couponError);
        return;
      }
      sendJson(res, 200, {
        ok: true,
        message: "Mã giảm giá hợp lệ.",
        data: {
          coupon: preview.coupon,
          subtotal: preview.totals.subtotal,
          discount: preview.totals.discounts?.coupon || 0,
          shippingFee: preview.totals.shippingFee,
          total: preview.totals.total,
          totals: preview.totals,
        },
      });
      return;
    } catch (error) {
      sendError(res, error.statusCode || 400, error.message || "Không thể kiểm tra mã giảm giá.");
      return;
    }
  }

  const coupon = await findActiveCoupon(coupons, code);
  const baseTotals = { subtotal, shippingFee };
  const reason = getCouponInvalidReason(coupon, baseTotals);
  if (reason) {
    sendError(res, 400, reason);
    return;
  }

  const discount = computeCouponDiscount(coupon, baseTotals);
  if (discount <= 0) {
    sendError(res, 400, "Đơn hàng chưa đủ điều kiện áp dụng mã giảm giá.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    message: "Mã giảm giá hợp lệ.",
    data: {
      coupon: normalizeCouponForPublic(coupon, discount),
      subtotal,
      discount,
      shippingFee,
      total: Math.max(0, subtotal + shippingFee - discount),
    },
  });
}

async function handleCouponsAvailable(req, res) {
  const { coupons } = await getDb();
  await ensureCouponIndexes(coupons);
  const now = new Date();
  const docs = await coupons
    .find({
      status: "active",
      $and: [
        { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: now } }] },
      ],
    })
    .sort({ expiresAt: 1, createdAt: -1 })
    .limit(50)
    .toArray();

  sendJson(res, 200, {
    ok: true,
    data: docs.map((coupon) => normalizeCouponForPublic(coupon, 0)),
  });
}

async function handleCheckoutPreview(req, res) {
  const { coupons, productDetails, products } = await getDb();
  const body = await parseJsonBody(req);

  try {
    const preview = await buildCheckoutPreview({ productDetails, products, coupons, body });
    sendJson(res, 200, {
      ok: true,
      message: "Đã tính lại giỏ hàng từ dữ liệu MongoDB.",
      data: {
        items: preview.items,
        coupon: preview.coupon,
        couponError: preview.couponError,
        shippingChoice: preview.shippingChoice,
        subtotal: preview.totals.subtotal,
        discount: preview.totals.discounts?.coupon || 0,
        shippingFee: preview.totals.shippingFee,
        total: preview.totals.total,
        totals: preview.totals,
      },
    });
  } catch (error) {
    sendError(res, error.statusCode || 400, error.message || "Không thể tính thử đơn hàng.");
  }
}

async function ensureUserEventIndexes(userEvents) {
  if (userEventIndexesReady) return;

  await Promise.all([
    userEvents.createIndex({ type: 1, createdAt: -1 }, { name: "events_type_created_at" }),
    userEvents.createIndex({ userId: 1, createdAt: -1 }, { name: "events_user_created_at" }),
    userEvents.createIndex({ productId: 1, createdAt: -1 }, { name: "events_product_created_at" }),
    userEvents.createIndex({ slug: 1, createdAt: -1 }, { name: "events_slug_created_at" }),
  ]);

  userEventIndexesReady = true;
}

async function handleCreateUserEvent(req, res, options = {}) {
  const { userEvents, productDetails, products } = await getDb();
  await ensureUserEventIndexes(userEvents);
  const requester = getRequestUser(req);
  const body = await parseJsonBody(req);
  const type = cleanLimitedText(options.type || body.type || body.eventType, 80);

  if (!["view_product", "search", "add_to_cart", "order_created"].includes(type)) {
    sendError(res, 400, "Event type không hợp lệ.");
    return;
  }

  let product = null;
  if (type === "view_product") {
    const identifier = cleanLimitedText(body.productId || body.id || body.slug || getSlugFromUrl(body.url || ""), 240);
    if (identifier) {
      product = (await findProductByIdentifier(productDetails, identifier)) ||
        (await findProductByIdentifier(products, identifier));
    }
  }
  const normalizedProduct = product ? normalizeProduct(product) : null;

  const doc = {
    type,
    userId: requester?.sub || requester?.id || "",
    productId: cleanLimitedText(normalizedProduct?.id || body.productId || body.id, 180),
    slug: stripHtmlExtension(normalizedProduct?.slug || body.slug || getSlugFromUrl(body.url || "")),
    keyword: cleanLimitedText(body.keyword || body.query, 240),
    category: cleanLimitedText(normalizedProduct?.category || body.category, 180),
    brand: cleanLimitedText(normalizedProduct?.brand || body.brand, 120),
    productName: cleanLimitedText(normalizedProduct?.name || body.productName || body.name, 300),
    productImage: cleanLimitedText(normalizedProduct?.image || body.productImage || body.image, 700),
    meta: typeof body.meta === "object" && body.meta ? body.meta : {},
    createdAt: new Date(),
  };

  await userEvents.insertOne(doc);
  sendJson(res, 201, { ok: true, data: { saved: true, event: doc } });
}

async function handleRecentlyViewedProducts(req, res) {
  const owner = getRequiredCustomer(req, res);
  if (!owner) return;

  const { userEvents, productDetails, products } = await getDb();
  await ensureUserEventIndexes(userEvents);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = toPositiveInt(url.searchParams.get("limit"), 12, MAX_LIMIT);
  const events = await userEvents
    .find({ userId: owner.userId, type: "view_product" })
    .sort({ createdAt: -1 })
    .limit(Math.max(limit * 4, 40))
    .toArray();

  const seen = new Set();
  const data = [];
  for (const event of events) {
    const identifier = event.slug || event.productId;
    if (!identifier || seen.has(identifier)) continue;
    seen.add(identifier);
    const product =
      (await findProductByIdentifier(productDetails, identifier)) ||
      (await findProductByIdentifier(products, identifier));
    data.push(product ? normalizeProduct(product) : {
      id: event.productId || event.slug,
      slug: event.slug || "",
      name: event.productName || "Sản phẩm đã xem",
      image: event.productImage || "",
      brand: event.brand || "",
      category: event.category || "",
    });
    if (data.length >= limit) break;
  }

  sendJson(res, 200, { ok: true, data });
}

async function fetchRecommendationProducts({ productDetails, query = {}, limit = 12, sort = {} }) {
  const docs = await productDetails
    .find(query, {
      projection: {
        name: 1,
        slug: 1,
        sku: 1,
        brand: 1,
        currentPrice: 1,
        price: 1,
        originalPrice: 1,
        primaryImage: 1,
        images: { $slice: 1 },
        categories: 1,
        category: 1,
        availability: 1,
        updatedAt: 1,
        scrapedAt: 1,
      },
    })
    .sort(Object.keys(sort).length ? sort : { webFreshnessScore: -1, updatedAt: -1, scrapedAt: -1, _id: -1 })
    .limit(limit)
    .toArray();

  return docs.map(normalizeProduct);
}

async function handleRecommendationsRequest(req, res, pathParts) {
  const { productDetails, userEvents } = await getDb();
  await ensureUserEventIndexes(userEvents);
  const action = pathParts[2] || "trending";
  const identifier = decodeURIComponent(pathParts[3] || "");
  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = toPositiveInt(url.searchParams.get("limit"), 12, MAX_LIMIT);

  if (action === "related" && identifier) {
    const base = await findProductByIdentifier(productDetails, identifier);
    if (!base) {
      sendError(res, 404, "Product not found.");
      return;
    }

    const price = firstPositiveNumber(base.currentPrice, base.price);
    const relatedOr = [
      ...(base.brand ? [{ brand: base.brand }] : []),
      ...(Array.isArray(base.categories) && base.categories.length
        ? [{ categories: { $in: base.categories.slice(0, 3) } }]
        : []),
      ...(price ? [{ currentPrice: { $gte: price * 0.75, $lte: price * 1.35 } }] : []),
    ];
    const query = {
      _id: { $ne: base._id },
      ...(relatedOr.length ? { $or: relatedOr } : {}),
    };

    const data = await fetchRecommendationProducts({ productDetails, query, limit });
    sendJson(res, 200, { ok: true, baseProduct: normalizeProduct(base), data });
    return;
  }

  if (action === "for-you") {
    const requester = getRequestUser(req);
    const recentEvents = requester?.sub
      ? await userEvents.find({ userId: requester.sub }).sort({ createdAt: -1 }).limit(10).toArray()
      : [];
    const brands = uniqueStrings(recentEvents.map((event) => event.brand)).filter(Boolean);
    const categories = uniqueStrings(recentEvents.map((event) => event.category)).filter(Boolean);
    const query = brands.length || categories.length
      ? { $or: [{ brand: { $in: brands } }, { categories: { $in: categories } }] }
      : {};
    const data = await fetchRecommendationProducts({ productDetails, query, limit });
    sendJson(res, 200, { ok: true, data });
    return;
  }

  const data = await fetchRecommendationProducts({ productDetails, limit });
  sendJson(res, 200, { ok: true, data });
}

async function handleChatbotMessage(req, res) {
  const { productDetails, userEvents } = await getDb();
  const requester = getRequestUser(req);
  const body = await parseJsonBody(req);
  const message = cleanLimitedText(body.message || body.text || body.query, 500);

  if (!message) {
    sendError(res, 400, "Vui lòng nhập tin nhắn.");
    return;
  }

  const regex = new RegExp(escapeRegex(message), "i");
  const data = await fetchRecommendationProducts({
    productDetails,
    query: {
      $or: [
        { name: regex },
        { brand: regex },
        { category: regex },
        { categories: regex },
        { sku: regex },
      ],
    },
    limit: 8,
  });

  await userEvents.insertOne({
    type: "search",
    userId: requester?.sub || "",
    keyword: message,
    source: "chatbot",
    createdAt: new Date(),
  });

  sendJson(res, 200, {
    ok: true,
    data: {
      answer: data.length
        ? `Mình tìm thấy ${data.length} sản phẩm phù hợp với "${message}".`
        : `Mình chưa tìm thấy sản phẩm thật sự khớp với "${message}". Bạn thử mô tả ngắn hơn hoặc nhập tên hãng nhé.`,
      products: data,
    },
  });
}

async function writeApiAdminAuditLog(adminAuditLogs, req, action, targetType, targetId, changes = {}) {
  if (!adminAuditLogs) return;

  const actor = getRequestUser(req);
  await adminAuditLogs.insertOne({
    actorId: actor?.sub || "",
    actorRole: actor?.role || "admin-api-key",
    actorEmail: actor?.email || "",
    action,
    targetType,
    targetId: String(targetId || ""),
    before: changes.before || null,
    after: changes.after || null,
    meta: changes.meta || {},
    createdAt: new Date(),
  });
}

async function handleCreateProduct(req, res) {
  if (!isWriteAuthorized(req)) {
    sendError(res, 401, "Unauthorized.");
    return;
  }

  const { productDetails, adminAuditLogs } = await getDb();
  const body = await parseJsonBody(req);
  const product = sanitizeProductInput(body, { isCreate: true });
  const now = new Date();
  product.createdAt = now;
  product.updatedAt = now;

  const result = await productDetails.insertOne(product);
  const inserted = await productDetails.findOne({ _id: result.insertedId });
  await writeApiAdminAuditLog(adminAuditLogs, req, "create", "product", inserted?._id, {
    after: inserted,
  });

  sendJson(res, 201, {
    ok: true,
    data: normalizeProduct(inserted),
    raw: inserted,
  });
}

async function handleUpdateProduct(req, res, identifier) {
  if (!isWriteAuthorized(req)) {
    sendError(res, 401, "Unauthorized.");
    return;
  }

  const { productDetails, adminAuditLogs } = await getDb();
  const body = await parseJsonBody(req);
  const update = sanitizeProductInput(body);
  update.updatedAt = new Date();
  const existing = await findProductByIdentifier(productDetails, identifier);

  if (!existing) {
    sendError(res, 404, "Product not found.");
    return;
  }

  const result = await productDetails.findOneAndUpdate(
    { _id: existing._id },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result) {
    sendError(res, 404, "Product not found.");
    return;
  }

  await writeApiAdminAuditLog(adminAuditLogs, req, "update", "product", existing._id, {
    before: existing,
    after: result,
  });

  sendJson(res, 200, {
    ok: true,
    data: normalizeProduct(result),
    raw: result,
  });
}

async function handleDeleteProduct(_req, res, identifier) {
  if (!isWriteAuthorized(_req)) {
    sendError(res, 401, "Unauthorized.");
    return;
  }

  const { productDetails, adminAuditLogs } = await getDb();
  const existing = await findProductByIdentifier(productDetails, identifier);

  if (!existing) {
    sendError(res, 404, "Product not found.");
    return;
  }

  const result = await productDetails.findOneAndDelete({ _id: existing._id });

  if (!result) {
    sendError(res, 404, "Product not found.");
    return;
  }

  await writeApiAdminAuditLog(adminAuditLogs, _req, "delete", "product", existing._id, {
    before: result,
  });

  sendJson(res, 200, {
    ok: true,
    deleted: normalizeProduct(result),
  });
}

async function routeRequest(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (pathParts.length === 0 && req.method === "GET") {
    await handleApiIndex(req, res);
    return;
  }

  if (pathParts[0] !== "api") {
    sendError(res, 404, "Route not found.");
    return;
  }

  if (!pathParts[1] && req.method === "GET") {
    await handleApiIndex(req, res);
    return;
  }

  if (pathParts[1] === "health" && req.method === "GET") {
    await handleHealth(req, res);
    return;
  }

  if (pathParts[1] === "auth") {
    await handleAuthRequest({
      req,
      res,
      pathParts,
      parseJsonBody,
      sendJson,
      sendError,
      getDb,
    });
    return;
  }

  if (pathParts[1] === "admin") {
    await handleAdminRequest({
      req,
      res,
      pathParts,
      parseJsonBody,
      sendJson,
      sendError,
      getDb,
    });
    return;
  }

  if (pathParts[1] === "cart") {
    await handleCartRequest(req, res, pathParts);
    return;
  }

  if (pathParts[1] === "checkout" && pathParts[2] === "preview" && req.method === "POST") {
    await handleCheckoutPreview(req, res);
    return;
  }

  if (pathParts[1] === "payments" && pathParts[2] === "bank-transfer-webhook" && req.method === "POST") {
    await handleBankPaymentWebhook(req, res);
    return;
  }

  if (pathParts[1] === "orders") {
    await handleOrdersRequest(req, res, pathParts);
    return;
  }

  if (pathParts[1] === "addresses") {
    await handleAddressesRequest(req, res, pathParts);
    return;
  }

  if (pathParts[1] === "wishlist") {
    await handleWishlistRequest(req, res, pathParts);
    return;
  }

  if (pathParts[1] === "notifications") {
    await handleNotificationsRequest(req, res, pathParts);
    return;
  }

  if (pathParts[1] === "me") {
    await handleMeExtrasRequest(req, res, pathParts);
    return;
  }

  if (pathParts[1] === "smember" && pathParts[2] === "profile" && req.method === "GET") {
    await handleSmemberProfile(req, res);
    return;
  }

  if (pathParts[1] === "coupons" && pathParts[2] === "apply" && req.method === "POST") {
    await handleCouponApply(req, res);
    return;
  }

  if (pathParts[1] === "coupons" && pathParts[2] === "validate" && req.method === "POST") {
    await handleCouponValidate(req, res);
    return;
  }

  if (pathParts[1] === "coupons" && pathParts[2] === "available" && req.method === "GET") {
    await handleCouponsAvailable(req, res);
    return;
  }

  if (pathParts[1] === "warranty" && pathParts[2] === "check" && ["GET", "POST"].includes(req.method)) {
    await handleWarrantyCheck(req, res);
    return;
  }

  if (pathParts[1] === "returns") {
    await handleReturnsRequest(req, res, pathParts);
    return;
  }

  if (pathParts[1] === "user-events" && pathParts[2] === "view-product" && req.method === "POST") {
    await handleCreateUserEvent(req, res, { type: "view_product" });
    return;
  }

  if (pathParts[1] === "events" && req.method === "POST") {
    await handleCreateUserEvent(req, res);
    return;
  }

  if (pathParts[1] === "recommendations" && req.method === "GET") {
    await handleRecommendationsRequest(req, res, pathParts);
    return;
  }

  if (pathParts[1] === "chatbot" && pathParts[2] === "message" && req.method === "POST") {
    await handleChatbotMessage(req, res);
    return;
  }

  if (pathParts[1] !== "products") {
    sendError(res, 404, "Route not found.");
    return;
  }

  if (pathParts[2] === "recently-viewed" && req.method === "GET") {
    await handleRecentlyViewedProducts(req, res);
    return;
  }

  const identifier = pathParts[2];
  const subresource = pathParts[3];

  if (!identifier && req.method === "GET") {
    await handleListProducts(req, res);
    return;
  }

  if (!identifier && req.method === "POST") {
    await handleCreateProduct(req, res);
    return;
  }

  if (identifier && !subresource && req.method === "GET") {
    await handleGetProduct(req, res, identifier);
    return;
  }

  if (identifier && !subresource && ["PUT", "PATCH"].includes(req.method)) {
    await handleUpdateProduct(req, res, identifier);
    return;
  }

  if (identifier && !subresource && req.method === "DELETE") {
    await handleDeleteProduct(req, res, identifier);
    return;
  }

  if (identifier && subresource === "details" && req.method === "GET") {
    await handleGetProductDetails(req, res, identifier);
    return;
  }

  if (identifier && subresource === "related" && req.method === "GET") {
    await handleRelatedProducts(req, res, identifier);
    return;
  }

  if (identifier && subresource === "reviews" && req.method === "GET") {
    await handleListProductReviews(req, res, identifier);
    return;
  }

  if (identifier && subresource === "reviews" && req.method === "POST") {
    await handleCreateProductReview(req, res, identifier);
    return;
  }

  if (identifier && subresource === "questions" && req.method === "GET") {
    await handleListProductQuestions(req, res, identifier);
    return;
  }

  if (identifier && subresource === "questions" && req.method === "POST") {
    await handleCreateProductQuestion(req, res, identifier);
    return;
  }

  sendError(res, 405, "Method not allowed.");
}

const server = http.createServer((req, res) => {
  routeRequest(req, res).catch((error) => {
    console.error("[api]", error);
    sendError(res, 500, "Internal server error.", error.message);
  });
});

server.listen(API_PORT, () => {
  const { dbName, productsCollection, productDetailsCollection } = getMongoConfig();
  console.log(`API server listening on http://localhost:${API_PORT}`);
  console.log(`MongoDB source: ${dbName}.${productsCollection}`);
  console.log(`MongoDB details: ${dbName}.${productDetailsCollection}`);
});

async function shutdown() {
  if (mongoClient) await mongoClient.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
