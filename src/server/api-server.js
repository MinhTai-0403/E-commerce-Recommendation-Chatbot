const http = require("http");
const crypto = require("node:crypto");
const { ObjectId } = require("mongodb");
const { ProxyAgent } = require("undici");
const { handleAdminRequest, isAdminAuthorized } = require("../services/admin-service");
const {
  handleAuthRequest,
  getAuthToken,
  sendNewsletterCouponEmail,
  sendOrderInvoiceEmail,
  verifyJwt,
} = require("../services/auth-service");
const { ensureCommerceDatabase } = require("../services/db-maintenance");
const {
  searchCellphoneStores,
} = require("../services/google-places-store-service");
const { extractCellphonesDetails } = require("../cellphones/cellphones-detail-extractor");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const { rateLimitOrSend } = require("../middlewares/rate-limit");
const {
  parseJsonBody,
  prepareCorsResponse,
  sendError,
  sendJson,
} = require("./http-response");
const {
  computeCouponDiscount,
  getCouponAvailabilityInvalidReason,
  getCouponInvalidReason,
  getEligibleCouponAudiences,
  normalizeCouponForPublic,
} = require("../services/coupon-service");
const {
  buildOrderPayment,
  sanitizePaymentMethod,
} = require("../services/payment-service");
const {
  buildOrderTracking,
  generateOrderCode,
  ORDER_TRACKING_LABELS,
} = require("../services/order-tracking-service");
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
const { LONG_BATTERY_PHONE_MIN_MAH } = require("../utils/product-spec-facets");

const API_PORT = Number(process.env.API_PORT || 5050);
const MAX_LIMIT = 300;
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
const API_RESPONSE_CACHE_ENABLED = String(process.env.API_RESPONSE_CACHE_ENABLED || "true") !== "false";
const API_PRODUCTS_CACHE_TTL_MS = Number(process.env.API_PRODUCTS_CACHE_TTL_MS || 60_000);
const API_PRODUCT_DETAIL_CACHE_TTL_MS = Number(process.env.API_PRODUCT_DETAIL_CACHE_TTL_MS || 10 * 60_000);
const API_RELATED_PRODUCTS_CACHE_TTL_MS = Number(
  process.env.API_RELATED_PRODUCTS_CACHE_TTL_MS || 2 * 60_000
);
const API_PRODUCT_COUNT_CACHE_TTL_MS = Number(
  process.env.API_PRODUCT_COUNT_CACHE_TTL_MS || 5 * 60_000
);
const API_RESPONSE_CACHE_MAX_ENTRIES = Number(process.env.API_RESPONSE_CACHE_MAX_ENTRIES || 500);
const API_PRODUCT_COUNT_CACHE_MAX_ENTRIES = Number(
  process.env.API_PRODUCT_COUNT_CACHE_MAX_ENTRIES || 300
);

let mongoClient;
let dbContextPromise;
let lazyProxyPool;
let lazyProxyCursor = 0;
const lazyScrapeFailures = new Map();
const lazyScrapeInflight = new Map();
const apiResponseCache = new Map();
const apiProductCountCache = new Map();
const apiProductCountInflight = new Map();
let cartIndexesReady = false;
let orderIndexesReady = false;
let inventoryIndexesReady = false;
let couponIndexesReady = false;
let userEventIndexesReady = false;
let supportRequestIndexesReady = false;
let returnRequestIndexesReady = false;

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function getSortedRequestCacheKey(req, namespace = "api") {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const sortedParams = [...url.searchParams.entries()]
    .sort(([keyA, valueA], [keyB, valueB]) => (
      keyA === keyB ? String(valueA).localeCompare(String(valueB)) : String(keyA).localeCompare(String(keyB))
    ));
  const search = sortedParams
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `${namespace}:${req.method}:${url.pathname}${search ? `?${search}` : ""}`;
}

function getApiResponseCache(req, namespace = "api") {
  if (!API_RESPONSE_CACHE_ENABLED || req.method !== "GET") return null;
  const key = getSortedRequestCacheKey(req, namespace);
  const cached = apiResponseCache.get(key);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    apiResponseCache.delete(key);
    return null;
  }

  apiResponseCache.delete(key);
  apiResponseCache.set(key, cached);
  return cached.payload;
}

function setApiResponseCache(req, payload, ttlMs, namespace = "api") {
  if (!API_RESPONSE_CACHE_ENABLED || req.method !== "GET" || !ttlMs || ttlMs <= 0) return payload;

  if (apiResponseCache.size >= API_RESPONSE_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, value] of apiResponseCache.entries()) {
      if (value.expiresAt <= now || apiResponseCache.size >= API_RESPONSE_CACHE_MAX_ENTRIES) {
        apiResponseCache.delete(key);
      }
      if (apiResponseCache.size < API_RESPONSE_CACHE_MAX_ENTRIES) break;
    }
  }

  apiResponseCache.set(getSortedRequestCacheKey(req, namespace), {
    expiresAt: Date.now() + ttlMs,
    payload,
  });
  return payload;
}

function getProductCountCacheKey(req) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const ignored = new Set(["page", "limit", "sort", "raw", "include"]);
  const search = [...url.searchParams.entries()]
    .filter(([key]) => !ignored.has(key))
    .sort(([keyA, valueA], [keyB, valueB]) => (
      keyA === keyB ? String(valueA).localeCompare(String(valueB)) : String(keyA).localeCompare(String(keyB))
    ))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return search || "__all__";
}

async function getCachedProductCount(req, collection, query) {
  const key = getProductCountCacheKey(req);
  const cached = apiProductCountCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    apiProductCountCache.delete(key);
    apiProductCountCache.set(key, cached);
    return cached.value;
  }
  if (cached) apiProductCountCache.delete(key);

  if (apiProductCountInflight.has(key)) {
    return apiProductCountInflight.get(key);
  }

  const countPromise = collection.countDocuments(query)
    .then((value) => {
      apiProductCountCache.set(key, {
        value,
        expiresAt: Date.now() + API_PRODUCT_COUNT_CACHE_TTL_MS,
      });
      while (apiProductCountCache.size > API_PRODUCT_COUNT_CACHE_MAX_ENTRIES) {
        const oldestKey = apiProductCountCache.keys().next().value;
        if (!oldestKey) break;
        apiProductCountCache.delete(oldestKey);
      }
      return value;
    })
    .finally(() => apiProductCountInflight.delete(key));

  apiProductCountInflight.set(key, countPromise);
  return countPromise;
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
    facets: product.facets || {},
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

