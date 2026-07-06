const http = require("http");
const { ObjectId } = require("mongodb");
const { ProxyAgent } = require("undici");
const { handleAdminRequest, isAdminAuthorized } = require("../services/admin-service");
const { handleAuthRequest, verifyJwt } = require("../services/auth-service");
const { extractCellphonesDetails } = require("../cellphones/cellphones-detail-extractor");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const {
  buildProductDetailManifest,
  hydrateProductDetail,
  writeProductDetailFile,
} = require("../storage/product-detail-storage");

const API_PORT = Number(process.env.API_PORT || 5050);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LAZY_SCRAPE_TIMEOUT_MS = Number(process.env.LAZY_SCRAPE_TIMEOUT_MS || 45000);
const LAZY_SCRAPE_RETRIES = Number(process.env.LAZY_SCRAPE_RETRIES || 2);

let mongoClient;
let lazyProxyPool;
let lazyProxyCursor = 0;
let cartIndexesReady = false;
let orderIndexesReady = false;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Api-Key",
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
      console.warn(`[lazy-detail-retry] ${url}: ${error.message}${error.proxyId ? ` via ${error.proxyId}` : ""}`);
    }
  }

  throw lastError;
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

  if (inStock === "true") appendAndCondition(query, buildStockCondition(true));
  if (inStock === "false") appendAndCondition(query, buildStockCondition(false));

  return query;
}