function buildProductSearchCondition(value = "") {
  const text = String(value || "").trim();
  if (!text) return {};

  const identityFields = [
    "name",
    "slug",
    "sku",
    "trainingLabels.productName",
    "trainingLabels.deviceLine",
    "rawProductJsonLd.name",
  ];
  const fields = [
    "name",
    "slug",
    "sku",
    "brand",
    "category",
    "categories",
    "categoryTrail.name",
    "categoryTrail.label",
    "trainingLabels.productName",
    "trainingLabels.deviceLine",
    "trainingLabels.deviceGroup",
    "sourceUrls",
    "url",
  ];
  const alternatives = uniqueStrings(
    text
      .split(/\s*(?:\||\/|,|;)\s*/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const phrases = alternatives.length ? alternatives : [text];
  const stopWords = new Set([
    "san", "pham", "phu", "kien", "thiet", "bi", "cho", "va", "cac",
    "dong", "loai", "xem", "tat", "ca", "hot", "moi", "series",
  ]);
  const conditions = [];

  for (const phrase of phrases) {
    const normalizedPhraseParts = normalizeSearchKey(phrase)
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    const hasModelNumber = normalizedPhraseParts.some((part) => /\d/.test(part));

    // Tên model có số phiên bản phải khớp liền mạch trong chính định danh sản
    // phẩm. Không cho từng token khớp rải rác qua brand/category/sourceUrls vì
    // "Apple Watch Ultra 3" khi đó có thể trả về Ultra 2 chỉ vì tài liệu chứa
    // một con số 3 ở trường khác.
    if (hasModelNumber && normalizedPhraseParts.length >= 2) {
      const orderedModelPattern = normalizedPhraseParts
        .map(escapeRegex)
        .join("[-_\\s/()]*");
      conditions.push(regexCondition(
        identityFields,
        new RegExp(`${orderedModelPattern}(?!\\d)`, "i")
      ));
      continue;
    }

    conditions.push(regexCondition(fields, new RegExp(escapeRegex(phrase), "i")));

    if (normalizedPhraseParts.length) {
      const slugPattern = normalizedPhraseParts.map(escapeRegex).join("[-_\\s]*");
      conditions.push(regexCondition(
        ["slug", "sku", "url", "sourceUrls"],
        new RegExp(slugPattern, "i")
      ));
    }

    const tokens = phrase
      .split(/\s+/)
      .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
      .filter(Boolean)
      .filter((token) => {
        const normalized = normalizeSearchKey(token).replace(/[^a-z0-9]+/g, "");
        return normalized.length >= 2 && !stopWords.has(normalized);
      })
      .slice(0, 6);

    if (tokens.length >= 2) {
      conditions.push({
        $and: tokens.map((token) => (
          regexCondition(fields, new RegExp(escapeRegex(token), "i"))
        )),
      });
    }
  }

  return conditions.length === 1 ? conditions[0] : { $or: conditions };
}

function buildApplianceTopicCondition(value = "") {
  const key = normalizeSearchKey(value).replace(/[^a-z0-9]+/g, "-");
  const identityFields = [
    "name",
    "slug",
    "sku",
  ];
  const topicRules = {
    quat: /(?:^|[\s-])(quạt|quat)(?:$|[\s-])/i,
    "robot-hut-bui": /robot.{0,24}(hút bụi|hut bui)|(hút bụi|hut bui).{0,24}robot/i,
    "may-chieu": /(?:^|[\s-])(máy chiếu|may chieu|projector)(?:$|[\s-])/i,
    "may-loc-khong-khi": /^(?:máy|may).{0,16}(?:lọc không khí|loc khong khi)|air purifier/i,
    "may-hut-am": /^(?:máy|may).{0,16}(?:hút ẩm|hut am)|dehumidifier/i,
    "may-hut-bui-cam-tay": /(?:máy|may).{0,28}(?:hút bụi|hut bui).{0,24}(?:cầm tay|cam tay)|(?:hút bụi|hut bui).{0,24}(?:cầm tay|cam tay)/i,
    "tv-box": /(?:^|[\s-])(tv box|mi box|playbox|tv stick|đầu thu|dau thu)(?:$|[\s-])/i,
    "may-suoi-quat-suoi": /(?:máy sưởi|may suoi|quạt sưởi|quat suoi|đèn sưởi|den suoi)/i,
    "ban-ui": /^(?:bàn ủi|ban ui|bàn là|ban la)|garment steamer/i,
    "noi-chien-khong-dau": /(?:nồi chiên không dầu|noi chien khong dau|air fryer)/i,
    "noi-com-dien": /(?:nồi cơm|noi com).{0,18}(?:điện|dien)|rice cooker/i,
    "may-xay-sinh-to": /(?:máy xay sinh tố|may xay sinh to|blender)/i,
    "may-ep-trai-cay": /(?:máy ép trái cây|may ep trai cay|máy ép chậm|may ep cham|slow juicer|juicer)/i,
    "may-lam-sua-hat": /(?:máy làm sữa hạt|may lam sua hat)/i,
    "bep-dien": /(?:^|[\s-])(bếp điện|bep dien|bếp từ|bep tu|induction cooker)(?:$|[\s-])/i,
    "am-sieu-toc": /(?:ấm.{0,16}siêu tốc|am.{0,16}sieu toc|ấm đun nước|am dun nuoc|kettle)/i,
    "noi-ap-suat": /(?:nồi|noi).{0,24}(?:áp suất|ap suat|pressure cooker)/i,
    "noi-nau-cham": /(?:nồi nấu chậm|noi nau cham|slow cooker)/i,
    "noi-lau-dien": /(?:nồi lẩu|noi lau|nồi điện đa năng|noi dien da nang|lẩu điện|lau dien)/i,
    "may-say-toc": /(?:máy sấy tóc|may say toc|hair dryer)/i,
    "may-massage": /(?:máy|may|súng|sung|gối|goi|đai|dai|ghế|ghe).{0,24}massage/i,
    "may-cao-rau": /^(?:máy|may).{0,16}(?:cạo râu|cao rau)|combo.{0,32}(?:máy|may).{0,16}(?:cạo râu|cao rau)/i,
    "can-suc-khoe": /(?:cân sức khỏe|can suc khoe|cân điện tử thông minh|can dien tu thong minh|smart scale)/i,
    "ban-chai-dien": /^(?:bàn chải|ban chai).{0,24}(?:điện|dien)|electric toothbrush/i,
    "may-tam-nuoc": /(?:máy tăm nước|may tam nuoc|water flosser)/i,
    "tong-do-cat-toc": /(?:tông đơ|tong do).{0,20}(?:cắt tóc|cat toc|hớt tóc|hot toc)|hair clipper/i,
    "may-tia-long-mui": /^(?:máy|may).{0,16}(?:tỉa lông mũi|tia long mui)|nose hair trimmer/i,
    "may-rua-mat": /(?:máy rửa mặt|may rua mat|facial cleansing)/i,
    "may-tao-kieu-toc": /(?:máy|may|bộ|bo|lược|luoc).{0,28}(?:tạo kiểu|tao kieu|duỗi tóc|duoi toc|uốn tóc|uon toc)|hair styler/i,
    "may-triet-long": /(?:máy triệt lông|may triet long|máy làm sạch lông|may lam sach long|hair removal|\bipl\b)/i,
    "may-do-huyet-ap": /^(?:máy|may).{0,20}(?:đo huyết áp|do huyet ap)|blood pressure monitor/i,
  };
  const rule = topicRules[key];
  if (!rule) return null;

  const topicExcludes = {
    "may-tia-long-mui": /lint remover|máy cắt lông xù|may cat long xu/i,
  };
  const includeCondition = regexCondition(identityFields, rule);
  const exclude = topicExcludes[key];
  return exclude
    ? { $and: [includeCondition, { $nor: [regexCondition(identityFields, exclude)] }] }
    : includeCondition;
}

function buildAccessoryTopicCondition(value = "") {
  const key = normalizeSearchKey(value).replace(/[^a-z0-9]+/g, "-");
  const identityFields = ["name", "slug", "sku", "trainingLabels.productName"];
  const topicRules = {
    "phu-kien-apple": {
      include: /^(?:airtag|apple pencil|bút cảm ứng apple|but cam ung apple|bàn phím apple|ban phim apple|magic keyboard|magic mouse|magic trackpad|ví iphone|vi iphone|phụ kiện apple|phu kien apple)|^(?:cáp|cap|sạc|sac|adapter|ốp|op|bao da|dán|dan|kính|kinh).{0,48}(?:apple|iphone|ipad|macbook)/i,
      exclude: /^(?:airpods|tai nghe|apple watch|iphone|ipad|macbook|apple\s*care\+?|applecare\+?)(?:[\s-]|$)/i,
    },
    "dan-man-hinh": {
      include: /^(?:dán|dan|miếng dán|mieng dan|kính cường lực|kinh cuong luc|cường lực|cuong luc|screen protector)(?:[\s-]|$)/i,
      exclude: /(?:camera|ống kính|ong kinh|lens|mặt lưng|mat lung)/i,
    },
    "op-lung-bao-da": {
      include: /^(?:ốp lưng|op lung|bao da|flip cover|smart cover|case (?:cho|for)|cover (?:cho|for))(?:[\s-]|$)/i,
    },
    "the-nho": {
      include: /^(?:thẻ nhớ|the nho|memory card|micro ?sd|sdhc|sdxc|cfexpress)(?:[\s-]|$)/i,
    },
    "apple-care": {
      include: /(?:^|[\s-])apple\s*care\+?|applecare\+?/i,
    },
    "samsung-care": {
      include: /(?:^|[\s-])samsung\s*care\+?/i,
    },
    "sim-4g-5g": {
      include: /^(?:e?sim)(?:[\s-]|$)/i,
    },
    "cap-sac": {
      include: /^(?:(?:cáp|cap)(?:[\s-]|$)|(?:củ|cu|bộ|bo|đế|de|dock).{0,20}(?:sạc|sac)|(?:sạc|sac)(?:[\s-]|$)|adapter(?:[\s-]|$)|charger(?:[\s-]|$))/i,
      exclude: /(?:trạm sạc dự phòng|tram sac du phong|trạm-sạc-dự-phòng|tram-sac-du-phong|pin dự phòng|pin du phong|power ?bank)/i,
    },
    "pin-du-phong": {
      include: /^(?:pin dự phòng|pin du phong|power ?bank)(?:[\s-]|$)/i,
      exclude: /(?:trạm sạc|tram sac|power station)/i,
    },
    "tram-sac-du-phong": {
      include: /^(?:trạm sạc dự phòng|tram sac du phong|portable power station|power station)(?:[\s-]|$)/i,
    },
    "day-deo-cheo-dien-thoai": {
      include: /^(?:dây đeo chéo|day deo cheo|dây đeo điện thoại|day deo dien thoai|dây đeo máy ảnh\/điện thoại|day deo may anh\/dien thoai)(?:[\s-]|$)/i,
    },
    "phu-kien-dien-thoai": {
      include: /^(?:phụ kiện điện thoại|phu kien dien thoai|ốp lưng|op lung|bao da|dán|dan|kính cường lực|kinh cuong luc|cáp|cap|sạc|sac|pin dự phòng|pin du phong|dây đeo.*điện thoại|day deo.*dien thoai|giá đỡ điện thoại|gia do dien thoai|bút cảm ứng|but cam ung)(?:[\s-]|$)/i,
    },
    "chuot-ban-phim": {
      include: /^(?:chuột|chuot|mouse|bàn phím|ban phim|keyboard|combo.{0,32}(?:chuột|chuot|mouse|bàn phím|ban phim|keyboard))(?:[\s-]|$)/i,
    },
    "balo-laptop-tui-chong-soc": {
      include: /^(?:balo|ba lô|ba lo|túi chống sốc|tui chong soc|túi đựng laptop|tui dung laptop|laptop bag)(?:[\s-]|$)/i,
    },
    "phan-mem": {
      include: /^(?:phần mềm|phan mem|microsoft (?:office|365|windows)|office (?:home|personal|professional)|windows 1[01]|antivirus)(?:[\s-]|$)/i,
    },
    webcam: {
      include: /^(?:webcam|web camera)(?:[\s-]|$)/i,
    },
    "gia-do": {
      include: /^(?:giá đỡ|gia do|đế đỡ|de do|stand)(?:[\s-]|$)/i,
    },
    "tham-lot-chuot": {
      include: /^(?:thảm lót chuột|tham lot chuot|tấm lót chuột|tam lot chuot|lót chuột|lot chuot|mouse ?pad)(?:[\s-]|$)/i,
    },
    "sac-laptop": {
      include: /^(?:sạc|sac|củ sạc|cu sac|bộ sạc|bo sac|adapter|charger).{0,32}(?:laptop|macbook|notebook)/i,
    },
    "camera-phong-hop": {
      include: /^(?:camera phòng họp|camera phong hop|camera hội nghị|camera hoi nghi|conference camera)(?:[\s-]|$)/i,
    },
    "hub-chuyen-doi": {
      include: /^(?:hub(?: chuyển đổi| chuyen doi| type-?c| usb| [0-9]+)|dock(?: chuyển đổi| chuyen doi| type-?c| usb)|bộ chuyển đổi|bo chuyen doi)(?:[\s-]|$)/i,
      exclude: /(?:switch|chia mạng|chia mang|poe)/i,
    },
    usb: {
      include: /^(?:usb(?![\s-]*(?:wifi|wi-fi|bluetooth))|ổ flash|o flash|flash drive)(?:[\s-]|$)/i,
    },
    "o-cung-di-dong": {
      include: /^(?:ổ cứng di động|o cung di dong|ổ cứng gắn ngoài|o cung gan ngoai|portable (?:ssd|hdd)|external (?:ssd|hdd))(?:[\s-]|$)/i,
    },
    playstation: {
      include: /(?:^|[\s-])playstation(?:[\s-]|$)|(?:^|[\s-])ps[45](?:[\s-]|$)/i,
    },
    "rog-ally": {
      include: /(?:^|[\s-])rog ally(?:[\s-]|$)/i,
    },
    "day-deo-dong-ho": {
      include: /^(?:(?:bộ|bo)\s*\d+\s*)?(?:dây|day|đai|dai).{0,36}(?:đồng hồ|dong ho|watch)(?:[\s-]|$)/i,
    },
    "but-cam-ung": {
      include: /^(?:bút cảm ứng|but cam ung|stylus|apple pencil|s pen)(?:[\s-]|$)/i,
    },
    "gia-do-dien-thoai": {
      include: /^(?:giá đỡ|gia do|đế đỡ|de do).{0,32}(?:điện thoại|dien thoai|iphone|smartphone|tablet|ipad)/i,
    },
    "tui-chong-nuoc": {
      include: /^(?:túi chống nước|tui chong nuoc|waterproof (?:bag|pouch))(?:[\s-]|$)/i,
    },
    "phu-kien-o-to": {
      include: /^(?:phụ kiện ô tô|phu kien o to|bơm lốp|bom lop|bơm xe|bom xe|kích bình|kich binh|sạc ô tô|sac o to|tẩu sạc|tau sac)(?:[\s-]|$)/i,
    },
    "thiet-bi-dinh-vi": {
      include: /^(?:thiết bị định vị|thiet bi dinh vi|thiết bị theo dõi định vị|thiet bi theo doi dinh vi|thẻ định vị|the dinh vi|bộ định vị|bo dinh vi|ví.{0,20}định vị|vi.{0,20}dinh vi|airtag|smarttag)(?:[\s-]|$)/i,
    },
    "op-lung-iphone-17": {
      include: /^(?:ốp lưng|op lung|bao da).{0,40}iphone 17/i,
    },
    "dan-man-hinh-iphone-17": {
      include: /^(?:dán|dan|miếng dán|mieng dan|kính|kinh).{0,48}iphone 17/i,
      exclude: /(?:camera|ống kính|ong kinh|lens)/i,
    },
    "op-lung-s26-series": {
      include: /^(?:ốp lưng|op lung|bao da).{0,48}(?:galaxy )?s26/i,
    },
    "dan-man-hinh-s26-series": {
      include: /^(?:dán|dan|miếng dán|mieng dan|kính|kinh).{0,56}(?:galaxy )?s26/i,
      exclude: /(?:camera|ống kính|ong kinh|lens)/i,
    },
    "quat-cam-tay-quat-mini": {
      include: /^(?:quạt cầm tay|quat cam tay|quạt mini|quat mini|quạt để bàn mini|quat de ban mini)(?:[\s-]|$)/i,
    },
    "dan-macbook-neo": {
      include: /^(?:bộ dán|bo dan|dán màn hình|dan man hinh|miếng dán|mieng dan).{0,56}macbook neo/i,
    },
    "gay-chup-anh": {
      include: /^(?:gậy chụp ảnh|gay chup anh|gậy selfie|gay selfie|selfie stick)(?:[\s-]|$)/i,
    },
    "kinh-thong-minh": {
      include: /^(?:kính thông minh|kinh thong minh|smart glasses)(?:[\s-]|$)/i,
    },
    "tay-cam-chup-anh": {
      include: /^(?:tay cầm (?:máy ảnh|may anh|chụp ảnh|chup anh)|camera grip|phone grip)(?:[\s-]|$)/i,
      exclude: /(?:gimbal|chống rung|chong rung)/i,
    },
    "ong-kinh-camera-dien-thoai": {
      include: /^(?:(?:ống kính|ong kinh|lens).{0,52}(?:điện thoại|dien thoai|iphone|samsung|oppo|xiaomi)|bộ lens|bo lens)(?:[\s-]|$)/i,
    },
  };
  const rule = topicRules[key];
  if (!rule) return null;

  const includeCondition = regexCondition(identityFields, rule.include);
  return rule.exclude
    ? { $and: [includeCondition, { $nor: [regexCondition(identityFields, rule.exclude)] }] }
    : includeCondition;
}

function buildNetworkTopicCondition(value = "") {
  const key = normalizeSearchKey(value).replace(/[^a-z0-9]+/g, "-");
  const identityFields = ["name", "slug", "sku", "trainingLabels.productName"];
  const topicRules = {
    "thiet-bi-phat-song-wifi": {
      include: /^(?:router|thiết bị phát sóng wifi|thiet bi phat song wifi|bộ phát wifi|bo phat wifi)(?:[\s-]|$)/i,
      exclude: /(?:di động|di dong|4g|5g|mifi)/i,
    },
    "bo-phat-wifi-di-dong": {
      include: /^(?:bộ phát wifi di động|bo phat wifi di dong|router wifi di động|router wifi di dong|mifi)(?:[\s-]|$)|^(?:bộ phát wifi|bo phat wifi).{0,24}(?:4g|5g|lte)/i,
    },
    "bo-kich-song-wifi": {
      include: /^(?:bộ kích sóng|bo kich song|thiết bị kích sóng|thiet bi kich song|wifi range extender|range extender|wifi repeater)(?:[\s-]|$)/i,
    },
    "hub-switch": {
      include: /^(?:hub-switch|switch|bộ chia mạng|bo chia mang)(?:[\s-]|$)/i,
    },
    "usb-wifi": {
      include: /^(?:usb|cổng otg|cong otg).{0,24}(?:wifi|wi-fi)(?:[\s-]|$)/i,
    },
    "card-mang": {
      include: /^(?:card mạng|card mang|network card|pcie.{0,18}(?:wifi|ethernet))(?:[\s-]|$)/i,
    },
  };
  const rule = topicRules[key];
  if (!rule) return null;

  const includeCondition = regexCondition(identityFields, rule.include);
  return rule.exclude
    ? { $and: [includeCondition, { $nor: [regexCondition(identityFields, rule.exclude)] }] }
    : includeCondition;
}

function buildPcTopicCondition(value = "") {
  const key = normalizeSearchKey(value).replace(/[^a-z0-9]+/g, "-");
  const fields = [
    "name",
    "slug",
    "sku",
    "categoryTrail.name",
    "categoryTrail.label",
    "trainingLabels.productName",
    "trainingLabels.deviceGroup",
  ];
  const rules = {
    "build-pc": /^(?:pc cps|pc gaming cps|pc đồ họa cps|pc do hoa cps|pc workstation)/i,
    "cau-hinh-san": /^(?:pc|máy tính để bàn|may tinh de ban|desktop)(?:[\s-]|$)/i,
    "all-in-one": /(?:^|[\s-])(?:all[\s-]*in[\s-]*one|aio|imac)(?:[\s-]|$)/i,
    "pc-bo": /^(?:pc|máy tính để bàn|may tinh de ban|desktop)(?:[\s-]|$)/i,
    gaming: /^(?:pc|máy tính để bàn|may tinh de ban).{0,48}(?:gaming|chơi game|choi game)|^pc gaming$/i,
    "do-hoa": /^(?:pc|máy tính để bàn|may tinh de ban).{0,48}(?:đồ họa|do hoa|workstation)|^máy tính đồ họa$/i,
    "van-phong": /^(?:pc|máy tính để bàn|may tinh de ban).{0,48}(?:văn phòng|van phong|office)|^máy tính văn phòng$/i,
  };
  const include = rules[key];
  if (!include) return null;

  const condition = regexCondition(fields, include);
  if (key === "all-in-one") return condition;

  return {
    $and: [
      condition,
      { name: { $not: /(?:all[\s-]*in[\s-]*one|\baio\b|\bimac\b|pc mini|mini pc)/i } },
      { slug: { $not: /(?:all[\s-]*in[\s-]*one|\baio\b|\bimac\b|pc-mini|mini-pc)/i } },
    ],
  };
}

function buildComputerComponentTopicCondition(value = "") {
  const key = normalizeSearchKey(value).replace(/[^a-z0-9]+/g, "-");
  const fields = [
    "name",
    "slug",
    "sku",
    "categoryTrail.name",
    "categoryTrail.label",
    "trainingLabels.productName",
    "trainingLabels.deviceGroup",
  ];
  const rules = {
    cpu: /^(?:cpu|bộ vi xử lý|bo vi xu ly|processor)(?:[\s-]|$)/i,
    main: /^(?:mainboard|main board|bo mạch chủ|bo mach chu|main)(?:[\s-]|$)/i,
    ram: /^(?:ram|bộ nhớ ram|bo nho ram)(?:[\s-]|$)/i,
    "o-cung": /^(?:ổ cứng|o cung|ssd|hdd|solid state drive)(?:[\s-]|$)/i,
    nguon: /^(?:nguồn máy tính|nguon may tinh|psu|power supply)(?:[\s-]|$)/i,
    vga: /^(?:vga|card màn hình|card man hinh|graphics card|gpu)(?:[\s-]|$)/i,
    "tan-nhiet": /^(?:tản nhiệt|tan nhiet|quạt tản nhiệt|quat tan nhiet|fan case|keo tản nhiệt|keo tan nhiet|cpu cooler)(?:[\s-]|$)/i,
    case: /^(?:case máy tính|case may tinh|vỏ case|vo case|thùng máy|thung may|computer case)(?:[\s-]|$)/i,
  };
  const include = rules[key];
  if (!include) return null;

  const includeCondition = regexCondition(fields, include);
  const excludes = {
    "o-cung": /^(?:hộp|hop|box|dock|case|khay|thay|sửa|sua)(?:[\s-]|$)/i,
    "tan-nhiet": /^(?:ốp|op|bao da|dán|dan|đế tản nhiệt laptop|de tan nhiet laptop)(?:[\s-]|$)/i,
  };
  const exclude = excludes[key];
  return exclude
    ? { $and: [includeCondition, { name: { $not: exclude } }, { slug: { $not: exclude } }] }
    : includeCondition;
}

function buildMonitorTopicCondition(value = "") {
  const key = normalizeSearchKey(value).replace(/[^a-z0-9]+/g, "-");
  const fields = [
    "name",
    "slug",
    "categoryTrail.name",
    "categoryTrail.label",
    "trainingLabels.productName",
    "trainingLabels.deviceGroup",
    "trainingLabels.labelPathText",
  ];
  const rules = {
    gaming: /^(?:màn hình|man hinh|monitor).{0,56}(?:gaming|chơi game|choi game)|^màn hình gaming$/i,
    "van-phong": /^(?:màn hình|man hinh|monitor).{0,56}(?:văn phòng|van phong|office)|^màn hình văn phòng$/i,
    "do-hoa": /^(?:màn hình|man hinh|monitor).{0,56}(?:đồ họa|do hoa|designer|creator)|^màn hình đồ họa$/i,
    "lap-trinh": /^(?:màn hình|man hinh|monitor).{0,56}(?:lập trình|lap trinh|coding|programming)|^màn hình lập trình$/i,
    "man-hinh-di-dong": /^(?:màn hình di động|man hinh di dong|portable monitor)(?:[\s-]|$)/i,
    "arm-man-hinh": /^(?:arm màn hình|arm man hinh|giá treo màn hình|gia treo man hinh|tay đỡ màn hình|tay do man hinh|monitor arm)(?:[\s-]|$)/i,
  };
  const include = rules[key];
  return include ? regexCondition(fields, include) : null;
}

function buildGamingGearTopicCondition(value = "") {
  const key = normalizeSearchKey(value).replace(/[^a-z0-9]+/g, "-");
  const fields = ["name", "slug", "sku", "categoryTrail.name", "categoryTrail.label", "trainingLabels.productName"];
  const rules = {
    playstation: /(?:^|[\s-])(?:playstation|ps[345])(?:[\s-]|$)/i,
    "rog-ally": /(?:^|[\s-])rog ally(?:[\s-]|$)/i,
    "ban-phim-gaming": /^(?:bàn phím|ban phim|keyboard).{0,56}(?:gaming|game|esport)/i,
    "chuot-choi-game": /^(?:chuột|chuot|mouse).{0,48}(?:gaming|chơi game|choi game|game)/i,
    "tai-nghe-gaming": /^(?:tai nghe|headset|headphone).{0,56}(?:gaming|game|esport)/i,
    "tay-cam-choi-game": /^(?:tay cầm|tay cam|gamepad|controller).{0,48}(?:gaming|chơi game|choi game|game)|^(?:gamepad|gaming controller)/i,
  };
  const include = rules[key];
  if (!include) return null;

  const topicAccessoryExclusion = key === "rog-ally"
    ? /^(?:hộp|hop|túi|tui|bao|ốp|op|phụ kiện|phu kien|dán|dan|kính|kinh)(?:[\s-]|$)/i
    : /^(?:bàn di chuột|ban di chuot|lót chuột|lot chuot|mouse ?pad|ốp|op|bao da)(?:[\s-]|$)/i;

  return {
    $and: [
      regexCondition(fields, include),
      { name: { $not: topicAccessoryExclusion } },
      { slug: { $not: /^(?:ban-di-chuot|lot-chuot|mouse-?pad|op-lung|bao-da)(?:-|$)/i } },
    ],
  };
}

function buildOfficeDeviceTopicCondition(value = "") {
  const key = normalizeSearchKey(value).replace(/[^a-z0-9]+/g, "-");
  const fields = [
    "name",
    "slug",
    "sku",
    "categoryTrail.name",
    "categoryTrail.label",
    "trainingLabels.productName",
    "trainingLabels.deviceGroup",
  ];
  const rules = {
    "may-in": /^(?:máy in|may in|printer)(?:[\s-]|$)/i,
    "phan-mem": /^(?:phần mềm|phan mem|microsoft (?:office|365|windows)|office (?:home|personal|professional)|windows 1[01]|antivirus)(?:[\s-]|$)/i,
    "bang-ve-dien-tu": /^(?:bảng vẽ điện tử|bang ve dien tu|bảng vẽ|bang ve|drawing tablet|pen tablet)(?:[\s-]|$)/i,
    "may-tinh-cam-tay": /^(?:máy tính cầm tay|may tinh cam tay|máy tính casio|may tinh casio|casio (?:fx|dc|gx)|calculator)(?:[\s-]|$)/i,
    "decor-ban-lam-viec": /^(?:decor bàn làm việc|decor ban lam viec|bảng treo đồ|bang treo do|đèn bàn|den ban|kệ bàn|ke ban|desk decor|desk organizer)(?:[\s-]|$)/i,
  };
  const include = rules[key];
  if (!include) return null;

  const includeCondition = regexCondition(fields, include);
  if (key !== "may-in") return includeCondition;

  return {
    $and: [
      includeCondition,
      { name: { $not: /^(?:mực|muc|toner|hộp mực|hop muc|cartridge|drum)(?:[\s-]|$)/i } },
      { slug: { $not: /^(?:muc|toner|hop-muc|cartridge|drum)(?:-|$)/i } },
    ],
  };
}

function buildListQuery(searchParams) {
  const query = {};
  const source = searchParams.get("source") || "all";
  const q = searchParams.get("q");
  const category = searchParams.get("category");
  const brand = searchParams.get("brand");
  const segment = searchParams.get("segment");
  const inStock = searchParams.get("inStock");
  const filter = searchParams.get("filter");
  const productType = searchParams.get("productType");
  const facet = searchParams.get("facet");
  const priceMin = toPositiveNumber(searchParams.get("priceMin") || searchParams.get("price_min") || searchParams.get("minPrice"));
  const priceMax = toPositiveNumber(searchParams.get("priceMax") || searchParams.get("price_max") || searchParams.get("maxPrice"));
  const ram = searchParams.get("ram");
  const storage = searchParams.get("storage");
  const screenSize = searchParams.get("screen_size") || searchParams.get("screenSize");
  const usage = searchParams.get("usage");
  const display = searchParams.get("display");
  const camera = searchParams.get("camera");
  const refreshRate = searchParams.get("refresh_rate") || searchParams.get("refreshRate");
  const special = searchParams.get("special");
  const selectedFacetValues = {
    ram,
    storage,
    "screen-size": screenSize,
    usage,
    display,
    camera,
    "refresh-rate": refreshRate,
    special,
  };
  const facetKey = normalizeSearchKey(facet).replace(/[^a-z0-9]+/g, "-");

  if (source !== "all") query.source = source;

  const categoryKey = normalizeSearchKey(category);

  if (q) {
    const applianceTopicCondition = categoryKey === "do gia dung"
      ? buildApplianceTopicCondition(q)
      : null;
    const accessoryTopicCondition = categoryKey === "phu kien"
      ? buildAccessoryTopicCondition(q)
      : null;
    const networkTopicCondition = categoryKey === "thiet bi mang"
      ? buildNetworkTopicCondition(q)
      : null;
    const pcTopicCondition = categoryKey === "pc"
      ? buildPcTopicCondition(q)
      : null;
    const componentTopicCondition = categoryKey === "linh kien may tinh"
      ? buildComputerComponentTopicCondition(q)
      : null;
    const monitorTopicCondition = categoryKey === "man hinh"
      ? buildMonitorTopicCondition(q)
      : null;
    const gamingGearTopicCondition = categoryKey === "gaming gear"
      ? buildGamingGearTopicCondition(q)
      : null;
    const officeDeviceTopicCondition = categoryKey === "thiet bi van phong"
      ? buildOfficeDeviceTopicCondition(q)
      : null;
    Object.assign(
      query,
      applianceTopicCondition
        || accessoryTopicCondition
        || networkTopicCondition
        || pcTopicCondition
        || componentTopicCondition
        || monitorTopicCondition
        || gamingGearTopicCondition
        || officeDeviceTopicCondition
        || buildProductSearchCondition(q)
    );
  }

  if (category) {
    const requestedCategories = category.split("|").map((item) => item.trim()).filter(Boolean);
    appendAndCondition(query, requestedCategories.length > 1
      ? { $or: requestedCategories.map((item) => buildCategoryCondition(item)) }
      : buildCategoryCondition(category));
  }
  if (brand && brand !== "all") {
    const categoriesWithReliableBrandInName = new Set([
      "man hinh",
      "tivi",
      "tu lanh",
      "may giat",
      "dieu hoa - may lanh",
    ]);
    const brandCondition = categoriesWithReliableBrandInName.has(categoryKey)
      ? regexCondition(
        ["name", "slug", "trainingLabels.productName", "rawProductJsonLd.name"],
        createBrandRegex(brand)
      )
      : buildBrandCondition(brand);
    appendAndCondition(query, brandCondition);
  }
  if (segment) appendAndCondition(query, buildSegmentCondition(segment));
  // `facet` identifies the filter group opened by the UI. Once an exact value
  // is selected (for example ram=8GB RAM), the indexed `facets.*` condition
  // below is sufficient. Applying the old broad text condition as well makes
  // gzip-backed details impossible to match because their full specs are not
  // duplicated on the MongoDB manifest.
  if (facet && !selectedFacetValues[facetKey]) {
    appendAndCondition(query, buildFacetCondition(facet));
  }
  if (filter) appendAndCondition(query, buildFilterCondition(filter));
  if (productType) appendAndCondition(query, buildProductTypeCondition(productType));
  if (ram) appendAndCondition(query, buildFeatureValueCondition("ram", ram));
  if (storage) appendAndCondition(query, buildFeatureValueCondition("storage", storage));
  if (screenSize) appendAndCondition(query, buildFeatureValueCondition("screen-size", screenSize));
  if (usage) appendAndCondition(query, buildFeatureValueCondition("usage", usage));
  if (display) appendAndCondition(query, buildFeatureValueCondition("display", display));
  if (camera) appendAndCondition(query, buildFeatureValueCondition("camera", camera));
  if (refreshRate) appendAndCondition(query, buildFeatureValueCondition("refresh-rate", refreshRate));
  if (special) appendAndCondition(query, buildFeatureValueCondition("special", special));
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
      { stock: { $gt: 0 } },
      { inventory: { $gt: 0 } },
      { statusLabel: { $regex: "C.n h.ng|Còn hàng|Con hang|InStock|Sẵn hàng", $options: "i" } },
      // Sản phẩm admin tự thêm thường chưa có availability/statusLabel.
      // Không loại các sản phẩm này khỏi danh mục chỉ vì thiếu cờ tồn kho.
      {
        $and: [
          { availability: { $exists: false } },
          { "availability.status": { $exists: false } },
          { stockStatus: { $exists: false } },
          { statusLabel: { $exists: false } },
        ],
      },
    ],
  };

  if (inStock) return inStockCondition;

  return {
    $or: [
      { "availability.status": { $ne: "InStock" } },
      { availability: { $ne: "InStock" } },
      { statusLabel: { $regex: "Li.n h.|H.t h.ng|OutOfStock|Hết hàng", $options: "i" } },
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

function buildSpecificationRowCondition(labelRegex, valueRegex) {
  return {
    $or: [
      {
        specifications: {
          $elemMatch: {
            rows: {
              $elemMatch: {
                label: labelRegex,
                value: valueRegex,
              },
            },
          },
        },
      },
      {
        "rawProductJsonLd.additionalProperty": {
          $elemMatch: {
            name: labelRegex,
            value: valueRegex,
          },
        },
      },
      {
        $and: [
          regexCondition([
            "specifications.rows.label",
            "rawProductJsonLd.additionalProperty.name",
          ], labelRegex),
          regexCondition([
            "specifications.rows.value",
            "rawProductJsonLd.additionalProperty.value",
          ], valueRegex),
        ],
      },
    ],
  };
}

function getFeatureLabelRegex(kind = "", normalizedValue = "") {
  if (kind === "ram") return /ram|bộ nhớ ram|bo nho ram|dung lượng ram|dung luong ram/i;
  if (kind === "storage") return /bộ nhớ trong|bo nho trong|dung lượng lưu trữ|dung luong luu tru|rom|storage|ổ cứng|o cung|ssd|hdd/i;
  if (kind === "screen-size") return /kích thước màn hình|kich thuoc man hinh|đường chéo màn hình|duong cheo man hinh|screen size|display size|display diagonal/i;
  if (kind === "display") return /công nghệ màn hình|cong nghe man hinh|loại màn hình|loai man hinh|tấm nền|tam nen|màn hình|man hinh|display/i;
  if (kind === "camera") return /camera|camera sau|camera trước|camera truoc|tính năng camera|tinh nang camera|quay video/i;
  if (kind === "refresh-rate") return /tần số quét|tan so quet|tốc độ làm mới|toc do lam moi|refresh|màn hình|man hinh|display|tính năng màn hình|tinh nang man hinh/i;
  if (kind === "usage") return /nhu cầu sử dụng|nhu cau su dung|đối tượng sử dụng|doi tuong su dung|usage/i;

  if (kind === "special") {
    if (normalizedValue.includes("nfc")) return /nfc|công nghệ nfc|cong nghe nfc|kết nối|ket noi/i;
    if (normalizedValue.includes("5g")) return /hỗ trợ mạng|ho tro mang|mạng|mang|5g|kết nối|ket noi/i;
    if (normalizedValue.includes("sac")) return /sạc|sac|pin|battery|charging/i;
    if (normalizedValue.includes("khang") || normalizedValue.includes("chong nuoc")) return /kháng nước|khang nuoc|chống nước|chong nuoc|chuẩn kháng|chuan khang|ip/i;
    if (normalizedValue.includes("wifi") || normalizedValue.includes("wi-fi")) return /wifi|wi-fi|kết nối|ket noi/i;
    if (normalizedValue.includes("bluetooth")) return /bluetooth|kết nối|ket noi/i;
    return /nfc|5g|sạc|sac|kháng nước|khang nuoc|wifi|wi-fi|bluetooth|magsafe|ai|tính năng|tinh nang|kết nối|ket noi/i;
  }

  return /thông số|thong so|tính năng|tinh nang/i;
}

function getFeatureValueRegex(kind = "", clean = "") {
  const normalized = normalizeSearchKey(clean);
  const compact = normalized.replace(/\s+/g, "");
  const escaped = escapeRegex(clean);
  const compactEscaped = escapeRegex(compact);

  if (kind === "ram") {
    const number = compact.match(/\d+/)?.[0];
    return number
      ? new RegExp(`\\b${escapeRegex(number)}\\s?gb\\s?(ram)?\\b|ram\\s?${escapeRegex(number)}\\s?gb`, "i")
      : new RegExp(escaped, "i");
  }

  if (kind === "storage") {
    const number = compact.match(/\d+/)?.[0];
    const unit = compact.includes("tb") ? "tb" : "gb";
    return number
      ? new RegExp(`\\b${escapeRegex(number)}\\s?${unit}\\b|${compactEscaped}`, "i")
      : new RegExp(`${escaped}|${compactEscaped}`, "i");
  }

  if (kind === "screen-size") {
    if (normalized.includes("duoi") && normalized.includes("6")) {
      return /\b([4-5](\.\d+)?)\s?(inch|inches|"|”|in)\b/i;
    }
    if (normalized.includes("tren") && normalized.includes("6.8")) {
      return /\b(6\.9|7(\.\d+)?|8(\.\d+)?|9(\.\d+)?|1[0-9](\.\d+)?|2[0-9](\.\d+)?|3[0-9](\.\d+)?)\s?(inch|inches|"|”|in)\b/i;
    }
    const number = compact.match(/\d+(?:\.\d+)?/)?.[0];
    return number
      ? new RegExp(`${escapeRegex(number)}\\s?(inch|inches|\"|”|in)`, "i")
      : new RegExp(escaped, "i");
  }

  if (kind === "refresh-rate") {
    const number = compact.match(/\d+/)?.[0];
    return number ? new RegExp(`\\b${escapeRegex(number)}\\s?hz\\b`, "i") : new RegExp(escaped, "i");
  }

  if (kind === "camera") {
    if (normalized.includes("ois") || normalized.includes("chong rung")) return /ois|chống rung|chong rung|quang học|quang hoc/i;
    if (normalized.includes("zoom")) return /zoom|telephoto|tele|tiềm vọng|tiem vong/i;
    if (normalized.includes("sieu rong") || normalized.includes("goc")) return /siêu rộng|sieu rong|ultra wide|góc rộng|goc rong/i;
    if (normalized.includes("4k")) return /4k|uhd/i;
    if (normalized.includes("ai")) return /ai|smart hdr|deep fusion|xử lý ảnh|xu ly anh/i;
    if (normalized.includes("chup dem")) return /chụp đêm|chup dem|night/i;
    return new RegExp(escaped, "i");
  }

  if (kind === "usage") {
    if (normalized.includes("dung luong lon")) return /dung lượng lớn|dung luong lon|large storage/i;
    if (normalized.includes("cau hinh cao")) return /cấu hình cao|cau hinh cao|high performance/i;
    if (normalized.includes("choi game") || normalized.includes("gaming")) return /gaming|chơi game|choi game/i;
    if (normalized.includes("chup anh")) return /chụp ảnh đẹp|chup anh dep|photography/i;
    if (normalized.includes("pin trau")) return /pin trâu|pin trau|long battery/i;
    if (normalized.includes("mong nhe")) return /mỏng nhẹ|mong nhe|thin and light/i;
    if (normalized.includes("nho gon")) return /nhỏ gọn|nho gon|compact/i;
    if (normalized.includes("van phong") || normalized.includes("hoc tap")) return /office|văn phòng|van phong|học tập|hoc tap/i;
    if (normalized.includes("do hoa") || normalized.includes("thiet ke") || normalized.includes("ky thuat")) return /đồ họa|do hoa|thiết kế|thiet ke|kỹ thuật|ky thuat/i;
    if (normalized.includes("livestream")) return /livestream|live stream/i;
    if (normalized.includes("sang tao")) return /sáng tạo|sang tao|creator/i;
    if (normalized.includes("giai tri")) return /giải trí|giai tri|entertainment/i;
    if (normalized.includes("tre em")) return /trẻ em|tre em|kids/i;
    if (normalized.includes("cao cap") || normalized.includes("sang trong")) return /cao cấp|cao cap|sang trọng|sang trong|premium/i;
    return new RegExp(escaped, "i");
  }

  if (kind === "special") {
    if (normalized.includes("nfc")) return /có|co|yes|nfc/i;
    if (normalized.includes("5g")) return /5g/i;
    if (normalized.includes("sac nhanh")) return /sạc nhanh|sac nhanh|fast charge|[0-9]{2,3}\s?w/i;
    if (normalized.includes("sac khong day")) return /sạc không dây|sac khong day|wireless|magsafe|qi/i;
    if (normalized.includes("ip68")) return /ip68|kháng nước|khang nuoc|chống nước|chong nuoc/i;
    if (normalized.includes("magsafe")) return /magsafe/i;
    if (normalized.includes("wifi") || normalized.includes("wi-fi")) return /wi-?fi\s?(6|7)|wifi\s?(6|7)/i;
    if (normalized.includes("bluetooth")) return /bluetooth\s?5(\.\d+)?/i;
    return new RegExp(escaped, "i");
  }

  return new RegExp(escaped, "i");
}

function getCleanFacetTag(value = "") {
  return normalizeSearchKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFacetNumber(value = "") {
  const match = normalizeSearchKey(value).replace(/,/g, ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function buildFacetFieldCondition(kind = "", value = "") {
  const clean = cleanLimitedText(value, 80);
  if (!clean) return {};

  const normalized = normalizeSearchKey(clean);
  const tagKey = getCleanFacetTag(clean);
  const number = parseFacetNumber(clean);

  if (kind === "ram" && number) {
    return { "facets.ramGb": number };
  }

  if (kind === "storage" && number) {
    const storageGb = /tb/i.test(clean) ? number * 1024 : number;
    return { "facets.storageGb": storageGb };
  }

  if (kind === "screen-size") {
    if (normalized.includes("tu 10") && normalized.includes("11")) {
      return { "facets.screenSizeInch": { $gte: 10, $lt: 12 } };
    }
    if (normalized.includes("7") && normalized.includes("8") && normalized.includes("-")) {
      return { "facets.screenSizeInch": { $gte: 7, $lt: 9 } };
    }
    if (normalized.includes("duoi") && number) {
      return { "facets.screenSizeInch": { $lt: number } };
    }
    if ((normalized.includes("tren") || normalized.includes("tro len")) && number) {
      return { "facets.screenSizeInch": normalized.includes("tren")
        ? { $gt: number }
        : { $gte: number } };
    }
    if (normalized.includes("khoang") && number) {
      if (number === 13) return { "facets.screenSizeInch": { $gte: 12.5, $lt: 13.75 } };
      if (number === 14) return { "facets.screenSizeInch": { $gte: 13.75, $lt: 15 } };
      return { "facets.screenSizeInch": { $gte: number - 0.6, $lte: number + 0.6 } };
    }
    if (number) {
      return { "facets.screenSizeInch": { $gte: number - 0.11, $lte: number + 0.11 } };
    }
  }

  if (kind === "refresh-rate" && number) {
    return { "facets.refreshRateHz": number };
  }

  const tagAliases = {
    display: {
      oled: "oled",
      amoled: "amoled",
      "super-amoled": "super-amoled",
      "ips-lcd": "ips",
      ips: "ips",
      lcd: "lcd",
      retina: "retina",
      "mini-led": "mini-led",
      qled: "qled",
      "man-hinh-cong": "curved",
      cong: "curved",
    },
    camera: {
      "chong-rung-ois": "ois",
      ois: "ois",
      "zoom-xa": "zoom",
      zoom: "zoom",
      "goc-sieu-rong": "ultrawide",
      "sieu-rong": "ultrawide",
      "quay-video-4k": "4k",
      "video-4k": "4k",
      "camera-ai": "ai-camera",
      "chup-dem": "night",
      "leica-zeiss-hasselblad": "leica-zeiss-hasselblad",
    },
    usage: {
      "dung-luong-lon": "large-storage",
      "cau-hinh-cao": "high-performance",
      "choi-game": "gaming",
      gaming: "gaming",
      "chup-anh-dep": "photography",
      "chup-anh": "photography",
      "pin-trau": "long-battery",
      livestream: "livestream",
      "nho-gon-de-cam-nam": "compact",
      "nho-gon": "compact",
      "mong-nhe": "lightweight",
      "hoc-tap-van-phong": "office-study",
      "van-phong": "office-study",
      "do-hoa-thiet-ke": "design",
      "do-hoa-ky-thuat": "design",
      "do-hoa-sang-tao": "design",
      "thiet-ke": "design",
      "livestream-sang-tao-noi-dung": "creator",
      "laptop-sang-tao-noi-dung": "creator",
      "cao-cap-sang-trong": "premium",
      "giai-tri": "entertainment",
      "cho-tre-em": "kids",
    },
    special: {
      "5g": "5g",
      nfc: "nfc",
      "sac-nhanh": "fast-charge",
      "sac-khong-day": "wireless-charge",
      "khang-nuoc-ip68": "ip68",
      ip68: "ip68",
      "ai-tich-hop": "ai",
      ai: "ai",
      magsafe: "magsafe",
    },
  };

  if (["display", "camera", "usage", "special"].includes(kind)) {
    if (kind === "special" && (tagKey.includes("wi-fi") || tagKey.includes("wifi"))) {
      return { "facets.special": { $in: ["wifi6", "wifi7"] } };
    }
    if (kind === "special" && tagKey.includes("bluetooth")) {
      return { "facets.special": "bluetooth5" };
    }
    const tag = tagAliases[kind]?.[tagKey] || tagKey;
    return { [`facets.${kind}`]: tag };
  }

  return {};
}

function buildFeatureValueCondition(kind = "", value = "") {
  const clean = cleanLimitedText(value, 80);
  if (!clean) return {};

  const normalized = normalizeSearchKey(clean);
  const labelRegex = getFeatureLabelRegex(kind, normalized);
  const valueRegex = getFeatureValueRegex(kind, clean);
  const facetCondition = buildFacetFieldCondition(kind, clean);
  const specCondition = buildSpecificationRowCondition(labelRegex, valueRegex);
  const facetPath = {
    ram: "facets.ramGb",
    storage: "facets.storageGb",
    "screen-size": "facets.screenSizeInch",
    usage: "facets.usage",
    display: "facets.display",
    camera: "facets.camera",
    "refresh-rate": "facets.refreshRateHz",
    special: "facets.special",
  }[kind];

  return Object.keys(facetCondition).length
    ? {
      $or: [
        facetCondition,
        // Chỉ tìm trong thông số thô khi document chưa được lập facet.
        // Nếu facet đã tồn tại nhưng không khớp, không được tìm rộng nữa.
        { $and: [{ [facetPath]: { $exists: false } }, specCondition] },
      ],
    }
    : specCondition;
}

function buildFilterCondition(filter = "") {
  const key = normalizeSearchKey(filter).replace(/[^a-z0-9]+/g, "-");

  if (key === "hot-deal" || key === "discount" || key === "khuyen-mai-hot") {
    return {
      $and: [
        { discount: { $gte: 1, $lte: 90 } },
        { currentPrice: { $gt: 0 } },
        { originalPrice: { $gt: 0 } },
        { $expr: { $gt: ["$originalPrice", "$currentPrice"] } },
      ],
    };
  }

  return {};
}

function buildProductTypeCondition(productType = "") {
  const key = normalizeSearchKey(productType).replace(/[^a-z0-9]+/g, "-");
  const identityFields = [
    "name",
    "slug",
    "sku",
  ];
  const categoryFields = [
    "category",
    "categories",
    "categoryTrail.name",
    "categoryTrail.label",
    "categoryTrail.href",
    "trainingLabels.categoryLevel1",
    "trainingLabels.categoryLevel2",
    "trainingLabels.deviceGroup",
  ];
  const fields = [...identityFields, ...categoryFields];
  const rules = {
    "cu-cap": {
      include: /củ sạc|cu sac|cáp sạc|cap sac|adapter|cáp type[ -]?c|cap type[ -]?c|type[ -]?c.{0,18}(cáp|cap|lightning)|lightning.{0,18}(cáp|cap)/i,
      exclude: /dự phòng|du phong|power ?bank|flash drive|usb sandisk|ổ cứng|o cung|thẻ nhớ|the nho|microphone|mic thu âm|mic thu am/i,
    },
    "chuot-ban-phim": {
      // Classify the item itself. Tablets whose title merely ends in
      // "kèm bàn phím" must not become keyboard products.
      identityInclude: /^(?:(?:chuột|chuot|mouse|bàn phím|ban[- ]phim|keyboard)(?:[\s-]|$)|(?:combo|bộ|bo)[\s-]+(?:chuột|chuot|mouse|bàn phím|ban[- ]phim|keyboard))/i,
      requireIdentity: true,
      exclude: /^(?:máy tính bảng|may[- ]tinh[- ]bang|tablet|ipad|điện thoại|dien[- ]thoai|laptop)(?:[\s-]|$)/i,
    },
    "sac-du-phong": {
      include: /sạc dự phòng|sac du phong|pin dự phòng|pin du phong|power ?bank/i,
      exclude: /loa bluetooth|speaker|tích hợp pin dự phòng|tich hop pin du phong/i,
    },
    camera: {
      // Do not use a bare "camera" search over every field. Accessory names
      // such as "ốp viền camera" and "thẻ nhớ chuyên camera" would match it.
      identityInclude: /(?:^|[\s-])(camera|webcam|gimbal|flycam|dji osmo|máy quay|may quay|insta360)(?:$|[\s-])/i,
      categoryInclude: /^(?:camera|camera an ninh|camera hành trình|camera hanh trinh|webcam|gimbal|flycam|máy quay|may quay)$/i,
      requireIdentity: true,
      exclude: /ốp lưng|op lung|bao da|\bcase\b|housing|vỏ bảo vệ|vo bao ve|(?:^|[- ])dán(?:$|[- ])|(?:^|[- ])dan(?:$|[- ])|miếng dán|mieng dan|kính cường lực|kinh cuong luc|bảo vệ camera|bao ve camera|viền camera|vien camera|camera control|sticker|thẻ nhớ|the nho|memory card|lens dành|lens danh|ống kính|ong kinh|thay camera|sửa camera|sua camera|camera sau iphone|camera trước iphone|camera truoc iphone/i,
    },
    "phu-kien-apple": {
      // MagSafe alone is not enough: many Samsung/Android cases also carry it.
      identityInclude: /^(?:airtag|apple pencil|magic keyboard|magic mouse|phụ kiện apple|phu[- ]kien[- ]apple|phụ kiện iphone|phu[- ]kien[- ]iphone|phụ kiện ipad|phu[- ]kien[- ]ipad|(?:cáp|cap|sạc|sac|adapter|ốp|op|bao da|dán|dan|kính|kinh|hub|dock|bàn phím|ban[- ]phim|chuột|chuot).{0,64}(?:apple|iphone|ipad|macbook))(?=[\s-]|$)/i,
      requireIdentity: true,
      exclude: /^(?:airpods|tai nghe|apple watch|iphone|ipad|macbook|apple\s*care\+?|applecare\+?)(?:[\s-]|$)/i,
    },
    "phu-kien-tien-ich": {
      // Use lamp phrases instead of a bare "den" token; product slugs cannot
      // distinguish the colour "đen" from the noun "đèn" after normalization.
      include: /\bquạt\b|\bquat\b|đèn (led|bàn|ngủ|pin|học)|den (led|ban|ngu|pin|hoc)|giá đỡ|gia do|gậy selfie|gay selfie|\bhub\b|thiết bị mạng|thiet bi mang|kích sóng|kich song|bộ phát wifi|bo phat wifi|router|tripod|bút cảm ứng|but cam ung|tay cầm|tay cam|bộ chuyển đổi|bo chuyen doi/i,
      exclude: /dán màn hình|dan man hinh|miếng dán|mieng dan|kính cường lực|kinh cuong luc|ốp lưng|op lung|bao da/i,
    },
    "op-lung": {
      include: /ốp lưng|op lung|bao da/i,
      exclude: /dán màn hình|dan man hinh|miếng dán|mieng dan|kính cường lực|kinh cuong luc|screen protector/i,
    },
  };
  const rule = rules[key];
  if (!rule || (!rule.include && !rule.identityInclude && !rule.categoryInclude)) return {};

  const includeConditions = [];
  if (rule.include) includeConditions.push(regexCondition(fields, rule.include));
  if (rule.identityInclude) includeConditions.push(regexCondition(identityFields, rule.identityInclude));
  if (rule.categoryInclude && !rule.requireIdentity) {
    includeConditions.push(regexCondition(categoryFields, rule.categoryInclude));
  }

  const conditions = [
    includeConditions.length === 1 ? includeConditions[0] : { $or: includeConditions },
  ];
  if (rule.exclude) {
    // Reject a document when any identifying/category field carries an
    // accessory exclusion. Checking name/slug only was not sufficient for
    // malformed crawled category trails.
    conditions.push({ $nor: [regexCondition(fields, rule.exclude)] });
  }

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
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
      return { discount: -1, webFreshnessScore: -1, updatedAt: -1, scrapedAt: -1, name: 1 };
    case "hot_trend":
    case "popular":
      return { ratingCount: -1, rating: -1, webFreshnessScore: -1, updatedAt: -1, name: 1 };
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

function isPriceSort(sortKey = "") {
  const key = String(sortKey || "").trim().toLowerCase().replace(/-/g, "_");
  return key === "price_asc" || key === "price_desc";
}

function buildEffectivePriceExpression() {
  const toNumber = (field) => ({
    $convert: {
      input: field,
      to: "double",
      onError: 0,
      onNull: 0,
    },
  });

  return {
    $let: {
      vars: {
        effectivePrice: toNumber("$effectivePrice"),
        currentPrice: toNumber("$currentPrice"),
        price: toNumber("$price"),
        originalPrice: toNumber("$originalPrice"),
      },
      in: {
        $cond: [
          { $gt: ["$$effectivePrice", 0] },
          "$$effectivePrice",
          {
            $cond: [
              { $gt: ["$$currentPrice", 0] },
              "$$currentPrice",
              {
                $cond: [
                  { $gt: ["$$price", 0] },
                  "$$price",
                  "$$originalPrice",
                ],
              },
            ],
          },
        ],
      },
    },
  };
}

function buildAggregateProjection(projection) {
  if (!projection) {
    return {
      __effectivePrice: 0,
      __missingPrice: 0,
    };
  }

  const aggregateProjection = { ...projection };
  if (projection.images?.$slice) {
    aggregateProjection.images = {
      $slice: [
        { $cond: [{ $isArray: "$images" }, "$images", []] },
        Number(projection.images.$slice),
      ],
    };
  }
  return aggregateProjection;
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
  const exactSlugs = uniqueStrings([clean, ...aliases]);
  const numericIdentifier = /^\d+$/.test(clean) ? Number(clean) : null;
  const exactProductIds = [
    clean,
    ...(Number.isSafeInteger(numericIdentifier) ? [numericIdentifier] : []),
  ];
  const exactUrls = uniqueStrings([
    /^https?:\/\//i.test(String(identifier)) ? String(identifier) : "",
    ...exactSlugs.map((slug) => `https://cellphones.com.vn/${slug}.html`),
  ]);
  const exactLookup = {
    $or: [
      ...(ObjectId.isValid(clean) ? [{ _id: new ObjectId(clean) }] : []),
      { slug: { $in: exactSlugs } },
      { sku: { $in: exactSlugs } },
      { productId: { $in: exactProductIds } },
      { id: { $in: exactProductIds } },
      { "general.productId": { $in: exactProductIds } },
      { "general.product_id": { $in: exactProductIds } },
      { "variants.productId": { $in: exactProductIds } },
      { "colors.productId": { $in: exactProductIds } },
      { lookupKeys: { $in: uniqueStrings([
        ...exactSlugs,
        ...exactSlugs.map((value) => value.toLowerCase()),
        ...exactProductIds.map((value) => `id:${value}`),
        ...exactProductIds.map((value) => `productid:${value}`),
        ...exactUrls,
        ...exactUrls.map((value) => value.toLowerCase()),
      ]) } },
    ],
  };
  const exactProduct = await findBestProductForLookup(products, exactLookup, clean, aliases, 60);
  if (exactProduct) return exactProduct;

  if (exactUrls.length) {
    const productByUrl = await findBestProductForLookup(products, {
      $or: [
        { url: { $in: exactUrls } },
        { inputUrl: { $in: exactUrls } },
        { sourceUrl: { $in: exactUrls } },
        { sourceUrls: { $in: exactUrls } },
      ],
    }, clean, aliases, 30);
    if (productByUrl) return productByUrl;
  }

  const fuzzyAliases = exactSlugs.length ? exactSlugs : [clean];
  const fuzzyLookup = {
    $or: fuzzyAliases.flatMap((alias) => {
      const aliasEscaped = escapeRegex(alias);
      return [
        { slug: { $regex: `^${aliasEscaped}(-|$)`, $options: "i" } },
        { sku: { $regex: `^${aliasEscaped}(-|$)`, $options: "i" } },
        { url: { $regex: `/${aliasEscaped}(-[^/]+)?\\.html$`, $options: "i" } },
        { sourceUrls: { $elemMatch: { $regex: `/${aliasEscaped}(-[^/]+)?\\.html$`, $options: "i" } } },
      ];
    }),
  };

  return findBestProductForLookup(products, fuzzyLookup, clean, aliases, 80);
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
  const exactLookup = {
    $or: [
      ...(ObjectId.isValid(directSlug) ? [{ _id: new ObjectId(directSlug) }] : []),
      { slug: { $in: exactSlugs } },
      { sku: { $in: exactSlugs } },
      { lookupKeys: { $in: uniqueStrings([
        ...exactSlugs,
        ...exactSlugs.map((value) => value.toLowerCase()),
        ...exactUrls,
        ...exactUrls.map((value) => value.toLowerCase()),
      ]) } },
    ],
  };
  const exactDetail = await findOneBestExactDetail(
    productDetails,
    exactLookup,
    directSlug,
    canonicalSlugs
  );
  if (exactDetail) return exactDetail;

  if (exactUrls.length) {
    const detailByUrl = await findOneBestExactDetail(
      productDetails,
      {
        $or: [
          { url: { $in: exactUrls } },
          { inputUrl: { $in: exactUrls } },
          { sourceUrl: { $in: exactUrls } },
          { sourceUrls: { $in: exactUrls } },
        ],
      },
      directSlug,
      canonicalSlugs
    );
    if (detailByUrl) return detailByUrl;
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
    "do gia dung": ["Đồ gia dụng", "Nhà thông minh", "Apple TV"],
    pc: ["PC", "Máy tính để bàn"],
  };

  if (key === "hang cu") {
    return regexCondition([
      "name",
      "slug",
      "category",
      "categories",
      "categoryTrail.name",
      "categoryTrail.label",
      "trainingLabels.categoryLevel1",
      "trainingLabels.categoryLevel2",
      "trainingLabels.deviceGroup",
      "trainingLabels.productName",
    ], /hàng cũ|hang cu|cũ đẹp|cu dep|cũ trầy xước|cu tray xuoc|like new|like-new|đã kích hoạt|da kich hoat|trưng bày|trung bay|qua sử dụng|qua su dung|refurbished/i);
  }

  if (key === "phu kien") {
    return regexCondition([
      "name",
      "slug",
      "category",
      "categories",
      "categoryTrail.name",
      "categoryTrail.label",
      "trainingLabels.categoryLevel1",
      "trainingLabels.categoryLevel2",
      "trainingLabels.deviceGroup",
      "trainingLabels.productName",
    ], /phụ kiện|phu kien|ốp lưng|op lung|bao da|dán màn hình|dan man hinh|kính cường lực|kinh cuong luc|cáp|cap|sạc|sac|adapter|pin dự phòng|pin du phong|power ?bank|thẻ nhớ|the nho|memory card|micro ?sd|usb|ổ cứng|o cung|ssd|hdd|hub|dock|chuột|chuot|mouse|bàn phím|ban phim|keyboard|balo|túi chống sốc|tui chong soc|webcam|router|wi-?fi|card mạng|card mang|sim(?: 4g| 5g)?|gimbal|tay cầm|tay cam|dây đeo|day deo|bút cảm ứng|but cam ung|playstation|rog ally|quạt mini|quat mini|kính thông minh|kinh thong minh/i);
  }

  if (key === "gaming gear") {
    const gamingIdentityFields = [
      "name",
      "slug",
      "sku",
      "category",
      "categories",
      "categoryTrail.name",
      "categoryTrail.label",
      "trainingLabels.productName",
      "trainingLabels.deviceGroup",
    ];
    return {
      $and: [
        regexCondition(gamingIdentityFields, /(?:^|[\s-])(?:playstation|ps[345]|rog ally)(?:[\s-]|$)|^(?:bàn phím|ban phim|keyboard|chuột|chuot|mouse|tai nghe|headset|headphone|tay cầm|tay cam|gamepad|controller).{0,56}(?:gaming|chơi game|choi game|game|esport)/i),
        { name: { $not: /^(?:màn hình|man hinh|laptop|điện thoại|dien thoai|bàn di chuột|ban di chuot|lót chuột|lot chuot|mouse ?pad|ốp|op|bao da)(?:[\s-]|$)/i } },
        { slug: { $not: /^(?:man-hinh|laptop|dien-thoai|ban-di-chuot|lot-chuot|mouse-?pad|op-lung|bao-da)(?:-|$)/i } },
      ],
    };
  }

  if (key === "thiet bi van phong") {
    return regexCondition([
      "name",
      "slug",
      "sku",
      "category",
      "categories",
      "categoryTrail.name",
      "categoryTrail.label",
      "trainingLabels.productName",
      "trainingLabels.deviceGroup",
    ], /^(?:máy in|may in|printer|phần mềm|phan mem|microsoft (?:office|365|windows)|office (?:home|personal|professional)|windows 1[01]|antivirus|bảng vẽ điện tử|bang ve dien tu|bảng vẽ|bang ve|drawing tablet|pen tablet|máy tính cầm tay|may tinh cam tay|máy tính casio|may tinh casio|casio (?:fx|dc|gx)|calculator|decor bàn làm việc|decor ban lam viec|bảng treo đồ|bang treo do|đèn bàn|den ban|kệ bàn|ke ban|desk decor|desk organizer)(?:[\s-]|$)/i);
  }

  const exactOnlyCategories = new Set([
    "dien thoai",
    "may tinh bang",
    "laptop",
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

  const categoryCondition = {
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

  if (key === "do gia dung") {
    const applianceIdentity = /^(?:máy|may|quạt|quat|robot|nồi|noi|bếp|bep|ấm|am|bàn ủi|ban ui|bàn là|ban la|bàn chải|ban chai|lò|lo|tủ|tu|cân|can|tông đơ|tong do|bình thủy|binh thuy|chảo điện|chao dien|đầu thu|dau thu)(?:[\s-]|$)|(?:tv box|mi box|playbox|tv stick|apple tv)/i;
    const applianceAccessoryIdentity = /^(?:lõi lọc|loi loc|lưỡi cạo|luoi cao|đầu cạo|dau cao|đầu bàn chải|dau ban chai|bộ đổi nguồn|bo doi nguon|phụ kiện|phu kien|túi đựng|tui dung|dung dịch|dung dich|chổi chính|choi chinh|chổi cạnh|choi canh|màng lọc|mang loc|điều khiển|dieu khien|remote|filter|adapter)(?:[\s-]|$)/i;
    return {
      $and: [
        categoryCondition,
        regexCondition(["name", "slug", "sku"], applianceIdentity),
        { name: { $not: applianceAccessoryIdentity } },
        { slug: { $not: applianceAccessoryIdentity } },
      ],
    };
  }

  if (key === "laptop") {
    const nonLaptopProduct = /màn hình|man hinh|\bmonitor\b|studio display|display xdr|máy tính để bàn|may tinh de ban|\bdesktop\b|\bimac\b|mac mini/i;
    return {
      $and: [
        categoryCondition,
        { name: { $not: nonLaptopProduct } },
        { slug: { $not: nonLaptopProduct } },
      ],
    };
  }

  if (key === "tai nghe") {
    // Một số tài liệu crawl của loa/micro có categoryTrail "Tai nghe mới".
    // Xác nhận thêm bằng tên định danh sản phẩm để không lẫn các nhóm đó.
    const headphoneIdentity = /tai nghe|headphone|headset|earphone|earbud|airpods|galaxy buds|redmi buds|realme buds|oneplus buds|oppo buds|xiaomi buds|freebuds|soundpeats|openfit|openswim|openrun|quietcomfort|wf-\d|wh-\d|inzone/i;
    const clearlyNotHeadphone = /^(?:loa|speaker|soundbar|microphone|micro|mic|hộp sạc|hop sac|ốp|op lung|bao da|phụ kiện|phu kien)(?:[\s-]|$)/i;
    return {
      $and: [
        categoryCondition,
        regexCondition([
          "name",
          "slug",
          "sku",
          "trainingLabels.productName",
          "trainingLabels.deviceGroup",
        ], headphoneIdentity),
        { name: { $not: clearlyNotHeadphone } },
        { slug: { $not: clearlyNotHeadphone } },
      ],
    };
  }

  if (key === "dong ho thong minh") {
    const watchIdentity = /đồng hồ|dong ho|smartwatch|\bwatch\b|vòng đeo tay|vong deo tay|vòng tay thông minh|vong tay thong minh|smart ?band|\bband\b|galaxy fit|fitbit/i;
    const watchAccessoryIdentity = /^(?:dây|day|đai|dai|cảm biến|cam bien|sạc|sac|cáp|cap|ốp|op|bao|bộ\s+\d+\s+dây|bo\s+\d+\s+day)(?:[\s-]|$)/i;
    const usedProductCategory = /^hàng cũ$/i;
    return {
      $and: [
        categoryCondition,
        regexCondition([
          "name",
          "slug",
          "sku",
          "trainingLabels.productName",
          "trainingLabels.deviceLine",
          "trainingLabels.deviceGroup",
        ], watchIdentity),
        { name: { $not: watchAccessoryIdentity } },
        { slug: { $not: watchAccessoryIdentity } },
        { category: { $not: usedProductCategory } },
      ],
    };
  }

  return categoryCondition;
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
  const key = String(brand || "").trim().toLowerCase();
  const regex = createBrandRegex(brand);
  const explicitBrandFields = [
    "brand",
    "brandKey",
    "trainingLabels.brand",
    "trainingLabels.deviceBrand",
    "rawProductJsonLd.brand.name",
  ];

  // AQUA vừa là thương hiệu vừa xuất hiện trong tên dòng sản phẩm của Dreame
  // và Philips. Với thương hiệu này chỉ tin các trường brand đã chuẩn hóa để
  // không đưa Dreame Aqua/Philips SpeedPro Aqua vào trang hãng AQUA.
  if (key === "aqua") {
    return regexCondition(explicitBrandFields, /^aqua$/i);
  }

  const condition = regexCondition([
    ...explicitBrandFields,
    "name",
    "slug",
  ], regex);

  // Một số bản crawl cũ gán nhầm Vivo Watch vào brand OPPO. Giữ nhóm liên
  // quan Realme/OnePlus theo alias hiện có, nhưng không để Vivo lọt vào trang
  // thương hiệu OPPO.
  if (key === "oppo") {
    return {
      $and: [
        condition,
        { name: { $not: /\bvivo\b/i } },
        { slug: { $not: /\bvivo\b/i } },
      ],
    };
  }

  return condition;
}

function buildSegmentCondition(segment = "") {
  const key = String(segment || "").trim().toLowerCase();

  if (key === "pin" || key === "battery") {
    return { "facets.batteryCapacityMah": { $gte: LONG_BATTERY_PHONE_MIN_MAH } };
  }

  if (key === "monitor-pc") {
    return {
      $and: [
        {
          $or: [
            buildSegmentCondition("monitor"),
            buildSegmentCondition("pc-gaming"),
          ],
        },
        {
          $nor: [
            regexCondition(
              ["name", "slug", "category", "categories", "categoryTrail.name", "categoryTrail.label"],
              /hàng cũ|hang cu|cũ đẹp|cu dep|cũ trầy xước|cu tray xuoc|like new|like-new|đã kích hoạt|da kich hoat|trưng bày|trung bay|qua sử dụng|qua su dung|refurbished/i
            ),
          ],
        },
      ],
    };
  }

  const fields = [
    "name",
    "slug",
    "category",
    "categories",
    "categoryTrail.name",
    "categoryTrail.label",
    "trainingLabels.categoryLevel1",
    "trainingLabels.categoryLevel2",
    "trainingLabels.deviceGroup",
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
    const pcIdentityFields = [
      "name",
      "slug",
      "sku",
      "trainingLabels.productName",
      "rawProductJsonLd.name",
    ];
    return {
      $and: [
        // Do not trust inherited category trails here. Several speakers and
        // coolers were crawled below a PC landing page and therefore carried
        // the word "PC" in metadata even though the item was not a computer.
        regexCondition(pcIdentityFields, /^(?:pc(?:[\s-]|$)|pc gaming|pc cps|pc mini|mini pc|máy tính để bàn|may[- ]tinh[- ]de[- ]ban|máy tính aio|may[- ]tinh[- ]aio|desktop|all[- ]in[- ]one)/i),
        {
          $nor: [
            { categories: /Laptop/i },
            { name: /laptop/i },
            { slug: /laptop/i },
            regexCondition(pcIdentityFields, /^(?:loa|speaker|soundbar|màn hình|man[- ]hinh|monitor|quạt|quat|tản nhiệt|tan[- ]nhiet|ổ cứng|o[- ]cung|ssd|usb|linh kiện|linh[- ]kien|case máy tính|case[- ]may[- ]tinh)(?:[\s-]|$)/i),
          ],
        },
      ],
    };
  }

  const productTypeSegmentAliases = {
    "apple-accessories": "phu-kien-apple",
    "cables-chargers": "cu-cap",
    "power-banks": "sac-du-phong",
    cases: "op-lung",
    "mouse-keyboard": "chuot-ban-phim",
    camera: "camera",
  };
  if (productTypeSegmentAliases[key]) {
    return buildProductTypeCondition(productTypeSegmentAliases[key]);
  }

  // Segment filters must classify the product itself, not words buried in a
  // long description. The previous full-text rules made a MagSafe Samsung
  // case look like an Apple accessory and made DJI action cameras look like
  // gimbals/flycams.
  const accessoryIdentityFields = ["name", "slug", "sku"];
  const accessoryCategoryFields = [
    "category",
    "categories",
    "categoryTrail.name",
    "categoryTrail.label",
    "trainingLabels.categoryLevel1",
    "trainingLabels.categoryLevel2",
    "trainingLabels.deviceGroup",
  ];
  const accessorySegmentRules = {
    "screen-protectors": {
      identityInclude: /dán màn hình|dan man hinh|kính cường lực|kinh cuong luc|miếng dán|mieng dan|screen protector/i,
      categoryInclude: /^(?:dán màn hình|dan man hinh|kính cường lực|kinh cuong luc)$/i,
    },
    "memory-usb": {
      // A bare "USB" token also matches chargers, cables, laptops and
      // headphones. Require a storage product at the start of its identity,
      // or an exact storage category produced by the crawler.
      identityInclude: /^(?:thẻ nhớ|the[- ]nho|memory card|micro[- ]?sd|sdxc|sdhc|cfexpress|flash drive|usb (?:sandisk|kingston|transcend|lexar|pny|samsung|teamgroup)|ổ cứng di động|o[- ]cung[- ]di[- ]dong|(?:ssd|hdd) (?:di động|portable))(?=[\s-]|$)/i,
      categoryInclude: /^(?:thẻ nhớ(?:, usb)?|the nho(?:, usb)?|usb)$/i,
      exclude: /^(?:sạc|sac|củ sạc|cu[- ]sac|cáp|cap|hub|dock|bộ chuyển|bo[- ]chuyen|wifi|wi-fi|bluetooth|laptop|tai nghe|headphone|thay ổ cứng|thay[- ]o[- ]cung|nâng cấp|nang[- ]cap|hộp|hop|box|case|khay|enclosure)(?:[\s-]|$)|(?:usb wifi|usb bluetooth|usb type-c to|usb-c to)/i,
    },
    "gaming-gear": {
      identityInclude: /^(?:(?:gaming gear|playstation|ps[45]|xbox|nintendo|console|tay cầm|tay[- ]cam|controller|gamepad)(?:[\s-]|$)|(?:bàn phím|ban[- ]phim|keyboard|chuột|chuot|mouse|tai nghe|headset).{0,48}(?:gaming|game|esport|playstation|xbox))/i,
      categoryInclude: /^(?:gaming gear|playstation|tay cầm chơi game|tay cam choi game)$/i,
      requireIdentity: true,
      exclude: /^(?:máy tính bảng|may[- ]tinh[- ]bang|tablet|ipad|laptop|màn hình|man[- ]hinh|monitor)(?:[\s-]|$)/i,
    },
    sim: {
      identityInclude: /^(?:(?:sim|esim)(?:[\s-]|$)|gói sim|goi[- ]sim|thẻ sim|the[- ]sim)/i,
      categoryInclude: /^(?:sim|sim 4g|sim 5g)$/i,
      requireIdentity: true,
      exclude: /^(?:iphone|điện thoại|dien[- ]thoai|smartphone|camera|máy tính bảng|may[- ]tinh[- ]bang|tablet)(?:[\s-]|$)/i,
    },
    network: {
      identityInclude: /^(?:router|modem|mesh wifi|mesh wi-fi|bộ phát wifi|bo[- ]phat[- ]wifi|bộ phát sóng|bo[- ]phat[- ]song|bộ kích sóng|bo[- ]kich[- ]song|kích sóng|kich[- ]song|repeater|access point|usb wifi|card mạng|card[- ]mang|thiết bị mạng|thiet[- ]bi[- ]mang)(?:[\s-]|$)/i,
      categoryInclude: /^(?:thiết bị mạng|thiet bi mang|router|bộ phát wifi|bo phat wifi)$/i,
      requireIdentity: true,
      exclude: /^(?:ipad|máy tính bảng|may[- ]tinh[- ]bang|tablet|laptop|điện thoại|dien[- ]thoai|camera)(?:[\s-]|$)/i,
    },
    gimbal: {
      identityInclude: /(?:^|[\s-])gimbal(?:$|[\s-])|tay cầm chống rung|tay cam chong rung|dji (?:om|osmo mobile)(?:$|[\s-])|stabilizer/i,
      categoryInclude: /^(?:gimbal|tay cầm chống rung|tay cam chong rung)$/i,
      exclude: /camera hành động|camera hanh dong|action|osmo pocket|osmo 360|osmo nano/i,
    },
    flycam: {
      identityInclude: /(?:^|[\s-])(?:flycam|drone)(?:$|[\s-])|dji (?:mini|air|mavic|avata|neo)(?:$|[\s-])/i,
      categoryInclude: /^(?:flycam|drone)$/i,
      requireIdentity: true,
      exclude: /camera hành động|camera hanh dong|action|osmo|gimbal|goggles|intelligent flight battery|pin flycam|cánh quạt|canh quat|propeller|charging hub|hub sạc|hub sac|remote controller|tay điều khiển|tay dieu khien|phụ kiện|phu kien|microphone|micro không dây|micro khong day|\bmic\b/i,
    },
    cameras: {
      identityInclude: /^(?:máy ảnh|may[- ]anh|camera (?:sony|canon|nikon|fujifilm|panasonic|leica))(?=[\s-]|$)/i,
      requireIdentity: true,
      exclude: /máy in ảnh|may in anh|phim|phụ kiện|phu kien|lens|ống kính|ong kinh|dây đeo|day[- ]deo|strap|thay camera|sửa camera|sua camera/i,
    },
    bags: {
      identityInclude: /(?:^|[\s-])(?:balo|ba lô|túi xách|tui xach|túi chống sốc|tui chong soc|backpack)(?:$|[\s-])/i,
      categoryInclude: /^(?:balo|túi xách|tui xach|túi chống sốc|tui chong soc)$/i,
    },
    hubs: {
      identityInclude: /(?:^|[\s-])(?:hub|dock|dongle)(?:$|[\s-])|hub chuyển đổi|hub chuyen doi|cổng chuyển|cong chuyen/i,
      categoryInclude: /^(?:hub|hub chuyển đổi|hub chuyen doi)$/i,
    },
    "phone-accessories": {
      identityInclude: /phụ kiện điện thoại|phu kien dien thoai|ốp lưng|op lung|dán màn hình|dan man hinh|cáp|cap|sạc|sac|tai nghe|magsafe/i,
    },
    "laptop-accessories": {
      identityInclude: /phụ kiện laptop|phu kien laptop|balo|túi chống sốc|tui chong soc|chuột|chuot|bàn phím|ban phim|hub|dock|đế tản nhiệt|de tan nhiet/i,
      requireIdentity: true,
      exclude: /^(?:máy tính bảng|may[- ]tinh[- ]bang|tablet|ipad|laptop|điện thoại|dien[- ]thoai)(?:[\s-]|$)/i,
    },
  };
  const accessoryRule = accessorySegmentRules[key];
  if (accessoryRule) {
    const includes = [];
    if (accessoryRule.identityInclude) includes.push(regexCondition(accessoryIdentityFields, accessoryRule.identityInclude));
    if (accessoryRule.categoryInclude && !accessoryRule.requireIdentity) {
      includes.push(regexCondition(accessoryCategoryFields, accessoryRule.categoryInclude));
    }
    const conditions = [includes.length === 1 ? includes[0] : { $or: includes }];
    if (accessoryRule.exclude) {
      conditions.push({
        $nor: [regexCondition([...accessoryIdentityFields, ...accessoryCategoryFields], accessoryRule.exclude)],
      });
    }
    return conditions.length === 1 ? conditions[0] : { $and: conditions };
  }

  const usedCommonFields = [
    "name",
    "slug",
    "category",
    "categories",
    "categoryTrail.name",
    "categoryTrail.label",
    "trainingLabels.categoryLevel1",
    "trainingLabels.categoryLevel2",
    "trainingLabels.deviceGroup",
    "trainingLabels.productName",
  ];
  const usedProductIdentityFields = [
    "name",
    "slug",
    "sku",
    "trainingLabels.productName",
    "rawProductJsonLd.name",
  ];
  const usedCommonRegex = /hàng cũ|hang cu|cũ đẹp|cu dep|cũ trầy xước|cu tray xuoc|like new|like-new|đã kích hoạt|da kich hoat|trưng bày|trung bay|qua sử dụng|qua su dung|refurbished/i;
  const usedSegmentRules = {
    "used-phone": {
      include: /^(?:điện thoại|dien[- ]thoai|iphone|samsung galaxy (?!tab|watch|buds)|xiaomi (?!pad|watch|buds)|redmi (?!watch|buds)|poco|oppo (?!watch|buds)|honor (?!watch|band|pad)|realme (?!watch|buds|pad)|vivo|nubia|google pixel|tecno|infinix)(?:[\s-]|$)/i,
      exclude: /(?:tablet|máy tính bảng|may[- ]tinh[- ]bang|ipad|watch|đồng hồ|dong[- ]ho|buds|tai nghe|headphone|loa|speaker|ốp lưng|op[- ]lung|bao da|cáp|cap|sạc|sac)/i,
    },
    "used-tablet": {
      include: /^(?:máy tính bảng|may[- ]tinh[- ]bang|tablet|ipad|samsung galaxy tab|huawei matepad|xiaomi pad|redmi pad|lenovo (?:tab|idea tab|yoga tab)|honor pad|oppo pad)(?:[\s-]|$)/i,
      exclude: /(?:bao da|bàn phím|ban[- ]phim|ốp lưng|op[- ]lung|cáp|cap|sạc|sac)(?:[\s-]|$)/i,
    },
    "used-macbook": { include: /^mac ?book(?:[\s-]|$)/i },
    "used-laptop": {
      include: /^(?:laptop|notebook|asus (?!rog ally)|lenovo (?:thinkpad|ideapad|yoga|legion|loq)|hp (?:pavilion|probook|elitebook|victus|omen|envy|spectre)|dell (?:inspiron|latitude|vostro|xps|precision|alienware)|acer (?:aspire|swift|nitro|predator)|msi (?:modern|prestige|gaming|stealth|raider|katana|cyborg|creator))(?=[\s-])/i,
      exclude: /(?:màn hình|man[- ]hinh|monitor|desktop|máy tính để bàn|may[- ]tinh[- ]de[- ]ban|balo|túi|tui|sạc|sac|cáp|cap)/i,
    },
    "used-headphones": {
      include: /^(?:tai nghe|headphone|headset|earphone|earbud|airpods|galaxy buds|redmi buds|realme buds|oppo buds|oneplus buds|freebuds)(?:[\s-]|$)/i,
      exclude: /^(?:ốp|op|bao|hộp|hop|case|phụ kiện|phu[- ]kien)(?:[\s-]|$)/i,
    },
    "used-speaker": { include: /^(?:loa|speaker|soundbar)(?:[\s-]|$)/i },
    "used-watch": {
      include: /^(?:đồng hồ|dong[- ]ho|smartwatch|apple watch|samsung galaxy watch|galaxy watch|garmin|amazfit|huawei watch|xiaomi watch|redmi watch|vòng đeo tay|vong[- ]deo[- ]tay|smart ?band)(?:[\s-]|$)/i,
      exclude: /^(?:dây|day|ốp|op|sạc|sac|cáp|cap|kính|kinh)(?:[\s-]|$)/i,
    },
    "used-appliance": {
      include: /^(?:robot hút bụi|robot[- ]hut[- ]bui|máy hút bụi|may[- ]hut[- ]bui|máy lọc không khí|may[- ]loc[- ]khong[- ]khi|máy hút ẩm|may[- ]hut[- ]am|máy sưởi|may[- ]suoi|máy chiếu|may[- ]chieu|máy massage|may[- ]massage|máy sấy tóc|may[- ]say[- ]toc|máy cạo râu|may[- ]cao[- ]rau|máy rửa mặt|may[- ]rua[- ]mat|máy tăm nước|may[- ]tam[- ]nuoc|máy triệt lông|may[- ]triet[- ]long|máy đo huyết áp|may[- ]do[- ]huyet[- ]ap|nồi|noi|quạt|quat|bếp|bep|tủ lạnh|tu[- ]lanh|cân sức khỏe|can[- ]suc[- ]khoe|bàn ủi|ban[- ]ui|tv box)(?:[\s-]|$)/i,
      exclude: /^(?:máy tính bảng|may[- ]tinh[- ]bang|máy tính|may[- ]tinh|laptop|điện thoại|dien[- ]thoai|màn hình|man[- ]hinh)(?:[\s-]|$)/i,
    },
    "used-accessories": {
      include: /^(?:phụ kiện|phu[- ]kien|ốp|op[- ]lung|bao da|cáp|cap|sạc|sac|củ sạc|cu[- ]sac|pin dự phòng|pin[- ]du[- ]phong|hub|dock|balo|túi|tui|chuột|chuot|mouse|bàn phím|ban[- ]phim|keyboard|bút cảm ứng|but[- ]cam[- ]ung)(?:[\s-]|$)/i,
      exclude: /^(?:máy tính bảng|may[- ]tinh[- ]bang|tablet|ipad|macbook|laptop|điện thoại|dien[- ]thoai|tai nghe|headphone|loa|speaker|đồng hồ|dong[- ]ho|watch)(?:[\s-]|$)/i,
    },
    "used-monitor": { include: /^(?:màn hình|man[- ]hinh|monitor)(?:[\s-]|$)/i, exclude: /(?:laptop|tablet|điện thoại|dien[- ]thoai)/i },
    "used-tv": { include: /^(?:tivi|tv|smart tv|smart tivi)(?:[\s-]|$)/i },
    "used-charger": { include: /^(?:cáp sạc|cap[- ]sac|cáp|cap|sạc|sac|củ sạc|cu[- ]sac|adapter|charger)(?:[\s-]|$)/i },
  };

  if (usedSegmentRules[key]) {
    const rule = usedSegmentRules[key];
    const subtypeConditions = [regexCondition(usedProductIdentityFields, rule.include)];
    if (rule.exclude) subtypeConditions.push({ $nor: [regexCondition(usedProductIdentityFields, rule.exclude)] });
    return {
      $and: [
        regexCondition(usedCommonFields, usedCommonRegex),
        ...subtypeConditions,
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

async function initializeDbContext() {
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
    client: mongoClient,
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

function getDb() {
  if (!dbContextPromise) {
    dbContextPromise = initializeDbContext().catch((error) => {
      dbContextPromise = null;
      throw error;
    });
  }
  return dbContextPromise;
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
      stores: "/api/stores",
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
      google: "/api/auth/google",
      businessSubmit: "/api/auth/business/submit",
      me: "/api/auth/me",
      adminSummary: "/api/admin/summary",
      adminBusinessVerifications: "/api/admin/business-verifications",
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

async function handleStoresRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const latitudeValue = url.searchParams.get("lat");
  const longitudeValue = url.searchParams.get("lng");
  const radiusValue = url.searchParams.get("radius");

  try {
    const result = await searchCellphoneStores({
      province:
        url.searchParams.get("province") ||
        url.searchParams.get("city") ||
        "Hồ Chí Minh",
      district: url.searchParams.get("district") || "",
      query:
        url.searchParams.get("q") ||
        url.searchParams.get("query") ||
        "",
      pageSize: toPositiveInt(url.searchParams.get("pageSize"), 20, 20),
      maxPages: toPositiveInt(url.searchParams.get("maxPages"), 3, 3),
      latitude:
        latitudeValue === null || latitudeValue === ""
          ? undefined
          : Number(latitudeValue),
      longitude:
        longitudeValue === null || longitudeValue === ""
          ? undefined
          : Number(longitudeValue),
      radius:
        radiusValue === null || radiusValue === ""
          ? undefined
          : Number(radiusValue),
      forceRefresh: url.searchParams.get("refresh") === "true",
    });
    const { stores, ...meta } = result;

    sendJson(res, 200, {
      ok: true,
      data: stores,
      message: "Đã tải danh sách cửa hàng CellphoneS.",
      meta,
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode);
    sendError(
      res,
      Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600
        ? statusCode
        : 502,
      error?.message || "Không thể tải danh sách cửa hàng CellphoneS.",
    );
  }
}

async function handleListProducts(req, res) {
  const { productDetails } = await getDb();
  const webProducts = productDetails;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const skip = (page - 1) * limit;
  const query = buildListQuery(url.searchParams);
  const sortKey = url.searchParams.get("sort");
  const sort = buildSort(sortKey);
  const includeRaw = url.searchParams.get("raw") === "true";
  const includeDetails = url.searchParams.get("include") === "details";

  if (!includeRaw && !includeDetails) {
    const cachedPayload = getApiResponseCache(req, "products:list");
    if (cachedPayload) {
      sendJson(res, 200, cachedPayload);
      return;
    }
  }

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
      facets: 1,
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

  const docsPromise = isPriceSort(sortKey)
    ? webProducts.aggregate([
      { $match: query },
      { $set: { __effectivePrice: buildEffectivePriceExpression() } },
      {
        $set: {
          __missingPrice: {
            $cond: [{ $gt: ["$__effectivePrice", 0] }, 0, 1],
          },
        },
      },
      {
        $sort: {
          __missingPrice: 1,
          __effectivePrice: String(sortKey).toLowerCase().replace(/-/g, "_") === "price_desc" ? -1 : 1,
          name: 1,
        },
      },
      { $skip: skip },
      { $limit: limit },
      { $project: buildAggregateProjection(projection) },
    ]).toArray()
    : webProducts.find(query, { projection }).sort(sort).skip(skip).limit(limit).toArray();

  const [total, docs] = await Promise.all([
    getCachedProductCount(req, webProducts, query),
    docsPromise,
  ]);

  const payload = {
    ok: true,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: includeRaw ? docs : docs.map(normalizeProduct),
  };

  if (!includeRaw && !includeDetails) {
    setApiResponseCache(req, payload, API_PRODUCTS_CACHE_TTL_MS, "products:list");
  }

  sendJson(res, 200, payload);
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
  const url = new URL(req.url, `http://${req.headers.host}`);
  const includeRaw = url.searchParams.get("raw") === "true";
  const forceLazyScrape = url.searchParams.get("lazy") === "true" || url.searchParams.get("forceLazy") === "true";

  if (!includeRaw && !forceLazyScrape) {
    const cachedPayload = getApiResponseCache(req, "products:detail");
    if (cachedPayload) {
      sendJson(res, 200, cachedPayload);
      return;
    }
  }

  const { productDetails } = await getDb();
  const product = await findProductByIdentifier(productDetails, identifier);
  const manifest = product || await findProductDetailByIdentifier(productDetails, identifier, product);
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
  if (!includeRaw && !forceLazyScrape) {
    setApiResponseCache(req, payload, API_PRODUCT_DETAIL_CACHE_TTL_MS, "products:detail");
  }
  sendJson(res, 200, payload);
}

async function handleRelatedProducts(req, res, identifier) {
  const cachedPayload = getApiResponseCache(req, "products:related");
  if (cachedPayload) {
    sendJson(res, 200, cachedPayload);
    return;
  }

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

  const payload = {
    ok: true,
    baseProduct: normalizeProduct(product),
    data: docs.map(normalizeProduct),
  };
  setApiResponseCache(req, payload, API_RELATED_PRODUCTS_CACHE_TTL_MS, "products:related");
  sendJson(res, 200, payload);
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

function isValidBasicEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
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

function isCartMongoObjectId(value) {
  return /^[a-f\d]{24}$/i.test(cleanCartText(value, 80));
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
  const rawMongoId = cleanCartText(product.mongoId || product._id, 80);
  const mongoId = isCartMongoObjectId(rawMongoId) ? rawMongoId : "";
  const rawId = cleanCartText(product.id, 180);
  const legacyProductId =
    (rawMongoId && !mongoId ? rawMongoId : "") ||
    (/^\d+$/.test(rawId) ? rawId : "");
  const selectedOptions = sanitizeCartOptions(product);
  const item = {
    productId: cleanCartText(product.productId || legacyProductId || mongoId || slug, 180),
    mongoId,
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

async function getCouponMember(req, db) {
  const owner = getOptionalOrderOwner(req);
  if (!owner?.userId || !ObjectId.isValid(owner.userId)) return null;
  return db.collection(process.env.USERS_COLLECTION || "smember_users").findOne({
    _id: new ObjectId(owner.userId),
    status: { $ne: "blocked" },
  });
}

function getRequiredCustomer(req, res) {
  const owner = getOptionalOrderOwner(req);
  if (!owner?.userId) {
    sendError(res, 401, "Vui lòng đăng nhập để sử dụng tính năng này.");
    return null;
  }
  return owner;
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
    emailDeliveryStatus: requested ? "pending" : "not_requested",
    note: requested ? cleanLimitedText(input.note, 1000) : "",
  };
}

function validateCompanyInvoice(invoice = {}) {
  if (!invoice.requested) return "";
  if (!invoice.companyName || invoice.companyName.length < 2) {
    return "Vui lòng nhập tên công ty để xuất hóa đơn.";
  }
  if (!/^\d{10}(?:-\d{3})?$/.test(invoice.taxCode || "")) {
    return "Mã số thuế cần gồm 10 chữ số hoặc 10 chữ số kèm mã đơn vị 3 chữ số.";
  }
  if (!invoice.companyAddress || invoice.companyAddress.length < 5) {
    return "Vui lòng nhập địa chỉ công ty để xuất hóa đơn.";
  }
  if (!invoice.invoiceEmail || !isValidBasicEmail(invoice.invoiceEmail)) {
    return "Vui lòng nhập email nhận hóa đơn hợp lệ.";
  }
  return "";
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

async function findActiveCoupon(coupons, code = "") {
  const couponCode = cleanLimitedText(code, 80).toUpperCase();
  if (!couponCode) return null;
  await ensureCouponIndexes(coupons);
  return coupons.findOne({ code: couponCode, status: "active" });
}

async function buildCheckoutPreview({ productDetails, products, coupons, body = {}, couponContext = {} }) {
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
    couponError = getCouponInvalidReason(coupon, preCouponTotals, {
      ...couponContext,
      educationOffer,
    });
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

function getOrderItemIdentifiers(rawItem = {}) {
  return uniqueStrings([
    rawItem.mongoId,
    rawItem._id,
    rawItem.slug,
    rawItem.sku,
    getSlugFromUrl(rawItem.url || rawItem.productUrl),
    rawItem.productId,
    rawItem.id,
  ]).map((value) => cleanCartText(value, 240)).filter(Boolean);
}

async function resolveOrderItemsFromDb({ productDetails, products, rawItems = [] }) {
  const resolvedItems = [];

  for (const rawItem of rawItems) {
    const identifiers = getOrderItemIdentifiers(rawItem);
    if (!identifiers.length) throw new Error("Thiếu mã sản phẩm trong giỏ hàng.");

    let product = null;
    for (const identifier of identifiers) {
      product =
        (await findProductByIdentifier(productDetails, identifier)) ||
        (await findProductByIdentifier(products, identifier));
      if (product) break;
    }

    if (!product) {
      throw new Error(`Không tìm thấy sản phẩm "${identifiers[0]}" trong MongoDB.`);
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
  const { db, orders, carts, products, productDetails, inventory, coupons, userEvents, notifications } = await getDb();
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
    if (bodyData.educationOffer) {
      if (!owner?.userId || !ObjectId.isValid(owner.userId)) {
        sendError(res, 403, "Vui lòng đăng nhập và xác minh S-Student/S-Teacher để dùng ưu đãi giáo dục.");
        return;
      }
      const member = await db.collection(process.env.USERS_COLLECTION || "smember_users").findOne({
        _id: new ObjectId(owner.userId),
        "educationVerification.status": "verified",
        "educationVerification.expiresAt": { $gt: new Date() },
      });
      if (!member) {
        sendError(res, 403, "Tài khoản chưa xác minh S-Student/S-Teacher hoặc xác minh đã hết hạn.");
        return;
      }
    }
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
      invoiceEmail:
        bodyData.companyInvoice?.invoiceEmail ||
        bodyData.companyInvoice?.email ||
        customer.email,
    });
    const shippingChoice = sanitizeShippingChoice(bodyData.shippingChoice || bodyData.shipping || {});
    const validationError = validateOrderPayload({ customer, receiver, shippingAddress, shippingChoice, items });
    const invoiceValidationError = validateCompanyInvoice(companyInvoice);

    if (validationError || invoiceValidationError) {
      sendError(res, 400, validationError || invoiceValidationError);
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
      const couponMember = await getCouponMember(req, db);
      const couponError = getCouponInvalidReason(appliedCoupon, preCouponTotals, {
        member: couponMember,
        educationOffer,
      });
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

    if (inserted?.companyInvoice?.requested) {
      const invoiceEmail = inserted.companyInvoice.invoiceEmail || inserted.customer?.email || "";
      try {
        const delivery = await sendOrderInvoiceEmail({ order: inserted });
        const sentAt = new Date();
        await orders.updateOne(
          { _id: inserted._id },
          {
            $set: {
              "companyInvoice.invoiceStatus": "sent",
              "companyInvoice.emailDeliveryStatus": "sent",
              "companyInvoice.sentAt": sentAt,
              "companyInvoice.messageId": cleanLimitedText(delivery?.messageId, 240),
              "companyInvoice.emailError": "",
              updatedAt: sentAt,
            },
          }
        );
      } catch (error) {
        const failedAt = new Date();
        console.error(`[invoice-email] Không thể gửi bill đơn ${orderCode} tới ${invoiceEmail}:`, error?.message || error);
        await orders.updateOne(
          { _id: inserted._id },
          {
            $set: {
              "companyInvoice.invoiceStatus": "pending",
              "companyInvoice.emailDeliveryStatus": "failed",
              "companyInvoice.emailFailedAt": failedAt,
              "companyInvoice.emailError": cleanLimitedText(error?.message || "Không thể gửi email hóa đơn.", 500),
              updatedAt: failedAt,
            },
          }
        );
      }
      inserted = await orders.findOne({ _id: inserted._id });
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
  const { db, orders, coupons } = await getDb();
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
    const member = await getCouponMember(req, db);
    const availableCoupons = await findAvailableCouponsForMember(coupons, member);
    sendJson(res, 200, {
      ok: true,
      message: "Danh sách mã giảm giá khả dụng cho tài khoản.",
      data: availableCoupons.map((coupon) => normalizeCouponForPublic(coupon, 0)),
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

async function ensureReturnRequestIndexes(returns) {
  if (returnRequestIndexesReady) return;

  await Promise.all([
    returns.createIndex({ returnCode: 1 }, { unique: true, name: "unique_return_code" }),
    returns.createIndex({ userId: 1, createdAt: -1 }, { name: "returns_user_created" }),
    returns.createIndex({ orderCode: 1, status: 1 }, { name: "returns_order_status" }),
    returns.createIndex({ status: 1, createdAt: -1 }, { name: "returns_status_created" }),
  ]);

  returnRequestIndexesReady = true;
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
    productSku: doc.productSku || "",
    productName: doc.productName || "",
    productImage: doc.productImage || "",
    reason: doc.reason || "",
    status: doc.status || "pending",
    statusLabel: doc.status === "completed" ? "Hoàn trả thành công" : (doc.statusLabel || "Chờ tiếp nhận"),
    returnStatus: doc.status || "pending",
    customerPhone: doc.customerPhone || "",
    images: Array.isArray(doc.images) ? doc.images : [],
    note: doc.note || "",
    adminNote: doc.adminNote || "",
    quantity: Number(doc.quantity || 1),
    unitPrice: Number(doc.unitPrice || 0),
    refundAmount: Number(doc.refundAmount || 0),
    refundedAt: doc.refundedAt || null,
    statusHistory: Array.isArray(doc.statusHistory) ? doc.statusHistory : [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function generateReturnCode() {
  const now = new Date();
  return `RT${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function handleReturnsRequest(req, res, pathParts) {
  const { orders, returns, notifications } = await getDb();
  await ensureReturnRequestIndexes(returns);
  const owner = getOptionalOrderOwner(req);
  const identifier = decodeURIComponent(pathParts[2] || "");

  if (!identifier && req.method === "GET") {
    const customer = getRequiredCustomer(req, res);
    if (!customer) return;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = toPositiveInt(url.searchParams.get("limit"), 50, MAX_LIMIT);
    const status = cleanLimitedText(url.searchParams.get("status"), 40);
    const query = customer.role === "admin" ? {} : { userId: customer.userId };
    if (status && status !== "all") query.status = status;

    const docs = await returns
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();

    sendJson(res, 200, {
      ok: true,
      data: docs.map(normalizeReturnRequest),
    });
    return;
  }

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

    if (order.status !== "completed") {
      sendError(res, 400, "Chỉ có thể tạo yêu cầu đổi trả sau khi đơn hàng đã giao thành công.");
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

    const selectedProductId = selectedItem.productId || selectedItem.mongoId || "";
    const selectedProductSlug = selectedItem.slug || selectedItem.productSlug || "";
    const selectedProductName = selectedItem.name || selectedItem.productName || "Sản phẩm CellphoneS";
    const activeRequest = await returns.findOne({
      orderCode: order.orderCode,
      $or: [
        ...(selectedProductId ? [{ productId: selectedProductId }] : []),
        ...(selectedProductSlug ? [{ productSlug: selectedProductSlug }] : []),
        { productName: selectedProductName },
      ],
      status: { $in: ["pending", "received", "approved", "completed"] },
    });

    if (activeRequest) {
      sendError(
        res,
        409,
        activeRequest.status === "completed"
          ? `Sản phẩm này đã hoàn trả thành công theo yêu cầu #${activeRequest.returnCode}.`
          : `Sản phẩm này đang có yêu cầu đổi trả #${activeRequest.returnCode}.`
      );
      return;
    }

    const returnImages = Array.isArray(input.images)
      ? input.images.slice(0, 6).map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const totalImagePayloadSize = returnImages.reduce((sum, image) => sum + image.length, 0);

    if (totalImagePayloadSize > 1_500_000) {
      sendError(res, 400, "Tổng dung lượng ảnh đổi trả quá lớn. Vui lòng chọn ít ảnh hơn hoặc ảnh có dung lượng nhỏ hơn.");
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
      quantity: Math.max(1, Number(selectedItem.quantity || 1)),
      unitPrice: cleanCartPrice(selectedItem.currentPrice || selectedItem.price || selectedItem.unitPrice),
      reason: cleanLimitedText(input.reason, 1000),
      status: "pending",
      statusLabel: "Chờ tiếp nhận",
      statusHistory: [
        {
          status: "pending",
          label: "Chờ tiếp nhận",
          note: "Khách hàng đã gửi yêu cầu đổi trả từ trang Smember.",
          changedBy: owner?.userId || "customer",
          changedByRole: owner?.role || "customer",
          changedAt: now,
        },
      ],
      customerPhone: sanitizePhone(input.customerPhone || order.customer?.phone || order.receiver?.phone),
      images: returnImages,
      note: cleanLimitedText(input.note, 1000),
      adminNote: "",
      createdAt: now,
      updatedAt: now,
    };

    const result = await returns.insertOne(doc);
    const inserted = await returns.findOne({ _id: result.insertedId });

    if (doc.userId) {
      await createUserNotification(notifications, {
        userId: doc.userId,
        type: "return_requested",
        title: "Đã gửi yêu cầu đổi trả",
        message: `Yêu cầu ${doc.returnCode} cho đơn ${doc.orderCode} đang chờ CellphoneS tiếp nhận.`,
        orderCode: doc.orderCode,
        productId: doc.productId,
        metadata: { returnCode: doc.returnCode, returnStatus: doc.status },
      });
    }

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

  const { orders, returns } = await getDb();

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
      items: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .toArray();

  const eligibleDocs = docs.filter(isCompletedOrderEligibleForStats);
  const completedReturns = await returns
    .find({ userId: owner.userId, status: "completed" })
    .project({ orderCode: 1, productId: 1, productSlug: 1, productName: 1, quantity: 1, unitPrice: 1, refundAmount: 1 })
    .toArray();

  const getNetOrderTotal = (order = {}) => {
    const originalTotal = cleanCartPrice(order.totals?.total || order.totals?.roundedTotal);
    const explicitNetTotal = Number(order.totals?.netTotal);
    if (Number.isFinite(explicitNetTotal) && explicitNetTotal >= 0) return explicitNetTotal;

    const orderReturns = completedReturns.filter((item) => item.orderCode === order.orderCode);
    const derivedRefund = orderReturns.reduce((sum, returnItem) => {
      const matchedItem = (order.items || []).find((item) => (
        (returnItem.productId && [item.productId, item.mongoId].includes(returnItem.productId))
        || (returnItem.productSlug && [item.slug, item.productSlug].includes(returnItem.productSlug))
        || (returnItem.productName && returnItem.productName === (item.name || item.productName))
      ));
      const quantity = Math.max(1, Number(matchedItem?.quantity || returnItem.quantity || 1));
      const lineTotal = cleanCartPrice(matchedItem?.lineTotal || matchedItem?.total || matchedItem?.subtotal);
      const unitPrice = cleanCartPrice(
        matchedItem?.currentPrice || matchedItem?.price || matchedItem?.unitPrice || returnItem.unitPrice
      );
      return sum + (cleanCartPrice(returnItem.refundAmount) || lineTotal || unitPrice * quantity);
    }, 0);

    const recordedRefund = cleanCartPrice(order.totals?.refundedAmount || order.payment?.refundedAmount);
    return Math.max(0, originalTotal - Math.max(recordedRefund, derivedRefund));
  };

  const netEligibleDocs = eligibleDocs.filter((order) => getNetOrderTotal(order) > 0);
  const totalSpent = netEligibleDocs.reduce(
    (sum, order) => sum + getNetOrderTotal(order),
    0
  );

  const totalOrders = netEligibleDocs.length;
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
      recentOrders: netEligibleDocs.slice(0, 5).map((order) => ({
        orderCode: order.orderCode,
        status: order.status,
        total: getNetOrderTotal(order),
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
    coupons.createIndex({ status: 1, audiences: 1, expiresAt: 1 }, { name: "coupons_audience_availability" }),
  ]);

  couponIndexesReady = true;
}

async function ensureNewsletterCoupon(coupons) {
  await ensureCouponIndexes(coupons);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const coupon = {
    code: "KHUYENMAI10",
    name: "Khuyến mãi 10%",
    description: "Mã giảm giá 10% dành cho khách đăng ký nhận tin khuyến mãi.",
    type: "percent",
    value: 10,
    maxDiscount: 0,
    minSubtotal: 0,
    audiences: ["all"],
    allowWithEducationOffer: true,
    status: "active",
    startsAt: now,
    expiresAt,
    source: "newsletter",
    updatedAt: now,
  };

  await coupons.updateOne(
    { code: coupon.code },
    {
      $set: coupon,
      $setOnInsert: {
        usedCount: 0,
        createdAt: now,
      },
    },
    { upsert: true }
  );

  return coupons.findOne({ code: coupon.code });
}

async function ensureSupportRequestIndexes(supportRequests) {
  if (supportRequestIndexesReady) return;

  await Promise.all([
    supportRequests.createIndex(
      { requestCode: 1 },
      { unique: true, name: "unique_support_request_code" }
    ),
    supportRequests.createIndex(
      { status: 1, createdAt: -1 },
      { name: "support_status_created_at" }
    ),
    supportRequests.createIndex(
      { email: 1, createdAt: -1 },
      { name: "support_email_created_at" }
    ),
    supportRequests.createIndex(
      { userId: 1, createdAt: -1 },
      { name: "support_user_created_at" }
    ),
  ]);

  supportRequestIndexesReady = true;
}

function createSupportRequestCode() {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const timePart = String(Date.now()).slice(-6);
  const randomPart = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `HT${datePart}${timePart}${randomPart}`;
}

function sanitizeSupportAttachment(input = null) {
  if (!input || typeof input !== "object") return null;

  const dataUrl = String(input.dataUrl || input.url || "").trim();
  if (!dataUrl) return null;

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    const error = new Error("Ảnh đính kèm không hợp lệ. Chỉ chấp nhận JPG, PNG hoặc WEBP.");
    error.statusCode = 400;
    throw error;
  }

  const estimatedBytes = Math.floor((match[2].length * 3) / 4);
  if (estimatedBytes > 1_200_000) {
    const error = new Error("Ảnh đính kèm quá lớn. Vui lòng chọn ảnh nhỏ hơn 1,2MB.");
    error.statusCode = 400;
    throw error;
  }

  return {
    name: cleanLimitedText(input.name || "anh-dinh-kem.jpg", 180),
    type: match[1].toLowerCase(),
    size: estimatedBytes,
    dataUrl,
  };
}

function hashSupportTrackingToken(token = "") {
  return crypto
    .createHash("sha256")
    .update(String(token || ""))
    .digest("hex");
}

function getSupportTrackingToken(req) {
  const headerValue = req.headers["x-support-token"];
  return cleanLimitedText(Array.isArray(headerValue) ? headerValue[0] : headerValue, 160);
}

function getSupportRequesterId(req) {
  const requester = getRequestUser(req);
  return String(requester?.sub || requester?.id || "").trim();
}

function canAccessSupportRequest(req, doc = {}) {
  const requesterId = getSupportRequesterId(req);
  if (requesterId && requesterId === String(doc.userId || "").trim()) return true;

  const trackingToken = getSupportTrackingToken(req);
  if (!trackingToken || !doc.trackingTokenHash) return false;

  const suppliedHash = Buffer.from(hashSupportTrackingToken(trackingToken), "hex");
  const expectedHash = Buffer.from(String(doc.trackingTokenHash), "hex");
  return suppliedHash.length === expectedHash.length
    && crypto.timingSafeEqual(suppliedHash, expectedHash);
}

function normalizeSupportMessages(doc = {}) {
  const messages = Array.isArray(doc.messages)
    ? doc.messages
      .filter((message) => message && message.content)
      .map((message) => ({
        id: String(message.id || ""),
        sender: message.sender === "admin" ? "admin" : "customer",
        senderName: cleanLimitedText(message.senderName, 120)
          || (message.sender === "admin" ? "CellphoneS" : doc.fullName || "Khách hàng"),
        content: cleanLimitedText(message.content, 4000),
        createdAt: message.createdAt,
      }))
    : [];

  if (!messages.length && doc.content) {
    messages.push({
      id: "initial",
      sender: "customer",
      senderName: doc.fullName || "Khách hàng",
      content: doc.content,
      createdAt: doc.createdAt,
    });
  }

  if (doc.response && !messages.some((message) => (
    message.sender === "admin" && message.content === doc.response
  ))) {
    messages.push({
      id: "latest-response",
      sender: "admin",
      senderName: "CellphoneS",
      content: doc.response,
      createdAt: doc.lastResponseAt || doc.updatedAt,
    });
  }

  return messages.sort((left, right) => (
    new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime()
  ));
}

function normalizeSupportRequestForPublic(doc = {}, { includeAttachment = false } = {}) {
  const attachment = doc.attachment
    ? {
      name: doc.attachment.name || "",
      type: doc.attachment.type || "",
      size: Number(doc.attachment.size || 0),
      ...(includeAttachment && doc.attachment.dataUrl
        ? { dataUrl: doc.attachment.dataUrl }
        : {}),
    }
    : null;

  return {
    id: String(doc._id || ""),
    requestCode: doc.requestCode || "",
    issueType: doc.issueType || "",
    fullName: doc.fullName || "",
    phone: doc.phone || "",
    email: doc.email || "",
    orderCode: doc.orderCode || "",
    preferredContact: doc.preferredContact || "email",
    content: doc.content || "",
    attachment,
    status: doc.status || "new",
    statusLabel: doc.statusLabel || "Mới tiếp nhận",
    response: doc.response || "",
    messages: normalizeSupportMessages(doc),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function handleCreateSupportRequest(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  const body = await parseJsonBody(req);
  const issueType = cleanLimitedText(body.issueType || body.category || body.topic, 120);
  const fullName = cleanLimitedText(body.fullName || body.name, 120);
  const phone = sanitizePhone(body.phone);
  const email = normalizeEmail(body.email);
  const orderCode = cleanLimitedText(body.orderCode, 80).toUpperCase();
  const content = cleanLimitedText(body.content || body.message || body.description, 4000);
  const preferredContact = ["email", "phone"].includes(body.preferredContact)
    ? body.preferredContact
    : (email ? "email" : "phone");

  if (!issueType) {
    sendError(res, 400, "Vui lòng chọn nhóm vấn đề.");
    return;
  }
  if (!fullName || fullName.length < 2) {
    sendError(res, 400, "Vui lòng nhập họ và tên.");
    return;
  }
  if (!phone && !email) {
    sendError(res, 400, "Vui lòng nhập số điện thoại hoặc email để nhận phản hồi.");
    return;
  }
  if (phone && !/^0\d{9}$/.test(phone)) {
    sendError(res, 400, "Số điện thoại cần gồm 10 chữ số và bắt đầu bằng 0.");
    return;
  }
  if (email && !isValidBasicEmail(email)) {
    sendError(res, 400, "Email không hợp lệ.");
    return;
  }
  if (!content || content.length < 10) {
    sendError(res, 400, "Nội dung hỗ trợ cần có ít nhất 10 ký tự.");
    return;
  }

  let attachment = null;
  try {
    attachment = sanitizeSupportAttachment(body.attachment);
  } catch (error) {
    sendError(res, error.statusCode || 400, error.message);
    return;
  }

  const requester = getRequestUser(req);
  const rateIdentifier = requester?.sub || email || phone || req.socket?.remoteAddress || "support";
  if (!rateLimitOrSend({
    req,
    res,
    sendError,
    scope: "support:create",
    identifier: rateIdentifier,
    max: Number(process.env.RATE_LIMIT_SUPPORT_MAX || 8),
    message: "Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau ít phút.",
  })) return;

  const { db } = await getDb();
  const supportRequests = db.collection(process.env.SUPPORT_REQUESTS_COLLECTION || "support_requests");
  await ensureSupportRequestIndexes(supportRequests);

  const now = new Date();
  const trackingToken = crypto.randomBytes(24).toString("base64url");
  const doc = {
    requestCode: createSupportRequestCode(),
    issueType,
    fullName,
    phone,
    email,
    orderCode,
    preferredContact,
    content,
    attachment,
    status: "new",
    statusLabel: "Mới tiếp nhận",
    adminNote: "",
    response: "",
    messages: [{
      id: crypto.randomUUID(),
      sender: "customer",
      senderName: fullName,
      content,
      createdAt: now,
    }],
    trackingTokenHash: hashSupportTrackingToken(trackingToken),
    userId: requester?.sub || requester?.id || "",
    userRole: requester?.role || "guest",
    ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
    createdAt: now,
    updatedAt: now,
  };

  const result = await supportRequests.insertOne(doc);
  doc._id = result.insertedId;

  sendJson(res, 201, {
    ok: true,
    message: `Đã gửi yêu cầu hỗ trợ #${doc.requestCode}.`,
    data: {
      ...normalizeSupportRequestForPublic(doc, { includeAttachment: true }),
      trackingToken,
    },
  });
}

async function handleListMySupportRequests(req, res) {
  if (req.method !== "GET") {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  const userId = getSupportRequesterId(req);
  if (!userId) {
    sendError(res, 401, "Vui lòng đăng nhập để xem yêu cầu hỗ trợ của bạn.");
    return;
  }

  const { db } = await getDb();
  const supportRequests = db.collection(process.env.SUPPORT_REQUESTS_COLLECTION || "support_requests");
  await ensureSupportRequestIndexes(supportRequests);
  const docs = await supportRequests
    .find({ userId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(50)
    .toArray();

  sendJson(res, 200, {
    ok: true,
    data: docs.map((doc) => normalizeSupportRequestForPublic(doc)),
  });
}

async function findSupportRequestByCode(requestCode) {
  const { db } = await getDb();
  const supportRequests = db.collection(process.env.SUPPORT_REQUESTS_COLLECTION || "support_requests");
  await ensureSupportRequestIndexes(supportRequests);
  const doc = await supportRequests.findOne({ requestCode });
  return { supportRequests, doc };
}

async function handleGetSupportRequest(req, res, requestCode) {
  if (req.method !== "GET") {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  const { doc } = await findSupportRequestByCode(requestCode);
  if (!doc) {
    sendError(res, 404, "Không tìm thấy yêu cầu hỗ trợ.");
    return;
  }
  if (!canAccessSupportRequest(req, doc)) {
    sendError(res, 403, "Bạn không có quyền xem yêu cầu hỗ trợ này.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    data: normalizeSupportRequestForPublic(doc, { includeAttachment: true }),
  });
}

async function handleCreateSupportMessage(req, res, requestCode) {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  const { supportRequests, doc } = await findSupportRequestByCode(requestCode);
  if (!doc) {
    sendError(res, 404, "Không tìm thấy yêu cầu hỗ trợ.");
    return;
  }
  if (!canAccessSupportRequest(req, doc)) {
    sendError(res, 403, "Bạn không có quyền phản hồi yêu cầu hỗ trợ này.");
    return;
  }
  if (doc.status === "closed") {
    sendError(res, 409, "Yêu cầu này đã đóng. Vui lòng tạo yêu cầu mới nếu bạn cần hỗ trợ thêm.");
    return;
  }

  const body = await parseJsonBody(req);
  const content = cleanLimitedText(body.content || body.message, 4000);
  if (content.length < 2) {
    sendError(res, 400, "Vui lòng nhập nội dung phản hồi.");
    return;
  }

  const requester = getRequestUser(req);
  const rateIdentifier = requester?.sub
    || doc.email
    || doc.phone
    || req.socket?.remoteAddress
    || requestCode;
  if (!rateLimitOrSend({
    req,
    res,
    sendError,
    scope: "support:message",
    identifier: rateIdentifier,
    max: Number(process.env.RATE_LIMIT_SUPPORT_MESSAGE_MAX || 12),
    message: "Bạn gửi phản hồi quá nhanh. Vui lòng thử lại sau ít phút.",
  })) return;

  const now = new Date();
  const message = {
    id: crypto.randomUUID(),
    sender: "customer",
    senderName: doc.fullName || requester?.name || "Khách hàng",
    content,
    createdAt: now,
  };
  const result = await supportRequests.findOneAndUpdate(
    { _id: doc._id },
    {
      $push: { messages: message },
      $set: {
        status: "new",
        statusLabel: "Mới tiếp nhận",
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );
  const updated = result?.value || result;

  sendJson(res, 201, {
    ok: true,
    message: "Đã gửi phản hồi tới bộ phận hỗ trợ.",
    data: normalizeSupportRequestForPublic(updated, { includeAttachment: true }),
  });
}

async function handleSupportRequestsRequest(req, res, pathParts) {
  const resource = decodeURIComponent(pathParts[2] || "");
  const action = decodeURIComponent(pathParts[3] || "");

  if (!resource) {
    await handleCreateSupportRequest(req, res);
    return;
  }

  if (resource === "mine") {
    await handleListMySupportRequests(req, res);
    return;
  }

  const requestCode = cleanLimitedText(resource, 80).toUpperCase();
  if (action === "messages") {
    await handleCreateSupportMessage(req, res, requestCode);
    return;
  }

  await handleGetSupportRequest(req, res, requestCode);
}

async function handleNewsletterSubscribe(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  const body = await parseJsonBody(req);
  const email = normalizeEmail(body.email);
  const phone = sanitizePhone(body.phone);
  const accepted = Boolean(body.accepted ?? body.acceptTerms ?? body.consent);

  if (!email || !isValidBasicEmail(email)) {
    sendError(res, 400, "Vui lòng nhập email hợp lệ.");
    return;
  }

  if (phone && !/^0\d{9}$/.test(phone)) {
    sendError(res, 400, "Số điện thoại cần gồm 10 chữ số và bắt đầu bằng 0.");
    return;
  }

  if (!accepted) {
    sendError(res, 400, "Vui lòng đồng ý điều khoản trước khi đăng ký.");
    return;
  }

  if (!rateLimitOrSend({
    req,
    res,
    sendError,
    scope: "newsletter:subscribe",
    identifier: email,
    max: Number(process.env.RATE_LIMIT_NEWSLETTER_MAX || 5),
    message: "Bạn đăng ký nhận khuyến mãi quá nhanh. Vui lòng thử lại sau ít phút.",
  })) return;

  const { db, coupons } = await getDb();
  const subscribers = db.collection(process.env.NEWSLETTER_COLLECTION || "newsletter_subscribers");
  const coupon = await ensureNewsletterCoupon(coupons);
  const couponCode = "khuyenmai10";
  const now = new Date();

  try {
    await sendNewsletterCouponEmail({ email, couponCode });
  } catch (error) {
    console.error(`[newsletter] Không thể gửi mã giảm giá tới ${email}:`, error?.message || error);
    sendError(res, 502, "Không thể gửi email khuyến mãi. Vui lòng thử lại sau.");
    return;
  }

  await subscribers.updateOne(
    { email },
    {
      $set: {
        email,
        phone,
        couponCode: coupon.code,
        status: "active",
        lastSentAt: now,
        updatedAt: now,
        ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
      },
      $inc: { emailSentCount: 1 },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  sendJson(res, 200, {
    ok: true,
    message: "Đăng ký thành công. Mã giảm giá đã được gửi về email của bạn.",
    data: {
      email,
      coupon: normalizeCouponForPublic(coupon, 0),
      code: couponCode,
    },
  });
}

async function handleCouponApply(req, res) {
  const { db, coupons } = await getDb();
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

  const baseTotals = { subtotal, shippingFee };
  const reason = getCouponInvalidReason(coupon, baseTotals, {
    member: await getCouponMember(req, db),
    educationOffer: Boolean(body.educationOffer),
  });
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
  const { db, coupons, productDetails, products } = await getDb();
  const body = await parseJsonBody(req);
  const code = cleanLimitedText(body.code || body.couponCode || body.coupon?.code, 80).toUpperCase();

  if (!code) {
    sendError(res, 400, "Vui lòng nhập mã giảm giá.");
    return;
  }

  let subtotal = cleanCartPrice(body.subtotal || body.totals?.subtotal || body.total);
  let shippingFee = cleanCartPrice(body.shippingFee || body.totals?.shippingFee);
  const couponMember = await getCouponMember(req, db);

  if (Array.isArray(body.items) && body.items.length) {
    try {
      const preview = await buildCheckoutPreview({
        productDetails,
        products,
        coupons,
        body: { ...body, couponCode: code },
        couponContext: { member: couponMember },
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
  const reason = getCouponInvalidReason(coupon, baseTotals, {
    member: couponMember,
    educationOffer: Boolean(body.educationOffer),
  });
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

async function findAvailableCouponsForMember(coupons, member, limit = 50) {
  await ensureCouponIndexes(coupons);
  const now = new Date();
  const eligibleAudiences = getEligibleCouponAudiences(member);
  const docs = await coupons
    .find({
      status: "active",
      $and: [
        { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: now } }] },
        {
          $or: [
            { audiences: { $exists: false } },
            { audiences: null },
            { audiences: { $size: 0 } },
            { audiences: { $in: eligibleAudiences } },
          ],
        },
      ],
    })
    .sort({ expiresAt: 1, createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.filter((coupon) => !getCouponAvailabilityInvalidReason(coupon, { member }));
}

async function handleCouponsAvailable(req, res) {
  const { db, coupons } = await getDb();
  const member = await getCouponMember(req, db);
  const eligibleDocs = await findAvailableCouponsForMember(coupons, member);

  sendJson(res, 200, {
    ok: true,
    data: eligibleDocs.map((coupon) => normalizeCouponForPublic(coupon, 0)),
  });
}

async function handleCheckoutPreview(req, res) {
  const { db, coupons, productDetails, products } = await getDb();
  const body = await parseJsonBody(req);

  try {
    const couponMember = await getCouponMember(req, db);
    if (body.educationOffer) {
      const education = couponMember?.educationVerification || {};
      if (education.status !== "verified" || (education.expiresAt && new Date(education.expiresAt) <= new Date())) {
        sendError(res, 403, "Tài khoản chưa xác minh S-Student/S-Teacher hoặc xác minh đã hết hạn.");
        return;
      }
    }
    const preview = await buildCheckoutPreview({
      productDetails,
      products,
      coupons,
      body,
      couponContext: { member: couponMember },
    });
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

  if (pathParts[1] === "stores") {
    if (req.method !== "GET") {
      sendError(res, 405, "Method not allowed.");
      return;
    }

    await handleStoresRequest(req, res);
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

  if (pathParts[1] === "newsletter" && pathParts[2] === "subscribe") {
    await handleNewsletterSubscribe(req, res);
    return;
  }

  if (pathParts[1] === "support-requests") {
    await handleSupportRequestsRequest(req, res, pathParts);
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
  res.requestStartedAtNs = process.hrtime.bigint();
  res.requestAcceptEncoding = req.headers["accept-encoding"] || "";
  prepareCorsResponse(req, res);
  routeRequest(req, res).catch((error) => {
    console.error("[api]", error);
    sendError(res, 500, "Internal server error.", error.message);
  });
});

async function startServer() {
  const { dbName, productsCollection, productDetailsCollection } = getMongoConfig();
  try {
    await getDb();
    server.listen(API_PORT, () => {
      console.log(`API server listening on http://localhost:${API_PORT}`);
      console.log(`MongoDB source: ${dbName}.${productsCollection}`);
      console.log(`MongoDB details: ${dbName}.${productDetailsCollection}`);
    });
  } catch (error) {
    console.error("[api:start] MongoDB initialization failed:", error.message);
    process.exitCode = 1;
  }
}

startServer();

async function shutdown() {
  if (mongoClient) await mongoClient.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