function buildStockCondition(inStock = true) {
  const inStockCondition = {
    $or: [
      { "availability.status": "InStock" },
      { availability: "InStock" },
      { statusLabel: { $regex: "^C.n h.ng$", $options: "i" } },
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

function buildSort(sortKey) {
  switch (sortKey) {
    case "price_asc":
      return { currentPrice: 1, price: 1, name: 1 };
    case "price_desc":
      return { currentPrice: -1, price: -1, name: 1 };
    case "name":
      return { name: 1 };
    case "oldest":
      return { scrapedAt: 1, name: 1 };
    case "latest":
    default:
      return {
        webFreshnessScore: -1,
        realWorldYear: -1,
        effectiveRealWorldYear: -1,
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
            { categories: /tivi/i },
            { name: /tivi|smart tv|smart tivi/i },
            { slug: /tivi|smart-tv|smart-tivi/i },
            { categories: /laptop/i },
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
  } = getMongoConfig();
  const db = mongoClient.db(dbName);
  return {
    db,
    dbName,
    productsCollection,
    productDetailsCollection,
    productReviewsCollection,
    productQuestionsCollection,
    cartsCollection,
    ordersCollection,
    products: db.collection(productsCollection),
    productDetails: db.collection(productDetailsCollection),
    productReviews: db.collection(productReviewsCollection),
    productQuestions: db.collection(productQuestionsCollection),
    carts: db.collection(cartsCollection),
    orders: db.collection(ordersCollection),
  };
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
    products,
    productDetails,
    productReviews,
    productQuestions,
    carts,
    orders,
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
  ] = await Promise.all([
    products.estimatedDocumentCount(),
    productDetails.estimatedDocumentCount(),
    productReviews.estimatedDocumentCount(),
    productQuestions.estimatedDocumentCount(),
    carts.estimatedDocumentCount(),
    orders.estimatedDocumentCount(),
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
    totalProducts,
    totalProductDetails,
    totalReviews,
    totalQuestions,
    totalCarts,
    totalOrders,
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
      requestRegisterOtp: "/api/auth/request-register-otp",
      verifyRegisterOtp: "/api/auth/verify-register-otp",
      login: "/api/auth/login",
      me: "/api/auth/me",
      adminSummary: "/api/admin/summary",
      adminOrders: "/api/admin/orders",
      adminUsers: "/api/admin/users",
      adminReviews: "/api/admin/reviews",
      adminQuestions: "/api/admin/questions",
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
      detail = await scrapeCellphonesDetail(detailUrl);
      await persistProductDetailManifest({ productDetails, detail });
      cacheStatus = "lazy-scraped";
    } catch (error) {
      if (!product) {
        sendError(res, 502, "Product details not found and lazy scrape failed.", error.message);
        return;
      }

      detail = buildSummaryBackedDetail(product, {}, identifier);
      cacheStatus = "summary-fallback:lazy-scrape-failed";
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
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
}

function getRequestUser(req) {
  const token = getBearerToken(req);
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
  return {
    requested,
    companyName: requested ? cleanLimitedText(input.companyName, 180) : "",
    taxCode: requested ? cleanLimitedText(input.taxCode, 40) : "",
    companyAddress: requested ? cleanLimitedText(input.companyAddress, 320) : "",
    email: requested ? normalizeEmail(input.email) : "",
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

function buildOrderTotals(items = [], options = {}) {
  const cartSummary = summarizeCart(items);
  const shippingFee = cleanCartPrice(options.shippingFee);
  const educationOffer = Boolean(options.educationOffer);
  const educationDiscount = educationOffer
    ? Math.min(300000, cartSummary.subtotal)
    : 0;
  const totalBeforePayment = Math.max(0, cartSummary.subtotal + shippingFee - educationDiscount);

  return {
    currency: "VND",
    quantity: cartSummary.totalQuantity,
    totalGoods: cartSummary.originalSubtotal,
    subtotal: cartSummary.subtotal,
    shippingFee,
    discounts: {
      direct: cartSummary.discount,
      education: educationDiscount,
    },
    totalDiscount: cartSummary.discount + educationDiscount,
    total: totalBeforePayment,
    roundedTotal: totalBeforePayment,
    vatIncluded: true,
  };
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

async function handleOrdersRequest(req, res, pathParts) {
  const { orders, carts } = await getDb();
  await ensureOrderIndexes(orders);

  const owner = getOptionalOrderOwner(req);
  const identifier = decodeURIComponent(pathParts[2] || "");

  if (!identifier && req.method === "POST") {
    const body = await parseJsonBody(req);
    const rawItems = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.cart?.items)
        ? body.cart.items
        : [];
    const items = replaceCartItems(rawItems);
    const customer = sanitizeOrderPerson(body.customer, owner || {});
    const receiver = sanitizeOrderPerson(body.receiver || body.recipient, customer);
    const shippingAddress = sanitizeShippingAddress({
      ...(body.shippingAddress || body.address || {}),
      receiverName: receiver.fullName,
      receiverPhone: receiver.phone,
    });
    const educationOffer = Boolean(body.educationOffer);
    const companyInvoice = sanitizeCompanyInvoice({
      ...(body.companyInvoice || {}),
      requested: educationOffer ? false : Boolean(body.companyInvoice?.requested),
    });
    const shippingChoice = sanitizeShippingChoice(body.shippingChoice || body.shipping || {});
    const validationError = validateOrderPayload({ customer, receiver, shippingAddress, shippingChoice, items });

    if (validationError) {
      sendError(res, 400, validationError);
      return;
    }

    const now = new Date();
    const totals = buildOrderTotals(items, {
      shippingFee: shippingChoice.fee,
      educationOffer,
    });
    const orderCode = generateOrderCode();
    const doc = {
      orderCode,
      userId: owner?.userId || "",
      userRole: owner?.role || "guest",
      status: "pending",
      statusLabel: "Chờ xác nhận",
      statusHistory: [
        {
          status: "pending",
          label: "Chờ xác nhận",
          note: "Đơn hàng đã được tạo từ website CellphoneS Clone.",
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
      gifts: Array.isArray(body.gifts)
        ? body.gifts.map((gift) => cleanLimitedText(gift, 180)).filter(Boolean).slice(0, 10)
        : ["Tặng Túi phụ kiện phiên bản CellphoneS"],
      totals,
      payment: {
        method: "cod",
        methodLabel: "Thanh toán khi nhận hàng",
        status: "unpaid",
      },
      marketingOptIn: Boolean(body.marketingOptIn),
      educationOffer,
      companyInvoice,
      note: cleanLimitedText(body.note, 1000),
      termsAccepted: Boolean(body.termsAccepted),
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
      userAgent: req.headers["user-agent"] || "",
      createdAt: now,
      updatedAt: now,
    };

    const result = await orders.insertOne(doc);
    const inserted = await orders.findOne({ _id: result.insertedId });

    if (owner?.userId && body.clearCart !== false) {
      await carts.updateOne(
        { userId: owner.userId },
        { $set: { items: [], updatedAt: now } }
      );
    }

    sendJson(res, 201, {
      ok: true,
      message: "Đặt hàng thành công. Đơn hàng đã được lưu vào MongoDB.",
      data: normalizeOrder(inserted),
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
  const authorName = cleanLimitedText(
    body.authorName || body.fullName || requester?.fullName || requester?.email || "Khách hàng CellphoneS",
    120
  );
  const content = cleanLimitedText(body.content || body.comment || body.review, 2000);

  if (!content || content.length < 5) {
    sendError(res, 400, "Vui lòng nhập nội dung đánh giá tối thiểu 5 ký tự.");
    return;
  }

  const now = new Date();
  const doc = {
    ...buildInteractionProductIdentity(product, identifier),
    rating: sanitizeRating(body.rating),
    authorName,
    email: normalizeEmail(body.email || requester?.email),
    phone: sanitizePhone(body.phone || requester?.phone),
    content,
    status: body.status === "pending" ? "pending" : "approved",
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
    message: doc.status === "approved"
      ? "Đã ghi nhận đánh giá của bạn."
      : "Đánh giá đã được gửi và đang chờ duyệt.",
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
      status: { $ne: "hidden" },
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
  const question = cleanLimitedText(body.question || body.content, 1200);
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

async function handleCreateProduct(req, res) {
  if (!isWriteAuthorized(req)) {
    sendError(res, 401, "Unauthorized.");
    return;
  }

  const { productDetails } = await getDb();
  const body = await parseJsonBody(req);
  const product = sanitizeProductInput(body, { isCreate: true });
  const now = new Date();
  product.createdAt = now;
  product.updatedAt = now;

  const result = await productDetails.insertOne(product);
  const inserted = await productDetails.findOne({ _id: result.insertedId });

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

  const { productDetails } = await getDb();
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

  const { productDetails } = await getDb();
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

  if (pathParts[1] === "orders") {
    await handleOrdersRequest(req, res, pathParts);
    return;
  }

  if (pathParts[1] !== "products") {
    sendError(res, 404, "Route not found.");
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
