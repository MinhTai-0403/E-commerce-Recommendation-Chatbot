const http = require("http");
const { ObjectId } = require("mongodb");
const { ProxyAgent } = require("undici");
const cheerio = require("cheerio");
const {
  handleAdminRequest,
  isAdminAuthorized,
} = require("../services/admin-service");
const {
  handleAuthRequest,
  getAuthToken,
  verifyJwt,
} = require("../services/auth-service");
const { ensureCommerceDatabase } = require("../services/db-maintenance");
const {
  extractCellphonesDetails,
} = require("../cellphones/cellphones-detail-extractor");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const { rateLimitOrSend } = require("../middlewares/rate-limit");
const { parseJsonBody, sendError, sendJson } = require("./http-response");
const {
  computeCouponDiscount,
  getCouponAudienceInvalidReason,
  getCouponInvalidReason,
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
const LAZY_SCRAPE_ENABLED =
  String(process.env.LAZY_SCRAPE_ENABLED || "false") === "true";
const LAZY_SCRAPE_TIMEOUT_MS = Number(
  process.env.LAZY_SCRAPE_TIMEOUT_MS || 45000,
);
const LAZY_SCRAPE_RETRIES = Number(process.env.LAZY_SCRAPE_RETRIES || 2);
const LAZY_SCRAPE_FAILURE_COOLDOWN_MS = Number(
  process.env.LAZY_SCRAPE_FAILURE_COOLDOWN_MS || 10 * 60 * 1000,
);
const LAZY_SCRAPE_DEBUG =
  String(process.env.LAZY_SCRAPE_DEBUG || "false") === "true";

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

const GOOGLE_PLACES_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACES_STORE_CACHE_TTL_MS = Number(
  process.env.GOOGLE_PLACES_STORE_CACHE_TTL_MS || 10 * 60 * 1000,
);
const GOOGLE_PLACES_STORE_TIMEOUT_MS = Number(
  process.env.GOOGLE_PLACES_STORE_TIMEOUT_MS || 20000,
);
const GOOGLE_PLACES_STORE_MAX_PAGES = 3;
const GOOGLE_PLACES_STORE_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.addressComponents",
  "places.location",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.nationalPhoneNumber",
  "places.regularOpeningHours",
  "places.currentOpeningHours",
  "nextPageToken",
].join(",");
const googlePlacesStoreCache = new Map();

function storeCleanText(value = "", maxLength = 500) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function normalizeStoreSearchText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

function getGoogleMapsApiKey() {
  const key = storeCleanText(process.env.GOOGLE_MAPS_API_KEY, 1000);
  if (key) return key;

  const error = new Error(
    "Thiếu GOOGLE_MAPS_API_KEY. Hãy bật Places API (New) và đặt key trong biến môi trường backend.",
  );
  error.code = "GOOGLE_MAPS_API_KEY_MISSING";
  error.statusCode = 503;
  throw error;
}

function getStoreAddressComponent(addressComponents = [], acceptedTypes = []) {
  if (!Array.isArray(addressComponents)) return "";

  const component = addressComponents.find((item) => {
    const types = Array.isArray(item?.types) ? item.types : [];
    return acceptedTypes.some((type) => types.includes(type));
  });

  return storeCleanText(component?.longText || component?.shortText || "", 160);
}

function normalizeStoreProvince(value = "") {
  const text = storeCleanText(value, 160)
    .replace(/^Thành phố\s+/i, "")
    .replace(/^Tỉnh\s+/i, "")
    .trim();
  const normalized = normalizeStoreSearchText(text);

  const aliases = [
    ["ho chi minh", "Hồ Chí Minh"],
    ["ha noi", "Hà Nội"],
    ["da nang", "Đà Nẵng"],
    ["can tho", "Cần Thơ"],
    ["hai phong", "Hải Phòng"],
    ["ba ria vung tau", "Bà Rịa - Vũng Tàu"],
    ["thua thien hue", "Thừa Thiên - Huế"],
  ];

  return aliases.find(([key]) => normalized.includes(key))?.[1] || text;
}

function getStoreProvince(place = {}) {
  const component = getStoreAddressComponent(place.addressComponents, [
    "administrative_area_level_1",
  ]);
  if (component) return normalizeStoreProvince(component);

  const address = normalizeStoreSearchText(place.formattedAddress);
  const known = [
    ["ho chi minh", "Hồ Chí Minh"],
    ["ha noi", "Hà Nội"],
    ["da nang", "Đà Nẵng"],
    ["can tho", "Cần Thơ"],
    ["hai phong", "Hải Phòng"],
    ["binh duong", "Bình Dương"],
    ["dong nai", "Đồng Nai"],
    ["ba ria vung tau", "Bà Rịa - Vũng Tàu"],
    ["khanh hoa", "Khánh Hòa"],
    ["lam dong", "Lâm Đồng"],
    ["long an", "Long An"],
    ["tien giang", "Tiền Giang"],
    ["tay ninh", "Tây Ninh"],
    ["binh thuan", "Bình Thuận"],
    ["binh dinh", "Bình Định"],
    ["quang nam", "Quảng Nam"],
    ["quang ngai", "Quảng Ngãi"],
    ["thua thien hue", "Thừa Thiên - Huế"],
    ["nghe an", "Nghệ An"],
    ["thanh hoa", "Thanh Hóa"],
    ["quang ninh", "Quảng Ninh"],
    ["bac ninh", "Bắc Ninh"],
    ["thai nguyen", "Thái Nguyên"],
  ];

  return known.find(([keyword]) => address.includes(keyword))?.[1] || "";
}

function getStoreDistrict(place = {}) {
  return getStoreAddressComponent(place.addressComponents, [
    "administrative_area_level_2",
    "sublocality_level_1",
    "sublocality",
  ]);
}

function isCellphoneSPlace(place = {}) {
  const name = normalizeStoreSearchText(
    place.displayName?.text || place.displayName || "",
  );
  if (!name) return false;

  const matchesBrand =
    name.includes("cellphones") ||
    name.includes("cellphone s") ||
    /^cps\b/.test(name);

  return matchesBrand && place.businessStatus !== "CLOSED_PERMANENTLY";
}

function normalizeGoogleStore(place = {}) {
  const latitude = Number(place.location?.latitude);
  const longitude = Number(place.location?.longitude);
  const openingHours =
    place.currentOpeningHours?.weekdayDescriptions ||
    place.regularOpeningHours?.weekdayDescriptions ||
    [];

  return {
    id: storeCleanText(place.id, 200),
    placeId: storeCleanText(place.id, 200),
    system: "cellphones",
    name: storeCleanText(
      place.displayName?.text || place.displayName || "CellphoneS",
      240,
    ),
    address: storeCleanText(
      place.formattedAddress || place.shortFormattedAddress || "",
      600,
    ),
    province: getStoreProvince(place),
    district: getStoreDistrict(place),
    phone: storeCleanText(place.nationalPhoneNumber, 80),
    openingHours: Array.isArray(openingHours) ? openingHours : [],
    openNow: place.currentOpeningHours?.openNow ?? null,
    businessStatus: storeCleanText(place.businessStatus, 80),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    googleMapsUri: storeCleanText(place.googleMapsUri, 1200),
    source: "google-places",
    fetchedAt: new Date().toISOString(),
  };
}

function getStoreCacheKey(options = {}) {
  return JSON.stringify({
    province: normalizeStoreSearchText(options.province),
    district: normalizeStoreSearchText(options.district),
    query: normalizeStoreSearchText(options.query),
    latitude: Number.isFinite(options.latitude) ? options.latitude : null,
    longitude: Number.isFinite(options.longitude) ? options.longitude : null,
    radius: options.radius,
    pageSize: options.pageSize,
    maxPages: options.maxPages,
  });
}

function getCachedStoreSearch(key) {
  const entry = googlePlacesStoreCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    googlePlacesStoreCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedStoreSearch(key, value) {
  googlePlacesStoreCache.set(key, {
    value,
    expiresAt: Date.now() + GOOGLE_PLACES_STORE_CACHE_TTL_MS,
  });
}

function buildGoogleStoreTextQuery({
  province = "",
  district = "",
  query = "",
} = {}) {
  return [
    "cửa hàng CellphoneS",
    storeCleanText(query, 160),
    storeCleanText(district, 120),
    storeCleanText(province, 120),
    "Việt Nam",
  ]
    .filter(Boolean)
    .join(" ");
}

async function requestGoogleStorePage({
  textQuery,
  pageSize,
  pageToken = "",
  latitude = null,
  longitude = null,
  radius = 50000,
}) {
  const body = {
    textQuery,
    languageCode: "vi",
    regionCode: "VN",
    pageSize,
  };

  if (pageToken) body.pageToken = pageToken;

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    body.locationBias = {
      circle: {
        center: { latitude, longitude },
        radius,
      },
    };
  }

  const response = await fetch(GOOGLE_PLACES_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getGoogleMapsApiKey(),
      "X-Goog-FieldMask": GOOGLE_PLACES_STORE_FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GOOGLE_PLACES_STORE_TIMEOUT_MS),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
        `Google Places trả về HTTP ${response.status}.`,
    );
    error.code = payload?.error?.status || "GOOGLE_PLACES_ERROR";
    error.statusCode = response.status;
    error.details = payload?.error || payload;
    throw error;
  }

  return {
    places: Array.isArray(payload.places) ? payload.places : [],
    nextPageToken: storeCleanText(payload.nextPageToken, 2000),
  };
}

function calculateStoreDistanceKm(
  latitude1,
  longitude1,
  latitude2,
  longitude2,
) {
  if (![latitude1, longitude1, latitude2, longitude2].every(Number.isFinite)) {
    return null;
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(latitude2 - latitude1);
  const deltaLongitude = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(deltaLongitude / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function filterGoogleStores(
  stores = [],
  { province = "", district = "", query = "" } = {},
) {
  const provinceKey = normalizeStoreSearchText(province);
  const districtKey = normalizeStoreSearchText(district);
  const queryKey = normalizeStoreSearchText(query);

  return stores.filter((store) => {
    const searchable = normalizeStoreSearchText(
      [
        store.name,
        store.address,
        store.province,
        store.district,
        store.phone,
      ].join(" "),
    );

    if (provinceKey && !searchable.includes(provinceKey)) return false;
    if (districtKey && !searchable.includes(districtKey)) return false;
    if (queryKey && !searchable.includes(queryKey)) return false;
    return true;
  });
}

function getOfficialStoreProvinceSlug(province = "") {
  return String(province || "ho-chi-minh")
    .trim()
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ho-chi-minh";
}

function getOfficialStoreDistrict(name = "") {
  const match = String(name).match(/(?:Q\.?|Quận|Huyện|TP\.?|Thành phố)\s*([^,]+)/i);
  return storeCleanText(match?.[0] || "", 120);
}

function normalizeOfficialStore(schemaStore = {}, province = "") {
  const latitude = Number(schemaStore.geo?.latitude);
  const longitude = Number(schemaStore.geo?.longitude);
  const fullName = storeCleanText(schemaStore.name || "CellphoneS", 400);
  return {
    id: `official-${normalizeStoreSearchText(fullName).replace(/\s+/g, "-")}`,
    placeId: "",
    system: "cellphones",
    name: fullName,
    address: fullName.replace(/^CellphoneS\s*/i, ""),
    province: normalizeStoreProvince(schemaStore.address?.addressLocality || province),
    district: getOfficialStoreDistrict(fullName),
    phone: storeCleanText(schemaStore.telephone, 80),
    openingHours: ["08:00 - 22:00 (tất cả các ngày trong tuần)"],
    openNow: null,
    businessStatus: "OPERATIONAL",
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    googleMapsUri: "",
    source: "cellphones-official",
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchOfficialCellphoneStores({ province = "", district = "", query = "" } = {}) {
  const slug = getOfficialStoreProvinceSlug(province);
  const sourceUrl = `https://cellphones.com.vn/dia-chi-cua-hang/${slug}`;
  const response = await fetch(sourceUrl, {
    headers: { "User-Agent": DEFAULT_USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(GOOGLE_PLACES_STORE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`CellphoneS trả về HTTP ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);
  const candidates = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const payload = JSON.parse($(element).text());
      const entries = Array.isArray(payload) ? payload : [payload];
      entries.forEach((entry) => {
        if (entry?.["@type"] !== "Store") return;
        candidates.push(entry, ...(Array.isArray(entry.department) ? entry.department : []));
      });
    } catch {}
  });
  const seen = new Set();
  const stores = candidates.map((entry) => normalizeOfficialStore(entry, province)).filter((store) => {
    const key = normalizeStoreSearchText(`${store.name}|${store.latitude}|${store.longitude}`);
    if (!store.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    stores: filterGoogleStores(stores, { province, district, query }),
    sourceUrl,
  };
}

async function searchCellphoneStores(options = {}) {
  const province = storeCleanText(options.province, 120);
  const district = storeCleanText(options.district, 120);
  const query = storeCleanText(options.query, 160);
  const pageSize = Math.max(1, Math.min(Number(options.pageSize) || 20, 20));
  const maxPages = Math.max(
    1,
    Math.min(Number(options.maxPages) || GOOGLE_PLACES_STORE_MAX_PAGES, 3),
  );
  const latitude = Number(options.latitude);
  const longitude = Number(options.longitude);
  const radius = Math.max(
    1000,
    Math.min(Number(options.radius) || 50000, 50000),
  );
  const forceRefresh = Boolean(options.forceRefresh);
  const normalizedOptions = {
    province,
    district,
    query,
    pageSize,
    maxPages,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    radius,
  };
  const cacheKey = getStoreCacheKey(normalizedOptions);

  if (!forceRefresh) {
    const cached = getCachedStoreSearch(cacheKey);
    if (cached) return { ...cached, cached: true };
  }

  try {
    const official = await fetchOfficialCellphoneStores(normalizedOptions);
    if (official.stores.length) {
      let stores = official.stores;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        stores = stores.map((store) => ({ ...store, distanceKm: calculateStoreDistanceKm(latitude, longitude, Number(store.latitude), Number(store.longitude)) })).sort((first, second) => (first.distanceKm ?? Infinity) - (second.distanceKm ?? Infinity));
      }
      const officialResult = { stores, googleQuery: "", officialSourceUrl: official.sourceUrl, pagesFetched: 1, resultCount: stores.length, cached: false, fetchedAt: new Date().toISOString() };
      setCachedStoreSearch(cacheKey, officialResult);
      return officialResult;
    }
  } catch (error) {
    console.warn("[stores] Không tải được nguồn CellphoneS, chuyển sang Google Places:", error.message);
  }

  const textQuery = buildGoogleStoreTextQuery(normalizedOptions);
  const rawPlaces = [];
  let nextPageToken = "";
  let pagesFetched = 0;

  do {
    const page = await requestGoogleStorePage({
      textQuery,
      pageSize,
      pageToken: nextPageToken,
      latitude: normalizedOptions.latitude,
      longitude: normalizedOptions.longitude,
      radius,
    });
    rawPlaces.push(...page.places);
    nextPageToken = page.nextPageToken;
    pagesFetched += 1;
  } while (nextPageToken && pagesFetched < maxPages);

  const seen = new Set();
  let stores = rawPlaces
    .filter(isCellphoneSPlace)
    .map(normalizeGoogleStore)
    .filter((store) => {
      const key =
        store.placeId ||
        normalizeStoreSearchText(`${store.name}|${store.address}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  stores = filterGoogleStores(stores, normalizedOptions);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    stores = stores
      .map((store) => ({
        ...store,
        distanceKm: calculateStoreDistanceKm(
          latitude,
          longitude,
          Number(store.latitude),
          Number(store.longitude),
        ),
      }))
      .sort((first, second) => {
        if (first.distanceKm === null) return 1;
        if (second.distanceKm === null) return -1;
        return first.distanceKm - second.distanceKm;
      });
  } else {
    stores.sort(
      (first, second) =>
        first.province.localeCompare(second.province, "vi") ||
        first.district.localeCompare(second.district, "vi") ||
        first.name.localeCompare(second.name, "vi"),
    );
  }

  const result = {
    stores,
    googleQuery: textQuery,
    pagesFetched,
    resultCount: stores.length,
    cached: false,
    fetchedAt: new Date().toISOString(),
  };
  setCachedStoreSearch(cacheKey, result);
  return result;
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
  return (
    String(value)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "san-pham-moi"
  );
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
  if (!host || !port)
    throw new Error("Invalid proxy format. Use host:port:user:password.");
  if (!username) return `http://${host}:${port}`;

  return `http://${encodeURIComponent(username)}:${encodeURIComponent(passwordParts.join(":"))}@${host}:${port}`;
}

function nextLazyProxy() {
  if (!lazyProxyPool)
    lazyProxyPool = createProxyPool(process.env.SCRAPER_PROXIES || "");
  if (lazyProxyPool.length === 0) return null;

  const proxy = lazyProxyPool[lazyProxyCursor % lazyProxyPool.length];
  lazyProxyCursor += 1;
  return proxy;
}

function shouldRetryScrapeError(error) {
  if (!error?.statusCode) return true;
  if ([404, 410].includes(error.statusCode)) return false;
  return [403, 408, 425, 429, 500, 502, 503, 504, 520, 522, 524].includes(
    error.statusCode,
  );
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
    const error = new Error(
      `HTTP ${response.status} ${response.statusText} for ${url}`,
    );
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
        console.warn(
          `[lazy-detail-retry] ${url}: ${error.message}${error.proxyId ? ` via ${error.proxyId}` : ""}`,
        );
      }
    }
  }

  throw lastError;
}

function getLazyScrapeKey(url = "") {
  return String(url || "")
    .trim()
    .toLowerCase();
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
    const error = new Error(
      "Lazy scrape is disabled. Use LAZY_SCRAPE_ENABLED=true or ?lazy=true to enable on-demand scraping.",
    );
    error.code = "LAZY_SCRAPE_DISABLED";
    throw error;
  }

  const key = getLazyScrapeKey(url);
  if (!force) {
    const cooldown = getLazyScrapeCooldown(url);
    if (cooldown) {
      const error = new Error(
        `Lazy scrape is cooling down after previous failure: ${cooldown.message}`,
      );
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
      if (
        !["LAZY_SCRAPE_DISABLED", "LAZY_SCRAPE_COOLDOWN"].includes(error.code)
      ) {
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
  return product.rawProductJsonLd &&
    typeof product.rawProductJsonLd === "object"
    ? product.rawProductJsonLd
    : {};
}

function getRawOffer(product = {}) {
  const raw = getRawProductJsonLd(product);
  return Array.isArray(raw.offers) ? raw.offers[0] || {} : raw.offers || {};
}

function normalizeSchemaAvailability(value) {
  const text =
    typeof value === "string" ? value : value?.status || value?.raw || "";
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
  const categories = Array.isArray(product.categories)
    ? product.categories.filter(Boolean)
    : [];
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
  if (
    Array.isArray(product.categoryTrail) &&
    product.categoryTrail.length > 0
  ) {
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

  const categories = Array.isArray(product.categories)
    ? product.categories
    : [];
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
  const fallbackSpecifications = specifications.some(
    (group) => group.rows?.length,
  )
    ? specifications
    : buildFallbackSpecificationsFromProduct(product);

  return {
    id: String(product._id || product.id || product.sku || slug),
    mongoId: product._id ? String(product._id) : null,
    source: product.source || "admin",
    url: product.url || product.detailUrl || "",
    sku: product.sku || slug,
    slug,
    detailBacked: Boolean(
      product.detailBacked || product.detailAvailable || product.detailSlug,
    ),
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
    ratingCount:
      typeof product.ratingCount === "number" ? product.ratingCount : null,
    installment: product.installment,
    stock: Number.isFinite(Number(product.stock))
      ? Number(product.stock)
      : null,
    inventory: Number.isFinite(Number(product.inventory))
      ? Number(product.inventory)
      : null,
    facets: product.facets || {},
    currentPrice: price,
    originalPrice: toPositiveNumber(product.originalPrice) || price,
    priceCurrency: product.priceCurrency || "VND",
    availability:
      normalizeAvailability(product.availability) ||
      normalizeSchemaAvailability(getRawOffer(product).availability),
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
    description:
      product.description || getRawProductJsonLd(product).description || "",
    sourceUrls: product.sourceUrls || [],
    scrapedAt: product.scrapedAt,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      values.filter((value) => typeof value === "string" && value.trim()),
    ),
  ];
}

function getMultiSearchParam(searchParams, names = []) {
  const paramNames = Array.isArray(names) ? names : [names];
  const values = paramNames.flatMap((name) => searchParams.getAll(name));
  const seen = new Set();

  return values
    .flatMap((value) => String(value || "").split("|"))
    .map((value) => value.trim())
    .filter((value) => {
      if (!value) return false;
      const key = normalizeSearchKey(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildAnyCondition(values = [], buildCondition) {
  const conditions = values
    .map((value) => buildCondition(value))
    .filter((condition) => condition && Object.keys(condition).length > 0);

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { $or: conditions };
}

function buildListQuery(searchParams) {
  const query = {};
  const source = searchParams.get("source") || "cellphones";
  const q = searchParams.get("q");
  const category = searchParams.get("category");
  const brands = getMultiSearchParam(searchParams, "brand");
  const segment = searchParams.get("segment");
  const inStock = searchParams.get("inStock");
  const filter = searchParams.get("filter");
  const productTypeValues = getMultiSearchParam(searchParams, [
    "productType",
    "product_type",
  ]);
  const facet = searchParams.get("facet");
  const priceMin = toPositiveNumber(
    searchParams.get("priceMin") ||
      searchParams.get("price_min") ||
      searchParams.get("minPrice"),
  );
  const priceMax = toPositiveNumber(
    searchParams.get("priceMax") ||
      searchParams.get("price_max") ||
      searchParams.get("maxPrice"),
  );
  const ramValues = getMultiSearchParam(searchParams, "ram");
  const storageValues = getMultiSearchParam(searchParams, "storage");
  const screenSizeValues = getMultiSearchParam(searchParams, [
    "screen_size",
    "screenSize",
  ]);
  const usageValues = getMultiSearchParam(searchParams, "usage");
  const displayValues = getMultiSearchParam(searchParams, "display");
  const cameraValues = getMultiSearchParam(searchParams, "camera");
  const refreshRateValues = getMultiSearchParam(searchParams, [
    "refresh_rate",
    "refreshRate",
  ]);
  const specialValues = getMultiSearchParam(searchParams, [
    "special",
    "capability",
  ]);
  const nfcValues = getMultiSearchParam(searchParams, "nfc");
  const networkValues = getMultiSearchParam(searchParams, "network");
  const chipsetValues = getMultiSearchParam(searchParams, "chipset");
  const cpuValues = getMultiSearchParam(searchParams, "cpu");
  const gpuValues = getMultiSearchParam(searchParams, "gpu");
  const resolutionValues = getMultiSearchParam(searchParams, "resolution");
  const phoneTypeValues = getMultiSearchParam(searchParams, [
    "phoneType",
    "phone_type",
  ]);
  const audioFeatureValues = getMultiSearchParam(searchParams, [
    "audioFeature",
    "audio_feature",
  ]);
  const audioConnectionValues = getMultiSearchParam(searchParams, [
    "audioConnection",
    "audio_connection",
  ]);
  const audioUsageValues = getMultiSearchParam(searchParams, [
    "audioUsage",
    "audio_usage",
  ]);
  const audioTypeValues = getMultiSearchParam(searchParams, [
    "audioType",
    "audio_type",
  ]);
  const audioPowerValues = getMultiSearchParam(searchParams, [
    "audioPower",
    "audio_power",
  ]);
  const audioDesignValues = getMultiSearchParam(searchParams, [
    "audioDesign",
    "audio_design",
  ]);
  const audioLineValues = getMultiSearchParam(searchParams, [
    "audioLine",
    "audio_line",
  ]);
  const audioTransmissionValues = getMultiSearchParam(searchParams, [
    "audioTransmission",
    "audio_transmission",
  ]);

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

  if (category) {
    const requestedCategories = category
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
    appendAndCondition(
      query,
      requestedCategories.length > 1
        ? {
            $or: requestedCategories.map((item) =>
              buildCategoryCondition(item),
            ),
          }
        : buildCategoryCondition(category),
    );
  }
  const requestedBrands = brands.filter(
    (brand) => normalizeSearchKey(brand) !== "all",
  );
  if (requestedBrands.length) {
    appendAndCondition(
      query,
      buildAnyCondition(requestedBrands, buildBrandCondition),
    );
  }
  if (segment) appendAndCondition(query, buildSegmentCondition(segment));
  const facetKey = normalizeSearchKey(facet).replace(/[^a-z0-9]+/g, "-");
  const concreteFacetValues = {
    ram: ramValues,
    storage: storageValues,
    "screen-size": screenSizeValues,
    usage: usageValues,
    display: displayValues,
    camera: cameraValues,
    "refresh-rate": refreshRateValues,
    special: specialValues,
    nfc: nfcValues,
    network: networkValues,
    chipset: chipsetValues,
    cpu: cpuValues,
    gpu: gpuValues,
    resolution: resolutionValues,
    "phone-type": phoneTypeValues,
  };
  if (facet && !concreteFacetValues[facetKey]?.length)
    appendAndCondition(query, buildFacetCondition(facet));
  if (filter) appendAndCondition(query, buildFilterCondition(filter));
  if (productTypeValues.length) {
    appendAndCondition(
      query,
      buildAnyCondition(productTypeValues, buildProductTypeCondition),
    );
  }
  const anyFeatureConditions = [
    ["ram", ramValues],
    ["storage", storageValues],
    ["screen-size", screenSizeValues],
    ["usage", usageValues],
    ["display", displayValues],
    ["camera", cameraValues],
    ["refresh-rate", refreshRateValues],
    ["chipset", chipsetValues],
    ["cpu", cpuValues],
    ["gpu", gpuValues],
    ["resolution", resolutionValues],
  ];

  for (const [kind, values] of anyFeatureConditions) {
    if (!values.length) continue;
    appendAndCondition(
      query,
      buildAnyCondition(values, (value) =>
        buildFeatureValueCondition(kind, value),
      ),
    );
  }

  if (phoneTypeValues.length) {
    appendAndCondition(
      query,
      buildAnyCondition(phoneTypeValues, buildPhoneTypeCondition),
    );
  }

  // Capability values describe independent requirements: selecting NFC and 5G
  // means the product must support both. Values inside the dedicated NFC or
  // network facets remain alternatives of that facet.
  for (const special of specialValues) {
    appendAndCondition(query, buildFeatureValueCondition("special", special));
  }
  if (nfcValues.length) {
    const normalizedNfcValues = nfcValues.map((value) =>
      ["1", "true", "yes", "co"].includes(normalizeSearchKey(value))
        ? "NFC"
        : value,
    );
    appendAndCondition(
      query,
      buildAnyCondition(normalizedNfcValues, (value) =>
        buildFeatureValueCondition("special", value),
      ),
    );
  }
  if (networkValues.length) {
    appendAndCondition(
      query,
      buildAnyCondition(networkValues, (value) =>
        buildFeatureValueCondition("special", value),
      ),
    );
  }

  const audioFeatureConditions = [
    ["audio-feature", audioFeatureValues],
    ["audio-connection", audioConnectionValues],
    ["audio-usage", audioUsageValues],
    ["audio-type", audioTypeValues],
    ["audio-power", audioPowerValues],
    ["audio-design", audioDesignValues],
    ["audio-line", audioLineValues],
    ["audio-transmission", audioTransmissionValues],
  ];
  for (const [kind, values] of audioFeatureConditions) {
    if (!values.length) continue;
    appendAndCondition(
      query,
      buildAnyCondition(values, (value) =>
        buildAudioFeatureCondition(kind, value),
      ),
    );
  }
  if (priceMin || priceMax)
    appendAndCondition(query, buildPriceRangeCondition(priceMin, priceMax));

  if (inStock === "true") appendAndCondition(query, buildStockCondition(true));
  if (inStock === "false")
    appendAndCondition(query, buildStockCondition(false));

  return query;
}

function buildStockCondition(inStock = true) {
  const inStockRegex =
    /(?:^|\/|#)InStock$|C.n h.ng|Còn hàng|Con hang|Sẵn hàng|San hang/i;
  const outOfStockRegex =
    /(?:^|\/|#)OutOfStock$|Li.n h.|H.t h.ng|Hết hàng|Het hang|Ngừng bán|Ngung ban/i;

  if (inStock) {
    return {
      $or: [
        { "availability.status": inStockRegex },
        { availability: inStockRegex },
        { "rawProductJsonLd.offers.availability": inStockRegex },
        { "rawProductJsonLd.offers.0.availability": inStockRegex },
        { stockStatus: inStockRegex },
        { inStock: true },
        { stock: { $gt: 0 } },
        { inventory: { $gt: 0 } },
        { "inventory.stock": { $gt: 0 } },
        { statusLabel: inStockRegex },
        // Dữ liệu cũ có thể chưa có trường tồn kho. Không loại bỏ các sản phẩm
        // này khi không có bất kỳ tín hiệu hết hàng nào.
        {
          $and: [
            { availability: { $exists: false } },
            { "availability.status": { $exists: false } },
            { "rawProductJsonLd.offers.availability": { $exists: false } },
            { "rawProductJsonLd.offers.0.availability": { $exists: false } },
            { stockStatus: { $exists: false } },
            { inStock: { $exists: false } },
            { stock: { $exists: false } },
            { inventory: { $exists: false } },
            { statusLabel: { $exists: false } },
          ],
        },
      ],
    };
  }

  return {
    $or: [
      { "availability.status": outOfStockRegex },
      { availability: outOfStockRegex },
      { "rawProductJsonLd.offers.availability": outOfStockRegex },
      { "rawProductJsonLd.offers.0.availability": outOfStockRegex },
      { stockStatus: outOfStockRegex },
      { inStock: false },
      { stock: { $lte: 0 } },
      { inventory: { $lte: 0 } },
      { "inventory.stock": { $lte: 0 } },
      { statusLabel: outOfStockRegex },
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
      {
        $and: [
          {
            $or: [{ currentPrice: { $exists: false } }, { currentPrice: null }],
          },
          { price: range },
        ],
      },
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
        specifications: {
          $elemMatch: {
            $or: [
              { label: labelRegex, value: valueRegex },
              { name: labelRegex, value: valueRegex },
            ],
          },
        },
      },
    ],
  };
}

function getFeatureLabelRegex(kind = "", normalizedValue = "") {
  if (kind === "ram")
    return /ram|bộ nhớ ram|bo nho ram|dung lượng ram|dung luong ram/i;
  if (kind === "storage")
    return /bộ nhớ trong|bo nho trong|dung lượng lưu trữ|dung luong luu tru|rom|storage|ổ cứng|o cung|ssd|hdd/i;
  if (kind === "screen-size")
    return /kích thước màn hình|kich thuoc man hinh|màn hình|man hinh|screen size|display/i;
  if (kind === "display")
    return /công nghệ màn hình|cong nghe man hinh|loại màn hình|loai man hinh|tấm nền|tam nen|màn hình|man hinh|display/i;
  if (kind === "camera")
    return /camera|camera sau|camera trước|camera truoc|tính năng camera|tinh nang camera|quay video/i;
  if (kind === "refresh-rate")
    return /tần số quét|tan so quet|tốc độ làm mới|toc do lam moi|refresh|màn hình|man hinh|display|tính năng màn hình|tinh nang man hinh/i;
  if (kind === "usage")
    return /chipset|cpu|gpu|pin|battery|camera|màn hình|man hinh|tần số quét|tan so quet|tính năng|tinh nang|hiệu năng|hieu nang/i;
  if (kind === "chipset")
    return /chipset|chip xử lý|chip xu ly|bộ xử lý|bo xu ly|cpu|soc|vi xử lý|vi xu ly/i;
  if (kind === "phone-type")
    return /hệ điều hành|he dieu hanh|operating system|os|nền tảng|nen tang/i;

  if (kind === "cpu")
    return /cpu|processor|chipset|chip xử lý|chip xu ly|bộ xử lý|bo xu ly|vi xử lý|vi xu ly|dòng cpu|dong cpu|công nghệ cpu|cong nghe cpu/i;
  if (kind === "gpu")
    return /gpu|vga|graphics|card đồ họa|card do hoa|chip đồ họa|chip do hoa|bộ xử lý đồ họa|bo xu ly do hoa/i;
  if (kind === "resolution")
    return /độ phân giải|do phan giai|resolution|screen resolution|màn hình|man hinh|display/i;

  if (kind === "special") {
    if (normalizedValue.includes("nfc"))
      return /nfc|công nghệ nfc|cong nghe nfc|kết nối|ket noi/i;
    if (normalizedValue.includes("5g"))
      return /hỗ trợ mạng|ho tro mang|mạng|mang|5g|kết nối|ket noi/i;
    if (normalizedValue.includes("sac")) return /sạc|sac|pin|battery|charging/i;
    if (
      normalizedValue.includes("khang") ||
      normalizedValue.includes("chong nuoc")
    )
      return /kháng nước|khang nuoc|chống nước|chong nuoc|chuẩn kháng|chuan khang|ip/i;
    if (normalizedValue.includes("wifi") || normalizedValue.includes("wi-fi"))
      return /wifi|wi-fi|kết nối|ket noi/i;
    if (normalizedValue.includes("bluetooth"))
      return /bluetooth|kết nối|ket noi/i;
    if (
      normalizedValue.includes("cam ung") ||
      normalizedValue.includes("touch")
    ) {
      return /cảm ứng|cam ung|touch|touchscreen|tính năng đặc biệt|tinh nang dac biet/i;
    }
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
      ? new RegExp(
          `\\b${escapeRegex(number)}\\s?gb\\s?(ram)?\\b|ram\\s?${escapeRegex(number)}\\s?gb`,
          "i",
        )
      : new RegExp(escaped, "i");
  }

  if (kind === "storage") {
    const number = compact.match(/\d+/)?.[0];
    const unit = compact.includes("tb") ? "tb" : "gb";
    return number
      ? new RegExp(
          `\\b${escapeRegex(number)}\\s?${unit}\\b|${compactEscaped}`,
          "i",
        )
      : new RegExp(`${escaped}|${compactEscaped}`, "i");
  }

  if (kind === "screen-size") {
    if (normalized.includes("duoi") && normalized.includes("6")) {
      return /\b([4-5](?:\.\d+)?)\s?(inch|inches|"|”|in)\b/i;
    }
    if (/6\s*[-–]\s*6[.,]4/.test(normalized)) {
      return /\b6(?:[.,][0-4])?\s?(inch|inches|"|”|in)\b/i;
    }
    if (/6[.,]5\s*[-–]\s*6[.,]7/.test(normalized)) {
      return /\b6[.,][5-7]\s?(inch|inches|"|”|in)\b/i;
    }
    if (
      normalized.includes("tren") &&
      (normalized.includes("6.7") ||
        normalized.includes("6,7") ||
        normalized.includes("6.8") ||
        normalized.includes("6,8"))
    ) {
      return /\b(6[.,][89]|7(?:[.,]\d+)?|8(?:[.,]\d+)?|9(?:[.,]\d+)?|1[0-9](?:[.,]\d+)?|2[0-9](?:[.,]\d+)?|3[0-9](?:[.,]\d+)?)\s?(inch|inches|"|”|in)\b/i;
    }
    const number = normalized.replace(/,/g, ".").match(/\d+(?:\.\d+)?/)?.[0];
    return number
      ? new RegExp(
          `${escapeRegex(number).replace("\\.", "[.,]")}\\s?(inch|inches|\"|”|in)`,
          "i",
        )
      : new RegExp(escaped, "i");
  }

  if (kind === "refresh-rate") {
    const number = compact.match(/\d+/)?.[0];
    return number
      ? new RegExp(`\\b${escapeRegex(number)}\\s?hz\\b`, "i")
      : new RegExp(escaped, "i");
  }

  if (kind === "camera") {
    if (normalized.includes("ois") || normalized.includes("chong rung"))
      return /ois|chống rung|chong rung|quang học|quang hoc/i;
    if (normalized.includes("zoom") || normalized.includes("tele"))
      return /zoom|telephoto|tele|tiềm vọng|tiem vong/i;
    if (normalized.includes("sieu rong") || normalized.includes("goc"))
      return /siêu rộng|sieu rong|ultra wide|góc rộng|goc rong/i;
    if (normalized.includes("8k")) return /8k|7680\s*[x×]\s*4320/i;
    if (normalized.includes("4k")) return /4k|uhd|3840\s*[x×]\s*2160/i;
    if (normalized.includes("ai"))
      return /\bai\b|smart hdr|deep fusion|xử lý ảnh|xu ly anh/i;
    if (normalized.includes("chup dem")) return /chụp đêm|chup dem|night/i;
    return new RegExp(escaped, "i");
  }

  if (kind === "usage") {
    if (normalized.includes("choi game"))
      return /gaming|game|gpu|chipset|snapdragon|dimensity|apple a\d+|120\s?hz|144\s?hz|165\s?hz|tản nhiệt|tan nhiet/i;
    if (normalized.includes("chup anh"))
      return /camera|ois|zoom|chụp|chup|leica|zeiss|hasselblad|48\s?mp|50\s?mp|108\s?mp|200\s?mp/i;
    if (normalized.includes("pin trau") || normalized.includes("pin lau"))
      return /pin|battery|5000\s?mah|6000\s?mah|7000\s?mah|8000\s?mah|10000\s?mah/i;
    if (normalized.includes("mong nhe"))
      return /mỏng nhẹ|mong nhe|trọng lượng|trong luong|thin|light/i;
    if (normalized.includes("van phong") || normalized.includes("hoc tap"))
      return /office|văn phòng|van phong|học tập|hoc tap|core i3|core i5|ryzen 5|ram|ssd/i;
    if (normalized.includes("do hoa") || normalized.includes("thiet ke"))
      return /gpu|rtx|geforce|radeon|màn hình|man hinh|oled|ips|dci-p3|đồ họa|do hoa/i;
    if (normalized.includes("cao cap") || normalized.includes("sang trong")) {
      return /premium|cao cấp|cao cap|sang trọng|sang trong|zenbook|spectre|xps|thinkpad\s*x1|yoga\s+(?:slim|pro)|macbook\s+pro|prestige/i;
    }
    if (normalized.includes("sang tao") || normalized.includes("creator")) {
      return /creator|studio|sáng tạo|sang tao|content creation|dci-p3|adobe rgb|rtx|geforce/i;
    }
    return new RegExp(escaped, "i");
  }

  if (kind === "chipset") {
    if (normalized.includes("snapdragon")) return /snapdragon/i;
    if (normalized.includes("apple-m"))
      return /apple\s?m\d+|\bm\d+(\s?(pro|max|ultra))?\b/i;
    if (normalized.includes("apple-a") || normalized === "apple")
      return /apple\s?a\d+|\ba\d{2}(\s?pro|\s?bionic)?\b/i;
    if (normalized.includes("dimensity")) return /dimensity/i;
    if (normalized.includes("helio")) return /helio/i;
    if (normalized.includes("exynos")) return /exynos/i;
    if (normalized.includes("tensor"))
      return /google\s+tensor|\btensor\s+g?\d+/i;
    if (normalized.includes("kirin")) return /kirin/i;
    if (normalized.includes("unisoc")) return /unisoc|spreadtrum/i;
    return new RegExp(escaped, "i");
  }

  if (kind === "cpu") {
    if (normalized.includes("core ultra")) {
      const tier = normalized.match(/\b([579])\b/)?.[1];
      return tier
        ? new RegExp(
            `(?:intel\\s+)?core\\s+ultra\\s+${tier}\\b|\\bultra\\s+${tier}\\b`,
            "i",
          )
        : /(?:intel\s+)?core\s+ultra/i;
    }
    const intelTier = normalized.match(/core\s+i([3579])/)?.[1];
    if (intelTier) {
      return new RegExp(
        `(?:intel\\s+)?(?:core\\s+)?i${intelTier}(?:[-\\s]\\d+|\\b)`,
        "i",
      );
    }
    const ryzenTier = normalized.match(/ryzen\s+([3579])/)?.[1];
    if (ryzenTier)
      return new RegExp(
        `(?:amd\\s+)?ryzen\\s+${ryzenTier}(?:[-\\s]\\d+|\\b)`,
        "i",
      );
    if (normalized.includes("apple m series") || normalized === "apple m") {
      return /(?:apple\s+)?m\d+(?:\s+(?:pro|max|ultra))?\b/i;
    }
    const appleGeneration = normalized.match(/apple\s+m([345])/)?.[1];
    if (appleGeneration)
      return new RegExp(
        `(?:apple\\s+)?m${appleGeneration}(?:\\s+(?:pro|max|ultra))?\\b`,
        "i",
      );
    if (normalized.includes("snapdragon x plus"))
      return /snapdragon\s+x\s+plus/i;
    if (normalized.includes("snapdragon x elite"))
      return /snapdragon\s+x\s+elite/i;
    return new RegExp(escaped, "i");
  }

  if (kind === "gpu") {
    const rtxModel = normalized.match(/rtx\s*(\d{4})/)?.[1];
    if (rtxModel)
      return new RegExp(
        `(?:nvidia\\s+)?(?:geforce\\s+)?rtx\\s*${rtxModel}\\b`,
        "i",
      );
    if (normalized.includes("nvidia") || normalized.includes("geforce"))
      return /nvidia|geforce|\brtx\s*\d{4}\b|\bgtx\s*\d{3,4}\b/i;
    if (normalized.includes("amd") || normalized.includes("radeon"))
      return /amd\s+radeon|radeon(?:\s+(?:graphics|rx\s*\d+))?/i;
    if (normalized.includes("onboard") || normalized.includes("tich hop")) {
      return /onboard|integrated|tích hợp|tich hop|intel\s+(?:uhd|iris|graphics)|apple\s+\d+\s*core\s*gpu|radeon\s+graphics/i;
    }
    return new RegExp(escaped, "i");
  }

  if (kind === "resolution") {
    if (["full hd", "fhd", "full hd+", "fhd+"].includes(normalized))
      return /full\s*hd\+?|\bfhd\+?\b|1920\s*[x×]\s*(?:1080|1200)/i;
    if (normalized === "2k") return /\b2k\b|2560\s*[x×]\s*1440/i;
    if (normalized === "2.5k" || normalized === "2,5k")
      return /\b2[.,]5k\b|2560\s*[x×]\s*(?:1600|1664)|2520\s*[x×]\s*1680/i;
    if (normalized === "wqhd") return /\bwqhd\+?\b|2560\s*[x×]\s*1440/i;
    if (normalized === "wuxga") return /\bwuxga\b|1920\s*[x×]\s*1200/i;
    if (normalized === "2.8k") return /\b2[.,]8k\b|2880\s*[x×]\s*1800/i;
    if (normalized === "3k")
      return /\b3k\b|2880\s*[x×]\s*1920|3000\s*[x×]\s*2000/i;
    if (normalized === "3.2k") return /\b3[.,]2k\b|3200\s*[x×]\s*2000/i;
    if (normalized === "4k") return /\b4k\b|\buhd\b|3840\s*[x×]\s*2160/i;
    if (normalized === "wqxga") return /\bwqxga\+?\b|2560\s*[x×]\s*1600/i;
    if (normalized === "retina") return /retina/i;
    if (normalized === "5k") return /\b5k\b|5120\s*[x×]\s*2880/i;
    return new RegExp(escaped, "i");
  }

  if (kind === "phone-type") {
    if (
      normalized.includes("iphone") ||
      normalized.includes("ios") ||
      normalized.includes("ipados")
    )
      return /ios|ipados|iphone\s?os/i;
    if (normalized.includes("android")) return /android/i;
    if (normalized.includes("harmony")) return /harmony\s?os/i;
    if (normalized.includes("gap") || normalized.includes("fold"))
      return /điện thoại gập|dien thoai gap|fold|flip|foldable|galaxy\s+z|find\s+n|magic\s+v|mix\s+fold|razr|mate\s+x/i;
    if (normalized.includes("pho thong"))
      return /feature phone|kaios|series\s?30|s30\+|proprietary/i;
    return new RegExp(escaped, "i");
  }

  if (kind === "special") {
    if (normalized.includes("nfc")) return /có|co|yes|nfc/i;
    if (normalized.includes("5g")) return /5g/i;
    if (normalized.includes("sac nhanh"))
      return /sạc nhanh|sac nhanh|fast charge|[0-9]{2,3}\s?w/i;
    if (normalized.includes("sac khong day"))
      return /sạc không dây|sac khong day|wireless|magsafe|qi/i;
    if (
      normalized.includes("chong nuoc") ||
      normalized.includes("khang nuoc") ||
      normalized.includes("ip68")
    )
      return /ip\d{2}|ipx\d|kháng nước|khang nuoc|chống nước|chong nuoc|water resistant/i;
    if (
      normalized.includes("man hinh gap") ||
      normalized.includes("dien thoai gap") ||
      normalized.includes("fold")
    )
      return /màn hình gập|man hinh gap|điện thoại gập|dien thoai gap|fold|flip|foldable|galaxy\s+z|find\s+n|magic\s+v|mix\s+fold|razr|mate\s+x/i;
    if (normalized.includes("magsafe")) return /magsafe/i;
    if (normalized.includes("wifi") || normalized.includes("wi-fi"))
      return /wi-?fi\s?(6|7)|wifi\s?(6|7)/i;
    if (normalized.includes("bluetooth")) return /bluetooth\s?5(?:\.\d+)?/i;
    if (normalized.includes("cam ung") || normalized.includes("touch")) {
      return /cảm ứng|cam ung|touch|touchscreen|2[\s-]?in[\s-]?1|convertible|x360/i;
    }
    if (normalized.includes("intel evo")) return /intel\s+evo|\bevo\b/i;
    if (normalized.includes("van tay") || normalized.includes("fingerprint")) {
      return /vân tay|van tay|fingerprint|touch\s*id/i;
    }
    if (normalized.includes("xoay gap") || normalized.includes("360")) {
      return /xoay gập|xoay gap|gập 360|gap 360|360\s*(?:độ|do|degree)|2[\s-]?in[\s-]?1|convertible|x360/i;
    }
    if (
      normalized.includes("nhan dien khuon mat") ||
      normalized.includes("face")
    ) {
      return /nhận diện khuôn mặt|nhan dien khuon mat|face\s*(?:id|recognition)|windows\s+hello/i;
    }
    if (normalized.includes("oled")) return /\boled\b/i;
    if (normalized.includes("mux"))
      return /\bmux(?:\s+switch)?\b|advanced optimus/i;
    if (normalized.includes("copilot+"))
      return /copilot\s*\+|copilot\s+plus|copilot\+\s*pc/i;
    if (normalized.includes("copilot")) return /\bcopilot\b/i;
    if (normalized.includes("apple intelligence"))
      return /apple\s+intelligence/i;
    if (normalized.includes("ai")) {
      return /\bai\b|artificial intelligence|copilot|apple intelligence|galaxy ai|\bnpu\b|intel ai boost|ryzen ai/i;
    }
    return new RegExp(escaped, "i");
  }

  return new RegExp(escaped, "i");
}

function buildAudioPowerCondition(value = "") {
  const normalized = normalizeSearchKey(value).replace(/,/g, ".");
  const labelRegex = /công suất|cong suat|power|watt|\bw\b/i;
  let numericRange = null;
  let valueRegex = new RegExp(escapeRegex(value), "i");

  if (normalized.includes("duoi") && normalized.includes("10")) {
    numericRange = { $lt: 10 };
    valueRegex = /\b(?:[0-9](?:[.,]\d+)?)\s?w\b/i;
  } else if (/10\s*w?\s*[-–]\s*30\s*w?/.test(normalized)) {
    numericRange = { $gte: 10, $lte: 30 };
    valueRegex = /\b(?:1[0-9]|2[0-9]|30)(?:[.,]\d+)?\s?w\b/i;
  } else if (/30\s*w?\s*[-–]\s*100\s*w?/.test(normalized)) {
    numericRange = { $gte: 30, $lte: 100 };
    valueRegex = /\b(?:3[0-9]|[4-9][0-9]|100)(?:[.,]\d+)?\s?w\b/i;
  } else if (normalized.includes("tren") && normalized.includes("100")) {
    numericRange = { $gt: 100 };
    valueRegex =
      /\b(?:10[1-9]|1[1-9][0-9]|[2-9][0-9]{2}|[1-9][0-9]{3,})(?:[.,]\d+)?\s?w\b/i;
  }

  const conditions = [
    buildSpecificationRowCondition(labelRegex, valueRegex),
    regexCondition(
      [
        "name",
        "slug",
        "description",
        "trainingLabels.productName",
        "trainingLabels.deviceLine",
        "rawProductJsonLd.name",
        "rawProductJsonLd.description",
      ],
      valueRegex,
    ),
  ];

  if (numericRange) {
    conditions.unshift({ "facets.audioPowerW": numericRange });
  }

  return { $or: conditions };
}

function buildStrictAudioTypeCondition(value = "") {
  const normalized = normalizeSearchKey(value);
  const identityFields = [
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
    "trainingLabels.deviceLine",
    "rawProductJsonLd.name",
  ];
  const searchableFields = [
    ...identityFields,
    "description",
    "rawProductJsonLd.description",
  ];

  const identity = (regex) => regexCondition(identityFields, regex);
  const searchable = (regex) => regexCondition(searchableFields, regex);
  const specification = (labelRegex, valueRegex) =>
    buildSpecificationRowCondition(labelRegex, valueRegex);
  const hasConnection = (valueRegex) => ({
    $or: [
      searchable(valueRegex),
      specification(
        /kết nối|ket noi|cổng kết nối|cong ket noi|chuẩn kết nối|chuan ket noi|giao tiếp|giao tiep/i,
        valueRegex,
      ),
    ],
  });
  const hasDesign = (valueRegex) => ({
    $or: [
      searchable(valueRegex),
      specification(
        /loại tai nghe|loai tai nghe|kiểu đeo|kieu deo|thiết kế|thiet ke|dạng tai nghe|dang tai nghe/i,
        valueRegex,
      ),
    ],
  });

  const headphone = identity(
    /tai nghe|headphone|headset|earphone|earbuds|airpods|galaxy\s+buds|freebuds|redmi\s+buds|soundpeats|wf[-\s]?\w+|wh[-\s]?\w+/i,
  );
  const speaker = identity(
    /(?:^|\b)loa(?:\b|[-\s])|speaker|soundbar|subwoofer|karaoke speaker|studio monitor/i,
  );
  const microphone = identity(
    /microphone|micro(?:\s|$)|\bmic(?:\s|$)|lavalier|clip[-\s]?on/i,
  );
  const turntable = identity(
    /đĩa than|dia than|turntable|record player|mâm đĩa|mam dia/i,
  );

  if (["bluetooth", "tai nghe bluetooth"].includes(normalized)) {
    return {
      $and: [
        headphone,
        hasConnection(
          /bluetooth|không dây|khong day|wireless|true wireless|\btws\b/i,
        ),
      ],
    };
  }

  if (["co day", "tai nghe co day"].includes(normalized)) {
    return {
      $and: [
        headphone,
        hasConnection(
          /có dây|co day|wired|dây dẫn|day dan|3[.,]?5\s?mm|audio jack/i,
        ),
      ],
    };
  }

  if (["chup tai", "tai nghe chup tai"].includes(normalized)) {
    return {
      $and: [headphone, hasDesign(/chụp tai|chup tai|over[-\s]?ear/i)],
    };
  }

  if (["nhet tai", "tai nghe nhet tai"].includes(normalized)) {
    return {
      $and: [
        headphone,
        hasDesign(
          /nhét tai|nhet tai|in[-\s]?ear|earbuds|airpods|galaxy\s+buds|freebuds|redmi\s+buds/i,
        ),
      ],
    };
  }

  if (normalized === "loa bluetooth") {
    return {
      $and: [speaker, hasConnection(/bluetooth|không dây|khong day|wireless/i)],
    };
  }

  if (normalized === "loa karaoke") {
    return {
      $and: [speaker, searchable(/karaoke/i)],
    };
  }

  if (normalized === "soundbar") {
    return identity(/soundbar|loa thanh/i);
  }

  if (normalized === "loa vi tinh") {
    return identity(
      /loa vi tính|loa vi tinh|computer speaker|desktop speaker/i,
    );
  }

  if (normalized === "loa sub") {
    return identity(/loa sub|subwoofer/i);
  }

  if (normalized === "loa cot") {
    return identity(/loa cột|loa cot|column speaker|tower speaker/i);
  }

  if (normalized === "loa tro giang") {
    return identity(/loa trợ giảng|loa tro giang|voice amplifier/i);
  }

  if (normalized === "micro thu am") {
    return {
      $and: [
        microphone,
        searchable(/thu âm|thu am|recording|studio|podcast|livestream/i),
      ],
    };
  }

  if (normalized === "micro karaoke") {
    return {
      $and: [microphone, searchable(/karaoke/i)],
    };
  }

  if (normalized === "micro") return microphone;
  if (normalized === "dia than") return turntable;

  return {};
}

function buildAudioFeatureCondition(kind = "", value = "") {
  const clean = cleanLimitedText(value, 80);
  if (!clean) return {};
  if (kind === "audio-power") return buildAudioPowerCondition(clean);

  if (kind === "audio-type") {
    const strictTypeCondition = buildStrictAudioTypeCondition(clean);
    if (Object.keys(strictTypeCondition).length > 0) return strictTypeCondition;
  }

  const normalized = normalizeSearchKey(clean);
  const textFields = [
    "name",
    "title",
    "productName",
    "slug",
    "sku",
    "brand",
    "category",
    "categories",
    "categoryTrail.name",
    "categoryTrail.label",
    "description",
    "articleTitle",
    "articleSections.heading",
    "articleSections.paragraphs",
    "trainingLabels.labelPathText",
    "trainingLabels.productName",
    "trainingLabels.deviceLine",
    "trainingLabels.deviceGroup",
    "rawProductJsonLd.name",
    "rawProductJsonLd.description",
    "rawProductJsonLd.additionalProperty.name",
    "rawProductJsonLd.additionalProperty.value",
  ];

  const facetFieldsByKind = {
    "audio-feature": [
      "facets.audioFeature",
      "facets.audioFeatures",
      "facets.features",
      "audioFeature",
      "audioFeatures",
      "attributes.audioFeature",
      "attributes.audioFeatures",
      "attributes.features",
    ],
    "audio-connection": [
      "facets.audioConnection",
      "facets.audioConnections",
      "facets.connection",
      "audioConnection",
      "audioConnections",
      "attributes.audioConnection",
      "attributes.connection",
      "attributes.connectivity",
    ],
    "audio-usage": [
      "facets.audioUsage",
      "facets.audioUsages",
      "facets.usage",
      "audioUsage",
      "audioUsages",
      "attributes.audioUsage",
      "attributes.usage",
      "attributes.purpose",
    ],
    "audio-type": [
      "facets.audioType",
      "facets.audioTypes",
      "facets.type",
      "audioType",
      "audioTypes",
      "attributes.audioType",
      "attributes.type",
    ],
    "audio-design": [
      "facets.audioDesign",
      "facets.audioDesigns",
      "facets.design",
      "audioDesign",
      "attributes.audioDesign",
      "attributes.design",
    ],
    "audio-line": [
      "facets.audioLine",
      "facets.productLine",
      "audioLine",
      "attributes.audioLine",
      "attributes.productLine",
    ],
    "audio-transmission": [
      "facets.audioTransmission",
      "facets.codec",
      "audioTransmission",
      "attributes.audioTransmission",
      "attributes.codec",
    ],
  };

  const labelByKind = {
    "audio-feature":
      /tính năng|tinh nang|đặc điểm|dac diem|chống ồn|chong on|khử ồn|khu on|lọc ồn|loc on|chống nước|chong nuoc|kháng nước|khang nuoc|micro|hi-res|karaoke|gaming|bluetooth/i,
    "audio-connection":
      /cổng kết nối|cong ket noi|kết nối|ket noi|chuẩn kết nối|chuan ket noi|giao tiếp|giao tiep|bluetooth|usb|lightning|jack|hdmi|optical/i,
    "audio-usage":
      /nhu cầu|nhu cau|mục đích|muc dich|sử dụng|su dung|ứng dụng|ung dung|thể thao|the thao|gaming|podcast|livestream|karaoke|kiểm âm|kiem am/i,
    "audio-type":
      /loại|loai|kiểu|kieu|danh mục|danh muc|tai nghe|tai-nghe|loa|micro|đĩa than|dia than/i,
    "audio-design":
      /thiết kế|thiet ke|kiểu đeo|kieu deo|dạng tai nghe|dang tai nghe|in-ear|earbuds|over-ear|on-ear|true wireless/i,
    "audio-line":
      /dòng sản phẩm|dong san pham|dòng tai nghe|dong tai nghe|series|airpods/i,
    "audio-transmission":
      /truyền âm|truyen am|kết nối|ket noi|bluetooth|wireless|không dây|khong day|codec|chuẩn âm thanh|chuan am thanh/i,
  };

  const valueRegexByKind = {
    "audio-feature": {
      "chong on":
        /chống\s*(?:tiếng\s*)?ồn|chong\s*(?:tieng\s*)?on|khử\s*(?:tiếng\s*)?ồn|khu\s*(?:tieng\s*)?on|lọc\s*(?:tiếng\s*)?ồn|loc\s*(?:tieng\s*)?on|(?:active|passive|environmental)\s+noise\s+(?:cancel(?:l|ll)?ation|cancel(?:l)?ing|reduction|suppression)|noise\s+(?:cancel(?:l|ll)?ation|cancel(?:l)?ing|reduction|suppression)|\b(?:anc|enc|cvc)\b|dual[-\s]?mic\s+noise/i,
      "chong nuoc":
        /chống\s*nước|chong\s*nuoc|kháng\s*nước|khang\s*nuoc|water[-\s]?(?:proof|resistant)|sweat[-\s]?proof|\bipx[1-9]\b|\bip\d{2}\b/i,
      "co mic":
        /có\s*(?:micro|mic)|co\s*(?:micro|mic)|microphone|(?:^|\b)mic(?:\b|[-\s])|đàm thoại|dam thoai|call(?:ing)?|voice chat/i,
      "am thanh hi-res":
        /âm\s*thanh\s*hi[-\s]?res|am\s*thanh\s*hi[-\s]?res|hi[-\s]?res(?:olution)?|high[-\s]?resolution\s+audio|\bldac\b|lossless/i,
      gaming:
        /\bgaming\b|chơi\s*game|choi\s*game|game\s*mode|gaming\s*headset|độ\s*trễ\s*thấp|do\s*tre\s*thap|low[-\s]?latency|ultra[-\s]?low[-\s]?latency|\b7[.,]?1\b|virtual\s+surround|surround\s+sound|\besports?\b|\brgb\b/i,
      karaoke: /karaoke|hát karaoke|hat karaoke/i,
    },
    "audio-connection": {
      bluetooth:
        /bluetooth|không\s*dây|khong\s*day|wireless|true\s+wireless|\btws\b/i,
      "co day": /có\s*dây|co\s*day|wired|dây\s*dẫn|day\s*dan|audio\s*cable/i,
      "usb-c": /usb\s*-?\s*c|type\s*-?\s*c/i,
      lightning: /lightning/i,
      "jack 3.5mm": /3[.,]?5\s*mm|audio\s*jack|jack\s*3[.,]?5/i,
      "3.5mm": /3[.,]?5\s*mm|audio\s*jack|jack\s*3[.,]?5/i,
      "usb-a": /usb\s*-?\s*a/i,
      hdmi: /hdmi(?:\s*arc|\s*earc)?/i,
      optical: /optical|toslink|s\/pdif|spdif/i,
      "wi-fi": /wi-?fi|wifi/i,
      wifi: /wi-?fi|wifi/i,
    },
    "audio-usage": {
      gaming:
        /\bgaming\b|chơi\s*game|choi\s*game|game\s*mode|gaming\s*headset|độ\s*trễ\s*thấp|do\s*tre\s*thap|low[-\s]?latency|ultra[-\s]?low[-\s]?latency|\b7[.,]?1\b|virtual\s+surround|surround\s+sound|\besports?\b|\brgb\b|jbl\s+quantum|sony\s+inzone|hyperx|steelseries|razer|logitech\s+g|corsair|edifier\s+hecate|asus\s+rog/i,
      "the thao":
        /thể\s*thao|the\s*thao|sport|running|workout|fitness|gym|chạy\s*bộ|chay\s*bo|earhook/i,
      "kiem am":
        /kiểm\s*âm|kiem\s*am|monitoring|studio\s*monitor|reference\s*headphones?|professional\s*monitor/i,
      podcast:
        /podcast|phòng\s*thu|phong\s*thu|recording|studio|voice[-\s]?over/i,
      livestream:
        /livestream|live\s*stream|streaming|content\s*creator|broadcast/i,
      "cai ao": /cài\s*áo|cai\s*ao|lavalier|lapel|clip[-\s]?on/i,
      karaoke: /karaoke|hát karaoke|hat karaoke/i,
      "du lich":
        /du\s*lịch|du\s*lich|travel|portable|gấp\s*gọn|gap\s*gon|compact/i,
      "nghe nhac": /nghe\s*nhạc|nghe\s*nhac|music|audiophile|hi[-\s]?fi/i,
      "hoi hop":
        /hội\s*họp|hoi\s*hop|meeting|conference|online\s*meeting|work\s*from\s*home/i,
    },
    "audio-type": {
      bluetooth:
        /bluetooth|không\s*dây|khong\s*day|wireless|true\s+wireless|\btws\b/i,
      "co day": /có\s*dây|co\s*day|wired|dây\s*dẫn|day\s*dan/i,
      "chup tai": /chụp\s*tai|chup\s*tai|over[-\s]?ear|headphones?|headset/i,
      "nhet tai":
        /nhét\s*tai|nhet\s*tai|in[-\s]?ear|earbuds?|earphones?|airpods|galaxy\s+buds|freebuds/i,
      "loa bluetooth": /loa.*bluetooth|bluetooth.*speaker|wireless\s+speaker/i,
      soundbar: /soundbar|loa\s*thanh/i,
      "loa vi tinh":
        /loa\s*vi\s*tính|loa\s*vi\s*tinh|computer\s*speaker|desktop\s*speaker/i,
      "loa karaoke": /loa.*karaoke|karaoke.*speaker/i,
      "loa sub": /loa\s*sub|subwoofer/i,
      "loa cot": /loa\s*cột|loa\s*cot|column\s*speaker|tower\s*speaker/i,
      "loa tro giang": /loa\s*trợ\s*giảng|loa\s*tro\s*giang|voice\s*amplifier/i,
      "micro thu am":
        /(?:microphone|micro|mic).*thu\s*âm|(?:microphone|micro|mic).*thu\s*am|recording\s*microphone/i,
      "micro karaoke":
        /(?:microphone|micro|mic).*karaoke|karaoke\s*microphone/i,
      micro: /microphone|(?:^|\b)micro(?:\b|[-\s])|(?:^|\b)mic(?:\b|[-\s])/i,
      "dia than":
        /đĩa\s*than|dia\s*than|turntable|record\s*player|mâm\s*đĩa|mam\s*dia/i,
    },
    "audio-design": {
      "in-ear": /in[-\s]?ear|nhét\s*tai|nhet\s*tai/i,
      earbuds: /earbuds?|earpods?/i,
      "over-ear": /over[-\s]?ear|chụp\s*tai|chup\s*tai/i,
      "on-ear": /on[-\s]?ear/i,
      "true wireless": /true\s+wireless|\btws\b/i,
      "di dong": /di\s*động|di\s*dong|portable|compact/i,
      "de ban": /để\s*bàn|de\s*ban|desktop|tabletop/i,
    },
    "audio-line": {
      airpods: /airpods/i,
      "airpods pro": /airpods\s*pro/i,
      "airpods 4": /airpods\s*4/i,
      "airpods max": /airpods\s*max/i,
      "airpods 3": /airpods\s*3/i,
      "galaxy buds": /galaxy\s+buds/i,
      "sony wh": /sony\s+wh[-\s]?/i,
      jbl: /\bjbl\b/i,
      marshall: /\bmarshall\b/i,
    },
    "audio-transmission": {
      sbc: /\bsbc\b/i,
      aac: /\baac\b/i,
      aptx: /aptx|apt-x/i,
      ldac: /\bldac\b/i,
      lossless: /lossless|không\s*mất\s*dữ\s*liệu|khong\s*mat\s*du\s*lieu/i,
    },
  };

  const valueRegex =
    valueRegexByKind[kind]?.[normalized] || new RegExp(escapeRegex(clean), "i");
  const labelRegex =
    labelByKind[kind] ||
    /thông số|thong so|tính năng|tinh nang|kết nối|ket noi|loại|loai/i;

  const conditions = [
    buildSpecificationRowCondition(labelRegex, valueRegex),
    regexCondition(textFields, valueRegex),
  ];

  const facetFields = facetFieldsByKind[kind] || [];
  if (facetFields.length) {
    conditions.push(regexCondition(facetFields, valueRegex));
  }

  const usableConditions = conditions.filter(
    (condition) => condition && Object.keys(condition).length > 0,
  );

  if (usableConditions.length === 0) return {};
  if (usableConditions.length === 1) return usableConditions[0];
  return { $or: usableConditions };
}

function getCleanFacetTag(value = "") {
  return normalizeSearchKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFacetNumber(value = "") {
  const match = normalizeSearchKey(value)
    .replace(/,/g, ".")
    .match(/\d+(?:\.\d+)?/);
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
    if (normalized.includes("duoi") && normalized.includes("6")) {
      return { "facets.screenSizeInch": { $lt: 6 } };
    }
    if (/6\s*[-–]\s*6[.,]4/.test(normalized)) {
      return { "facets.screenSizeInch": { $gte: 6, $lte: 6.4 } };
    }
    if (/6[.,]5\s*[-–]\s*6[.,]7/.test(normalized)) {
      return { "facets.screenSizeInch": { $gte: 6.5, $lte: 6.7 } };
    }
    if (
      normalized.includes("tren") &&
      (normalized.includes("6.7") ||
        normalized.includes("6,7") ||
        normalized.includes("6.8") ||
        normalized.includes("6,8"))
    ) {
      return { "facets.screenSizeInch": { $gt: 6.7 } };
    }
    if (number) {
      return {
        "facets.screenSizeInch": { $gte: number - 0.11, $lte: number + 0.11 },
      };
    }
  }

  if (kind === "refresh-rate" && number) {
    return { "facets.refreshRateHz": number };
  }

  if (kind === "chipset") {
    const chipsetAliases = {
      snapdragon: "snapdragon",
      "apple-a": "apple-a",
      apple: "apple-a",
      "apple-m": "apple-m",
      dimensity: "dimensity",
      "mediatek-dimensity": "dimensity",
      helio: "helio",
      "mediatek-helio": "helio",
      exynos: "exynos",
      unisoc: "unisoc",
      "google-tensor": "google-tensor",
      tensor: "google-tensor",
      kirin: "kirin",
    };
    const chipset = chipsetAliases[tagKey];
    return chipset ? { "facets.chipset": chipset } : {};
  }

  if (kind === "cpu") {
    const cpuAliases = {
      "intel-core-i3": "intel-core-i3",
      "intel-core-i5": "intel-core-i5",
      "intel-core-i7": "intel-core-i7",
      "intel-core-i9": "intel-core-i9",
      "intel-core-ultra-5": "intel-core-ultra-5",
      "intel-core-ultra-7": "intel-core-ultra-7",
      "intel-core-ultra-9": "intel-core-ultra-9",
      "amd-ryzen-3": "amd-ryzen-3",
      "amd-ryzen-5": "amd-ryzen-5",
      "amd-ryzen-7": "amd-ryzen-7",
      "amd-ryzen-9": "amd-ryzen-9",
      "apple-m3": "apple-m3",
      "apple-m4": "apple-m4",
      "apple-m5": "apple-m5",
      "snapdragon-x-plus": "snapdragon-x-plus",
      "snapdragon-x-elite": "snapdragon-x-elite",
    };
    if (tagKey === "apple-m-series" || tagKey === "apple-m") {
      return { "facets.cpu": { $regex: /^apple-m/i } };
    }
    const cpu = cpuAliases[tagKey];
    return cpu ? { "facets.cpu": cpu } : {};
  }

  if (kind === "gpu") {
    const gpuAliases = {
      "card-onboard": "onboard",
      "do-hoa-tich-hop": "onboard",
      "card-tich-hop": "onboard",
      onboard: "onboard",
      "nvidia-geforce": "nvidia-geforce",
      "nvidia-rtx-3050": "nvidia-rtx-3050",
      "nvidia-rtx-4050": "nvidia-rtx-4050",
      "nvidia-rtx-4060": "nvidia-rtx-4060",
      "nvidia-rtx-5050": "nvidia-rtx-5050",
      "nvidia-rtx-5060": "nvidia-rtx-5060",
      "amd-radeon": "amd-radeon",
    };
    const rtxModel = tagKey.match(/(?:nvidia-)?(?:geforce-)?rtx-(\d{4})/i)?.[1];
    const gpu = rtxModel ? `nvidia-rtx-${rtxModel}` : gpuAliases[tagKey];
    return gpu ? { "facets.gpu": gpu } : {};
  }

  if (kind === "resolution") {
    const resolutionAliases = {
      "full-hd": "full-hd",
      "full-hd-plus": "full-hd-plus",
      "fhd-plus": "full-hd-plus",
      fhd: "full-hd",
      "2k": "2k",
      "2-5k": "2.5k",
      wqhd: "wqhd",
      wuxga: "wuxga",
      "2-8k": "2.8k",
      "3k": "3k",
      "3-2k": "3.2k",
      "4k": "4k",
      wqxga: "wqxga",
      retina: "retina",
      "5k": "5k",
    };
    const resolution = resolutionAliases[tagKey];
    return resolution ? { "facets.resolution": resolution } : {};
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
      "choi-game": "gaming",
      gaming: "gaming",
      "chup-anh-dep": "photography",
      "chup-anh": "photography",
      "pin-trau": "long-battery",
      "pin-lau": "long-battery",
      "mong-nhe": "lightweight",
      "hoc-tap-van-phong": "office-study",
      "van-phong": "office-study",
      "do-hoa-thiet-ke": "design",
      "thiet-ke": "design",
      "livestream-sang-tao-noi-dung": "creator",
      "sang-tao-noi-dung": "creator",
      creator: "creator",
      "cao-cap-sang-trong": "premium",
      "cao-cap": "premium",
    },
    special: {
      "5g": "5g",
      nfc: "nfc",
      "sac-nhanh": "fast-charge",
      "sac-khong-day": "wireless-charge",
      "khang-nuoc-ip68": "ip68",
      "chong-nuoc": "water-resistant",
      "khang-nuoc": "water-resistant",
      ip68: "ip68",
      "ai-tich-hop": "ai",
      ai: "ai",
      magsafe: "magsafe",
      "cam-ung": "touch",
      touch: "touch",
      touchscreen: "touch",
      "intel-evo": "intel-evo",
      "bao-mat-van-tay": "fingerprint",
      "xoay-gap-360-do": "convertible-360",
      "nhan-dien-khuon-mat": "face-recognition",
      "man-hinh-oled": "oled",
      "man-hinh-gap": "foldable",
      "dien-thoai-gap": "foldable",
      "mux-switch": "mux-switch",
      copilot: "copilot",
      "copilot-pc": "copilot-plus",
      "apple-intelligence": "apple-intelligence",
    },
  };

  if (["display", "camera", "usage", "special"].includes(kind)) {
    if (
      kind === "special" &&
      (tagKey.includes("wi-fi") || tagKey.includes("wifi"))
    ) {
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

  if (
    kind === "usage" &&
    (normalized.includes("cho tre em") ||
      normalized.includes("tre em") ||
      normalized.includes("kids"))
  ) {
    const childFriendlyTabletFields = [
      "name",
      "slug",
      "trainingLabels.productName",
      "trainingLabels.deviceLine",
      "rawProductJsonLd.name",
    ];
    const childFriendlyTabletRegex =
      /lenovo\s+idea\s+tab|redmi\s+pad|huawei\s+matepad\s+se|honor\s+pad|galaxy\s+tab\s+a|\bkids?\b/i;

    return {
      $or: [
        { "facets.usage": { $in: ["kids", "children"] } },
        regexCondition(childFriendlyTabletFields, childFriendlyTabletRegex),
      ],
    };
  }

  const labelRegex = getFeatureLabelRegex(kind, normalized);
  const valueRegex = getFeatureValueRegex(kind, clean);
  const facetCondition = buildFacetFieldCondition(kind, clean);
  const specCondition = buildSpecificationRowCondition(labelRegex, valueRegex);

  if (
    kind === "usage" &&
    (normalized.includes("choi game") || normalized.includes("gaming"))
  ) {
    const gamingIdentityFields = [
      "name",
      "slug",
      "trainingLabels.productName",
      "trainingLabels.deviceLine",
      "rawProductJsonLd.name",
    ];
    const gamingProductRegex =
      /gaming|legion|\brog\b|red\s?magic|\bpoco\b|predator|nitro|victus|tuf|\bloq\b/i;

    return {
      $or: [
        facetCondition,
        specCondition,
        regexCondition(gamingIdentityFields, gamingProductRegex),
      ],
    };
  }

  if (
    kind === "usage" &&
    (normalized.includes("giai tri") || normalized.includes("entertainment"))
  ) {
    const entertainmentTabletFields = [
      "name",
      "slug",
      "trainingLabels.productName",
      "trainingLabels.deviceLine",
      "rawProductJsonLd.name",
    ];
    const entertainmentTabletRegex =
      /ipad|galaxy\s+tab|(?:xiaomi|redmi|poco)\s+pad|matepad|honor\s+pad|lenovo\s+(?:idea\s+)?tab|teclast|nubia\s+tab|oppo\s+pad|boox|kindle/i;

    return {
      $or: [
        facetCondition,
        specCondition,
        regexCondition(entertainmentTabletFields, entertainmentTabletRegex),
      ],
    };
  }

  if (
    kind === "usage" &&
    (normalized.includes("van phong") ||
      normalized.includes("hoc tap") ||
      normalized.includes("student") ||
      normalized.includes("office"))
  ) {
    const officeLaptopFields = [
      "name",
      "slug",
      "productName",
      "title",
      "trainingLabels.productName",
      "trainingLabels.deviceLine",
      "rawProductJsonLd.name",
    ];
    const officeLaptopRegex =
      /vivobook|ideapad(?!.*gaming)|thinkbook|thinkpad|inspiron|vostro|latitude|probook|elitebook|omnibook|modern|prestige|swift|aspire(?!.*gaming)|macbook\s+air|surface\s+laptop|pavilion|gram/i;

    return {
      $or: [
        facetCondition,
        specCondition,
        regexCondition(officeLaptopFields, officeLaptopRegex),
      ],
    };
  }

  if (
    kind === "special" &&
    (normalized.includes("cam ung") || normalized.includes("touch"))
  ) {
    const touchLaptopFields = [
      "name",
      "slug",
      "productName",
      "title",
      "trainingLabels.productName",
      "trainingLabels.deviceLine",
      "rawProductJsonLd.name",
    ];
    const touchLaptopRegex =
      /2[\s-]?in[\s-]?1|x360|\bflip\b|\bflex\b|surface\s+pro|yoga\s+book|rog\s+flow\s+(?:x|z)\d+|touch(?:screen)?/i;
    const affirmativeTouchSpecCondition = buildSpecificationRowCondition(
      /cảm ứng|cam ung|touch|touchscreen/i,
      /có|co|yes|hỗ trợ|ho tro|support|touch|touchscreen/i,
    );
    const negativeTouchSpecCondition = buildSpecificationRowCondition(
      /cảm ứng|cam ung|touch|touchscreen|tính năng đặc biệt|tinh nang dac biet/i,
      /không|khong|no\b|not supported|không hỗ trợ|khong ho tro/i,
    );

    return {
      $or: [
        {
          $and: [{ "specIndex.version": { $gte: 7 } }, facetCondition],
        },
        {
          $and: [
            { $or: [specCondition, affirmativeTouchSpecCondition] },
            { $nor: [negativeTouchSpecCondition] },
          ],
        },
        regexCondition(touchLaptopFields, touchLaptopRegex),
      ],
    };
  }

  if (kind === "special") {
    const specialIdentityFields = [
      "name",
      "slug",
      "productName",
      "title",
      "description",
      "trainingLabels.productName",
      "trainingLabels.deviceLine",
      "rawProductJsonLd.name",
      "rawProductJsonLd.description",
    ];
    const fallbackConditions = [
      facetCondition,
      specCondition,
      regexCondition(specialIdentityFields, valueRegex),
    ].filter((condition) => condition && Object.keys(condition).length > 0);

    return fallbackConditions.length === 1
      ? fallbackConditions[0]
      : { $or: fallbackConditions };
  }

  if (["cpu", "gpu", "resolution"].includes(kind)) {
    const laptopSpecIdentityFields = [
      "name",
      "slug",
      "productName",
      "title",
      "trainingLabels.productName",
      "trainingLabels.deviceLine",
      "rawProductJsonLd.name",
    ];

    const fallbackConditions = [
      facetCondition,
      specCondition,
      regexCondition(laptopSpecIdentityFields, valueRegex),
    ].filter((condition) => condition && Object.keys(condition).length > 0);

    return fallbackConditions.length === 1
      ? fallbackConditions[0]
      : { $or: fallbackConditions };
  }

  return Object.keys(facetCondition).length
    ? { $or: [facetCondition, specCondition] }
    : specCondition;
}

function buildPhoneTypeCondition(phoneType = "") {
  const normalized = normalizeSearchKey(phoneType);
  const identityFields = [
    "name",
    "slug",
    "brand",
    "brandKey",
    "category",
    "categories",
    "description",
    "specifications.rows.label",
    "specifications.rows.value",
    "rawProductJsonLd.additionalProperty.name",
    "rawProductJsonLd.additionalProperty.value",
  ];

  const productIdentityFields = [
    "name",
    "slug",
    "brand",
    "brandKey",
    "trainingLabels.productName",
    "trainingLabels.deviceLine",
    "rawProductJsonLd.name",
  ];

  if (normalized.includes("ipad")) {
    return {
      $or: [
        buildFeatureValueCondition("phone-type", phoneType),
        regexCondition(
          productIdentityFields,
          /\bipad\b|ipad(?:os)?|apple\s+ipad/i,
        ),
      ],
    };
  }

  if (
    normalized.includes("iphone") ||
    normalized === "ios" ||
    normalized.startsWith("ios ")
  ) {
    return {
      $or: [
        buildBrandCondition("apple"),
        buildFeatureValueCondition("phone-type", phoneType),
      ],
    };
  }

  if (normalized.includes("android")) {
    const androidBrandOrProductRegex =
      /android|samsung|xiaomi|redmi|poco|oppo|vivo|realme|honor|oneplus|nubia|zte|tecno|infinix|motorola|google\s+pixel|nothing\s+phone|asus\s+rog\s+phone|tcl|nokia/i;
    const featurePhoneRegex =
      /điện thoại phổ thông|dien thoai pho thong|feature phone|kaios|series\s?30|s30\+|nokia\s?\d{3,4}|masstel|benco/i;

    return {
      $and: [
        {
          $or: [
            buildFeatureValueCondition("phone-type", phoneType),
            regexCondition(productIdentityFields, androidBrandOrProductRegex),
          ],
        },
        {
          $nor: productIdentityFields.map((field) => ({
            [field]: featurePhoneRegex,
          })),
        },
      ],
    };
  }

  if (normalized.includes("harmony")) {
    return {
      $or: [
        buildFeatureValueCondition("phone-type", phoneType),
        regexCondition(productIdentityFields, /harmony\s?os|huawei|matepad/i),
      ],
    };
  }

  if (normalized.includes("pho thong")) {
    return regexCondition(
      identityFields,
      /điện thoại phổ thông|dien thoai pho thong|feature phone|kaios|nokia\s?\d{3,4}|masstel|itel|benco/i,
    );
  }

  return buildFeatureValueCondition("phone-type", phoneType);
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
  const fields = [
    "name",
    "slug",
    "sku",
    "category",
    "categories",
    "categoryTrail.name",
    "categoryTrail.label",
    "trainingLabels.categoryLevel1",
    "trainingLabels.categoryLevel2",
    "trainingLabels.deviceGroup",
  ];
  const patterns = {
    "cu-cap":
      /củ sạc|cu sac|cáp sạc|cap sac|adapter|cáp type[ -]?c|cap type[ -]?c|type[ -]?c.{0,18}(cáp|cap|lightning)|lightning.{0,18}(cáp|cap)/i,
    "chuot-ban-phim": /chuột|chuot|mouse|bàn phím|ban phim|keyboard/i,
    "sac-du-phong":
      /sạc dự phòng|sac du phong|pin dự phòng|pin du phong|power ?bank/i,
    camera:
      /camera|webcam|gimbal|flycam|dji osmo|máy ảnh|may anh|canon eos|sony zv|fujifilm|insta360|gopro/i,
    "photo-camera":
      /máy ảnh|may anh|camera hành động|camera hanh dong|action cam|dji osmo|dji pocket|gimbal|flycam|canon eos|sony zv|fujifilm|insta360|gopro/i,
    "travel-accessory":
      /sạc|sac|cáp|cap|adapter|pin dự phòng|pin du phong|power ?bank|hub chuyển đổi|hub chuyen doi|tai nghe|headphone|earbuds/i,
    "cooling-appliance":
      /máy lạnh|may lanh|điều hòa|dieu hoa|tủ lạnh|tu lanh|quạt|quat/i,
    "world-cup": /tivi|\btv\b|loa|soundbar|máy chiếu|may chieu/i,
    "phu-kien-apple":
      /magsafe|airtag|apple pencil|phụ kiện apple|phu kien apple|phụ kiện iphone|phu kien iphone/i,
    "phu-kien-tien-ich":
      /quạt|quat|đèn|den|giá đỡ|gia do|gậy selfie|gay selfie|hub|thiết bị mạng|thiet bi mang/i,
    "op-lung": /ốp lưng|op lung|bao da|case/i,
    "pc-gaming": /pc\s*(?:cps\s*)?(?:gaming|game)|máy tính\s*(?:chơi game|gaming)|may tinh\s*(?:choi game|gaming)/i,
    "pc-van-phong": /pc\s*(?:cps\s*)?(?:văn phòng|van phong)|máy tính\s*(?:học tập|văn phòng)|may tinh\s*(?:hoc tap|van phong)/i,
    "pc-do-hoa": /pc\s*(?:cps\s*)?(?:đồ họa|do hoa|creator)|máy tính\s*(?:đồ họa|do hoa)/i,
    "pc-ai": /pc\s*(?:cps\s*)?ai|máy tính\s*ai|may tinh\s*ai/i,
    "may-tinh-dong-bo": /máy tính đồng bộ|may tinh dong bo|desktop\s*(?:computer|pc)/i,
    "all-in-one": /all[ -]?in[ -]?one|máy tính aio|may tinh aio/i,
    cpu: /\bcpu\b|bộ vi xử lý|bo vi xu ly|intel core|amd ryzen/i,
    mainboard: /mainboard|motherboard|bo mạch chủ|bo mach chu/i,
    ram: /\bram\b|bộ nhớ máy tính|bo nho may tinh|ddr[345]/i,
    "o-cung-ssd": /\bssd\b|ổ cứng ssd|o cung ssd|nvme|m\.2/i,
    "o-cung-hdd": /\bhdd\b|ổ cứng hdd|o cung hdd|hard drive/i,
    "card-man-hinh": /card màn hình|card man hinh|card đồ họa|card do hoa|\bvga\b|geforce|radeon\s+rx/i,
    "nguon-may-tinh": /nguồn máy tính|nguon may tinh|power supply|\bpsu\b/i,
    "tan-nhiet": /tản nhiệt|tan nhiet|cpu cooler|case fan|quạt case|quat case/i,
    "case-may-tinh": /case máy tính|case may tinh|vỏ máy tính|vo may tinh|computer case/i,
    "may-in-laser": /máy in laser|may in laser|laserjet/i,
    "may-in-phun": /máy in phun|may in phun|inkjet|ink tank/i,
    "may-in-da-nang": /máy in đa năng|may in da nang|multifunction|all[ -]?in[ -]?one printer/i,
    "may-in-hoa-don": /máy in hóa đơn|may in hoa don|máy in bill|may in bill|receipt printer/i,
  };
  patterns.camera =
    /camera|webcam|gimbal|flycam|dji osmo|camera ip|action cam|máy ảnh|may anh|canon eos|sony zv|fujifilm|insta360|gopro/i;
  patterns["phu-kien-apple"] =
    /airpods|earpods|magsafe|airtag|apple pencil|apple watch|lightning|adapter apple|cap apple|sac apple|pin du phong apple|smart keyboard|phu kien apple|phu kien iphone/i;
  const regex = patterns[key];
  if (!regex) return {};

  const positive = regexCondition(fields, regex);
  if (key === "cu-cap") {
    return {
      $and: [
        positive,
        {
          name: {
            $not: /dự phòng|du phong|power ?bank|flash drive|usb sandisk|ổ cứng|o cung|thẻ nhớ|the nho/i,
          },
        },
      ],
    };
  }

  if (key === "camera" || key === "photo-camera") {
    return {
      $and: [
        positive,
        {
          name: {
            $not:
              key === "photo-camera"
                ? /op lung|bao da|case|camera ip|camera wifi|camera trong nhà|camera trong nha|camera an ninh|camera giám sát|camera giam sat|webcam|lens|ống kính|ong kinh|film|đèn flash|den flash/i
                : /op lung|bao da|case|devilcase|jinya|tgv|proclear|vien camera/i,
          },
        },
      ],
    };
  }

  return positive;
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
    storage:
      /\b(32|64|128|256|512)\s?gb\b|\b(1|2|4)\s?tb\b|rom|bộ nhớ|bo nho|storage/i,
    ram: /\b(2|3|4|6|8|12|16|18|24|32|64)\s?gb\s?(ram)?\b|ram/i,
    "screen-size":
      /\b([1-9]|1[0-9]|2[0-9]|3[0-9])(\.\d)?\s?(inch|inches|")\b|màn hình|man hinh|display/i,
    usage:
      /gaming|chơi game|choi game|văn phòng|van phong|đồ họa|do hoa|học tập|hoc tap|pin trâu|pin trau|mỏng nhẹ|mong nhe/i,
    display: /oled|amoled|ips|retina|mini-?led|qled|lcd|tft|màn hình|man hinh/i,
    camera:
      /camera|chụp|chup|zoom|ois|leica|zeiss|hasselblad|gimbal|chống rung|chong rung/i,
    "refresh-rate":
      /\b(60|75|90|100|120|144|165|180|240|360)\s?hz\b|tần số quét|tan so quet/i,
    special:
      /5g|nfc|ai|wifi|wi-fi|bluetooth|sạc nhanh|sac nhanh|kháng nước|khang nuoc|chống nước|chong nuoc|active|magsafe|cảm ứng|cam ung|touch/i,
    cpu: /intel|core\s*(i[3579]|ultra)|ryzen|apple\s*m[345]|snapdragon\s*x/i,
    gpu: /nvidia|geforce|rtx|gtx|radeon|graphics|onboard|integrated|card đồ họa|card do hoa/i,
    resolution:
      /full\s*hd|\bfhd\b|\b[2345](?:[.,][28])?k\b|wqhd|wuxga|wqxga|retina|1920|2560|2880|3200|3840|5120/i,
  };
  const regex = facetRegexes[key];

  return regex ? regexCondition(fields, regex) : {};
}

function buildSort(sortKey) {
  const key = String(sortKey || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
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
      return {
        discount: -1,
        webFreshnessScore: -1,
        updatedAt: -1,
        scrapedAt: -1,
        name: 1,
      };
    case "hot_trend":
    case "popular":
      return {
        ratingCount: -1,
        rating: -1,
        webFreshnessScore: -1,
        updatedAt: -1,
        name: 1,
      };
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
  const mediaCount =
    counts.media || product.media?.length || product.images?.length || 0;
  const variantCount = counts.variants || product.variants?.length || 0;
  const colorCount = counts.colors || product.colors?.length || 0;
  const specGroupCount =
    counts.specifications || product.specifications?.length || 0;
  const articleLength = String(
    product.articleHtml || product.descriptionHtml || "",
  ).length;
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
    ? product.categoryTrail
        .map((item) => item?.name || item?.label || "")
        .join(" ")
    : "";
  const text = normalizeLookupText(
    [
      product.slug,
      product.sku,
      product.name,
      product.productName,
      product.title,
      product.category,
      trail,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return /(^|[\s-])(hang cu|cu dep|cu tray xuoc|cu|like new|like-new|da kich hoat|tray xuoc|trung bay|qua su dung|refurbished)([\s-]|$)/i.test(
    text,
  );
}

function getStockScore(product = {}) {
  const status = normalizeLookupText(
    [
      product.statusLabel,
      normalizeAvailability(product.availability),
      normalizeSchemaAvailability(getRawOffer(product).availability),
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (/\b(con hang|instock)\b/.test(status)) return 120_000;
  if (/\b(het hang|outofstock|lien he)\b/.test(status)) return -80_000;
  return 0;
}

function scoreProductCandidate(
  product = {},
  requestedSlug = "",
  canonicalSlugs = [],
) {
  const slug = getProductSlug(product);
  const slugKey = normalizeLookupText(slug);
  const requestedKey = normalizeLookupText(requestedSlug);
  const canonicalKeys = new Set(canonicalSlugs.map(normalizeLookupText));
  let score = 0;

  if (slugKey === requestedKey) score += 1_000_000;
  if (canonicalKeys.has(slugKey)) score += 900_000;
  if (product.url && getSlugFromUrl(product.url) === requestedSlug)
    score += 700_000;
  if (isUsedOrOldProduct(product)) score -= 850_000;

  score += getStockScore(product);
  score += getDetailSignalScore(product);
  score += Number(product.webFreshnessScore || 0) * 2_000;
  score += Number(product.sitemapSortRank || 0);
  score += Number(product.realWorldYear || product.effectiveRealWorldYear || 0);

  return score;
}

function pickBestProductCandidate(
  candidates = [],
  requestedSlug = "",
  canonicalSlugs = [],
) {
  return (
    candidates
      .filter(Boolean)
      .sort(
        (left, right) =>
          scoreProductCandidate(right, requestedSlug, canonicalSlugs) -
          scoreProductCandidate(left, requestedSlug, canonicalSlugs),
      )[0] || null
  );
}

async function findBestProductForLookup(
  products,
  lookup,
  requestedSlug,
  canonicalSlugs = [],
  limit = 40,
) {
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
    {
      sourceUrls: {
        $elemMatch: { $regex: `/${escaped}\\.html$`, $options: "i" },
      },
    },
  ];
  const aliasLookups = aliases.flatMap((alias) => {
    const aliasEscaped = escapeRegex(alias);
    return [
      { slug: alias },
      { sku: alias },
      { url: { $regex: `/${aliasEscaped}\\.html$`, $options: "i" } },
      {
        sourceUrls: {
          $elemMatch: { $regex: `/${aliasEscaped}\\.html$`, $options: "i" },
        },
      },
    ];
  });
  const fuzzyLookups = [
    { slug: { $regex: `^${escaped}(-|$)`, $options: "i" } },
    { sku: { $regex: `^${escaped}(-|$)`, $options: "i" } },
    { url: { $regex: `/${escaped}(-[^/]+)?\\.html$`, $options: "i" } },
    {
      sourceUrls: {
        $elemMatch: { $regex: `/${escaped}(-[^/]+)?\\.html$`, $options: "i" },
      },
    },
  ];

  for (const lookup of exactLookups) {
    const product = await findBestProductForLookup(
      products,
      lookup,
      clean,
      aliases,
      10,
    );
    if (product) return product;
  }

  for (const lookup of aliasLookups) {
    const product = await findBestProductForLookup(
      products,
      lookup,
      clean,
      aliases,
      10,
    );
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

async function findBestProductDetailForLookup(
  productDetails,
  lookup,
  requestedSlug,
  canonicalSlugs = [],
  limit = 40,
) {
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

async function findBestProductDetailForFallback(
  productDetails,
  identifier,
  product,
) {
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

  return findBestProductDetailForLookup(
    productDetails,
    lookup,
    directSlug,
    canonicalSlugs,
    50,
  );
}

async function findOneBestExactDetail(
  productDetails,
  lookup,
  requestedSlug,
  canonicalSlugs = [],
) {
  return findBestProductDetailForLookup(
    productDetails,
    lookup,
    requestedSlug,
    canonicalSlugs,
    10,
  );
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
    ? detail.specifications.reduce(
        (total, group) => total + (group.rows?.length || 0),
        0,
      )
    : 0;

  return Boolean(
    name &&
    (images.length > 0 || toPositiveNumber(detail.currentPrice)) &&
    (toPositiveNumber(detail.currentPrice) ||
      specCount > 0 ||
      detail.articleHtml ||
      detail.description),
  );
}

function buildSummaryBackedDetail(product, detail = {}, identifier = "") {
  if (!product) return detail;

  const summary = normalizeProduct(product);
  const slug =
    detail.slug ||
    summary.detailSlug ||
    summary.slug ||
    stripHtmlExtension(identifier);
  const images = uniqueStrings([
    detail.primaryImage,
    detail.thumbnail,
    detail.image,
    ...(detail.images || []),
    summary.primaryImage,
    summary.thumbnail,
    ...(summary.images || []),
  ]);
  const media =
    Array.isArray(detail.media) && detail.media.length
      ? detail.media
      : images.map((src, index) => ({
          id: `${slug}-summary-image-${index + 1}`,
          type: "image",
          label: index === 0 ? "Ảnh chính" : `Ảnh ${index + 1}`,
          src,
          thumbnail: src,
          alt: summary.name,
        }));
  const specifications =
    Array.isArray(detail.specifications) &&
    detail.specifications.some((group) => group.rows?.length)
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
    categoryTrail:
      Array.isArray(detail.categoryTrail) && detail.categoryTrail.length
        ? detail.categoryTrail
        : summary.categoryTrail,
    currentPrice: price,
    originalPrice:
      toPositiveNumber(detail.originalPrice) || summary.originalPrice || price,
    discount: detail.discount ?? summary.discount,
    rating: detail.rating ?? summary.rating,
    ratingCount: detail.ratingCount ?? summary.ratingCount,
    installment: detail.installment ?? summary.installment,
    statusLabel:
      detail.statusLabel ||
      summary.statusLabel ||
      (summary.availability === "InStock" ? "Còn hàng" : "Liên hệ"),
    city: detail.city || summary.city,
    thumbnail: detail.thumbnail || images[0] || "",
    image: detail.image || images[0] || "",
    primaryImage: detail.primaryImage || images[0] || "",
    images,
    media,
    specifications,
    description: detail.description || summary.description || "",
    detailCompleteness: hasUsableProductDetail(detail)
      ? "full"
      : "summary-fallback",
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
    ].filter(Boolean),
  );
  const urls = new Set(
    [
      product?.url,
      product?.detailUrl,
      ...(product?.sourceUrls || []),
      directSlug ? `https://cellphones.com.vn/${directSlug}.html` : "",
    ].filter(Boolean),
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

async function findProductDetailByIdentifier(
  productDetails,
  identifier,
  product,
) {
  const directSlug = stripHtmlExtension(identifier);
  const directUrl = directSlug
    ? `https://cellphones.com.vn/${directSlug}.html`
    : "";
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
    ...(ObjectId.isValid(directSlug)
      ? [{ _id: new ObjectId(directSlug) }]
      : []),
    ...exactSlugs.flatMap((slug) => [{ slug }, { sku: slug }]),
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

    const detail = await findOneBestExactDetail(
      productDetails,
      lookup,
      directSlug,
      canonicalSlugs,
    );
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

  if (key === "hang cu") {
    return regexCondition(
      [
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
      ],
      /hàng cũ|hang cu|cũ đẹp|cu dep|cũ trầy xước|cu tray xuoc|like new|like-new|đã kích hoạt|da kich hoat|trưng bày|trung bay|qua sử dụng|qua su dung|refurbished/i,
    );
  }

  // Các document CellphoneS không phải lúc nào cũng lưu danh mục con như
  // "Tai nghe", "Loa" hay "Micro" trong trường category. Nhiều document chỉ
  // có category = "Âm thanh" nhưng tên sản phẩm vẫn thể hiện đúng loại thiết bị.
  // Vì vậy danh mục âm thanh con cần đối chiếu cả breadcrumb/category lẫn danh
  // tính sản phẩm, đồng thời loại phụ kiện để không trộn kết quả.
  const audioSubcategoryConfigs = {
    "tai nghe": {
      categoryRegex: /^tai nghe(?:\b|\s|-)|^headphones?$/i,
      identityRegex:
        /tai nghe|headphones?|headset|earphones?|earbuds?|airpods|galaxy\s+buds|freebuds|redmi\s+buds|soundpeats|true\s+wireless|\btws\b/i,
      excludeRegex:
        /ốp|op lung|bao da|case|dây đeo|day deo|dây thay thế|day thay the|cáp|cap(?:\s|$)|adapter|đệm tai|dem tai|mút tai|mut tai|ear\s?tips?|earpads?|hộp sạc|hop sac|charging case|giá đỡ|gia do|phụ kiện|phu kien/i,
    },
    loa: {
      categoryRegex: /^loa(?:\b|\s|-)|^speaker/i,
      identityRegex:
        /(?:^|\b)loa(?:\b|[-\s])|speakers?|soundbar|subwoofer|studio monitor|partybox|boombox/i,
      excludeRegex:
        /giá treo|gia treo|chân loa|chan loa|dây loa|day loa|cáp loa|cap loa|ốp|op lung|bao da|case|phụ kiện|phu kien/i,
    },
    "micro thu am": {
      categoryRegex:
        /^(?:micro|mic)(?:rophone)?\s*(?:thu âm|thu am|recording)/i,
      identityRegex:
        /(?:microphone|micro|\bmic\b).*(?:thu âm|thu am|recording|studio|podcast|livestream)|lavalier|clip[-\s]?on/i,
      excludeRegex:
        /chân micro|chan micro|giá đỡ micro|gia do micro|dây micro|day micro|cáp micro|cap micro|ốp|op lung|case|phụ kiện|phu kien/i,
    },
    "micro khong day": {
      categoryRegex:
        /^(?:micro|mic)(?:rophone)?\s*(?:không dây|khong day|wireless|karaoke)/i,
      identityRegex:
        /(?:microphone|micro|\bmic\b).*(?:không dây|khong day|wireless|karaoke)|karaoke microphone/i,
      excludeRegex:
        /chân micro|chan micro|giá đỡ micro|gia do micro|dây micro|day micro|cáp micro|cap micro|ốp|op lung|case|phụ kiện|phu kien/i,
    },
    micro: {
      categoryRegex: /^(?:micro|mic)(?:rophone)?(?:\b|\s|-)/i,
      identityRegex:
        /microphone|(?:^|\b)micro(?:\b|[-\s])|(?:^|\b)mic(?:\b|[-\s])|lavalier|clip[-\s]?on/i,
      excludeRegex:
        /chân micro|chan micro|giá đỡ micro|gia do micro|dây micro|day micro|cáp micro|cap micro|ốp|op lung|case|phụ kiện|phu kien/i,
    },
    "dia than": {
      categoryRegex:
        /^(?:đĩa than|dia than|đầu đĩa than|dau dia than|turntable)/i,
      identityRegex:
        /đĩa than|dia than|đầu đĩa than|dau dia than|turntable|record player|mâm đĩa|mam dia/i,
      excludeRegex:
        /kim đĩa|kim dia|đĩa vinyl|dia vinyl|phụ kiện|phu kien|cover|case/i,
    },
  };

  const audioSubcategory = audioSubcategoryConfigs[key];
  if (audioSubcategory) {
    const categoryFields = [
      "category",
      "categories",
      "categoryTrail.name",
      "categoryTrail.label",
      "trainingLabels.categoryLevel1",
      "trainingLabels.categoryLevel2",
      "trainingLabels.deviceGroup",
    ];
    const identityFields = [
      "name",
      "title",
      "productName",
      "slug",
      "sku",
      "trainingLabels.productName",
      "trainingLabels.deviceLine",
      "rawProductJsonLd.name",
    ];

    const conditions = [
      {
        $or: [
          regexCondition(categoryFields, audioSubcategory.categoryRegex),
          regexCondition(identityFields, audioSubcategory.identityRegex),
        ],
      },
    ];

    if (audioSubcategory.excludeRegex) {
      conditions.push({
        $nor: identityFields.map((field) => ({
          [field]: audioSubcategory.excludeRegex,
        })),
      });
    }

    return { $and: conditions };
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
    "phu kien",
    "tai nghe",
    "loa",
    "man hinh",
    "may giat",
    "may say quan ao",
    "dieu hoa - may lanh",
    "camera",
  ]);

  const regexes = aliasCategories[key]
    ? aliasCategories[key].map(
        (alias) => new RegExp(`^${escapeRegex(alias)}$`, "i"),
      )
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

  if (key === "laptop") {
    const clearNonLaptopIdentity =
      /^(?:apple\s+)?(?:studio\s+display|pro\s+display\s+xdr|imac\b|mac\s+studio\b)/i;
    const clearNonLaptopSlug =
      /^(?:apple-)?(?:studio-display|pro-display-xdr|imac(?:-|$)|mac-studio(?:-|$))/i;
    const clearNonLaptopTrail =
      /^(?:studio\s+display|pro\s+display\s+xdr|imac|mac\s+studio|màn hình|man hinh|monitor)$/i;

    return {
      $and: [
        categoryCondition,
        {
          $nor: [
            { name: clearNonLaptopIdentity },
            { title: clearNonLaptopIdentity },
            { productName: clearNonLaptopIdentity },
            { slug: clearNonLaptopSlug },
            { "rawProductJsonLd.name": clearNonLaptopIdentity },
            { "categoryTrail.name": clearNonLaptopTrail },
            { "categoryTrail.label": clearNonLaptopTrail },
          ],
        },
      ],
    };
  }

  return categoryCondition;
}

function createBrandRegex(brand = "") {
  const key = String(brand || "")
    .trim()
    .toLowerCase();
  const aliases = {
    macbook: String.raw`\bmacbook\b`,
    apple: String.raw`apple|iphone|ipad|airpods|apple\s*watch|\bmacbook\b|\bmac\b`,
    samsung: String.raw`\bsamsung\b|galaxy`,
    xiaomi: String.raw`\bxiaomi\b|\bredmi\b|\bpoco\b`,
    oppo: String.raw`\boppo\b`,
    realme: String.raw`\brealme\b`,
    oneplus: String.raw`\boneplus\b|one\s*plus`,
    vivo: String.raw`\bvivo\b`,
    honor: String.raw`\bhonor\b`,
    tecno: String.raw`\btecno\b`,
    nubia: String.raw`\bnubia\b|\bzte\b|red\s*magic`,
    sony: String.raw`\bsony\b`,
    nokia: String.raw`\bnokia\b`,
    nothing: String.raw`\bnothing\b`,
    infinix: String.raw`\binfinix\b`,
    huawei: String.raw`\bhuawei\b`,
    asus: String.raw`\basus\b|\brog\b|\btuf\b`,
    lenovo: String.raw`\blenovo\b|\blegion\b`,
    dell: String.raw`\bdell\b|\bxps\b|\binspiron\b|\bvostro\b|\blatitude\b`,
    acer: String.raw`\bacer\b|\bpredator\b|\bnitro\b|\baspire\b|\bswift\b`,
    msi: String.raw`\bmsi\b`,
    hp: String.raw`\bhp\b|\bomen\b|pavilion|probook|elitebook|omnibook|victus`,
    lg: String.raw`\blg\b`,
    jbl: String.raw`\bjbl\b`,
    marshall: String.raw`\bmarshall\b`,
    anker: String.raw`\banker\b|soundcore`,
    coocaa: String.raw`\bcoocaa\b`,
    garmin: String.raw`\bgarmin\b`,
    sharp: String.raw`\bsharp\b`,
    roborock: String.raw`\broborock\b`,
    dreame: String.raw`\bdreame\b`,
    tineco: String.raw`\btineco\b`,
  };
  return new RegExp(aliases[key] || `\\b${escapeRegex(key)}\\b`, "i");
}

function buildBrandCondition(brand = "") {
  const regex = createBrandRegex(brand);
  return regexCondition(
    [
      "brand",
      "brandKey",
      "name",
      "slug",
      "trainingLabels.brand",
      "trainingLabels.deviceBrand",
      "rawProductJsonLd.brand.name",
    ],
    regex,
  );
}

function buildSegmentCondition(segment = "") {
  const key = String(segment || "")
    .trim()
    .toLowerCase();

  if (key === "pin" || key === "battery") {
    return {
      "facets.batteryCapacityMah": { $gte: LONG_BATTERY_PHONE_MIN_MAH },
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
        regexCondition(
          monitorFields,
          /màn hình|man hinh|monitor|gaming monitor/i,
        ),
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
        regexCondition(
          fields,
          /pc gaming|pc cps|máy tính để bàn|desktop|may tinh de ban/i,
        ),
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

  const accessorySegmentRegexes = {
    "apple-accessories":
      /phụ kiện apple|phu kien apple|apple|iphone|ipad|macbook|airpods|magsafe|cáp.*apple|cap.*apple|ốp.*iphone|op.*iphone/i,
    "cables-chargers":
      /cáp|cap|sạc|sac|củ sạc|cu sac|adapter|charger|cable|type-?c|lightning|usb-?c/i,
    "power-banks":
      /pin sạc dự phòng|pin sac du phong|sạc dự phòng|sac du phong|power bank|backup battery/i,
    cases: /ốp lưng|op lung|bao da|case|cover|ốp điện thoại|op dien thoai/i,
    "screen-protectors":
      /dán màn hình|dan man hinh|kính cường lực|kinh cuong luc|miếng dán|mieng dan|screen protector/i,
    "memory-usb":
      /thẻ nhớ|the nho|usb|ổ cứng|o cung|ssd|memory card|sd card|microsd|flash/i,
    "gaming-gear":
      /gaming gear|playstation|ps5|tay cầm|tay cam|bàn phím|ban phim|chuột|chuot|controller|gamepad|console/i,
    sim: /sim|4g|5g|esim|data/i,
    network:
      /thiết bị mạng|thiet bi mang|router|wifi|wi-?fi|mesh|modem|bộ phát|bo phat|repeater|access point/i,
    camera: /camera|ip camera|camera an ninh|webcam|hành trình|hanh trinh/i,
    gimbal: /gimbal|chống rung|chong rung|osmo|stabilizer/i,
    flycam: /flycam|drone|dji|máy bay|may bay/i,
    cameras:
      /máy ảnh|may anh|camera sony|canon|nikon|fujifilm|lens|ống kính|ong kinh/i,
    "mouse-keyboard":
      /chuột|chuot|bàn phím|ban phim|keyboard|mouse|logitech|keychron/i,
    bags: /balo|ba lô|túi xách|tui xach|túi chống sốc|tui chong soc|backpack|bag/i,
    hubs: /hub|hub chuyển đổi|hub chuyen doi|dock|dongle|adapter|cổng chuyển|cong chuyen/i,
    "phone-accessories":
      /phụ kiện điện thoại|phu kien dien thoai|ốp lưng|op lung|dán màn hình|dan man hinh|cáp|cap|sạc|sac|tai nghe|magsafe/i,
    "laptop-accessories":
      /phụ kiện laptop|phu kien laptop|balo|túi chống sốc|tui chong soc|chuột|chuot|bàn phím|ban phim|hub|dock|đế tản nhiệt|de tan nhiet/i,
  };

  if (accessorySegmentRegexes[key]) {
    return regexCondition(fields, accessorySegmentRegexes[key]);
  }

  const usedIdentityFields = [
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
  const usedCommonRegex =
    /hàng cũ|hang cu|cũ đẹp|cu dep|cũ trầy xước|cu tray xuoc|like new|like-new|đã kích hoạt|da kich hoat|trưng bày|trung bay|qua sử dụng|qua su dung|refurbished/i;
  const usedSegmentRegexes = {
    "used-phone":
      /điện thoại|dien thoai|iphone|samsung|galaxy|xiaomi|oppo|honor|realme|phone|smartphone/i,
    "used-tablet": /tablet|máy tính bảng|may tinh bang|ipad/i,
    "used-macbook": /macbook|mac book|mac/i,
    "used-laptop": /laptop|notebook|asus|lenovo|hp|dell|acer|msi/i,
    "used-headphones": /tai nghe|headphone|earphone|airpods|buds/i,
    "used-speaker": /loa|speaker|jbl|marshall/i,
    "used-watch":
      /đồng hồ|dong ho|watch|apple watch|galaxy watch|garmin|amazfit/i,
    "used-appliance":
      /đồ gia dụng|do gia dung|tủ lạnh|tu lanh|máy giặt|may giat|máy hút bụi|may hut bui|robot|nồi chiên|noi chien|quạt|quat/i,
    "used-accessories":
      /phụ kiện|phu kien|ốp|op lung|bao da|cáp|cap|sạc|sac|pin dự phòng|pin du phong|hub|balo|chuột|chuot|bàn phím|ban phim/i,
    "used-monitor": /màn hình|man hinh|monitor/i,
    "used-tv": /tivi|tv|smart tv|smart tivi/i,
    "used-charger":
      /cáp sạc|cap sac|cáp|cap|sạc|sac|củ sạc|cu sac|adapter|charger|type-?c|lightning/i,
  };

  if (usedSegmentRegexes[key]) {
    return {
      $and: [
        regexCondition(usedIdentityFields, usedCommonRegex),
        regexCondition(usedIdentityFields, usedSegmentRegexes[key]),
      ],
    };
  }

  const segments = {
    game: /game|gaming|rog|legion|redmagic|red magic|black shark|nubia|poco/i,
    gaming: /game|gaming|rog|legion|redmagic|red magic|black shark|nubia|poco/i,
    pin: /pin|mah|mAh|6000|6500|7000|8000|10000|pin trâu|pin-trau/i,
    battery: /pin|mah|mAh|6000|6500|7000|8000|10000|pin trâu|pin-trau/i,
    "5g": /5g/i,
    camera:
      /camera|chụp|chup|pro max|ultra|find x|xiaomi 15|vivo x|zeiss|leica|hasselblad/i,
    photography:
      /camera|chụp|chup|pro max|ultra|find x|xiaomi 15|vivo x|zeiss|leica|hasselblad/i,
    gap: /fold|flip|gập|gap|z fold|z flip|find n/i,
    fold: /fold|flip|gập|gap|z fold|z flip|find n/i,
    ai: /galaxy ai|apple intelligence|google gemini|circle to search|ai phone|điện thoại ai|dien thoai ai|camera ai|honor ai/i,
    popular:
      /điện thoại phổ thông|dien thoai pho thong|feature phone|kaios|nokia\s?\d{3,4}|masstel|itel|benco/i,
  };
  const regex = segments[key];

  return regex ? regexCondition(fields, regex) : {};
}

function resolveProductDetailUrl(identifier, product) {
  const candidates = [product?.url, ...(product?.sourceUrls || [])].filter(
    Boolean,
  );

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
    { upsert: true },
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
    if (Object.prototype.hasOwnProperty.call(input, key))
      product[key] = input[key];
  }

  if (typeof product.name === "string") product.name = product.name.trim();
  if (typeof product.brand === "string") product.brand = product.brand.trim();
  if (product.currentPrice !== undefined && product.price === undefined)
    product.price = product.currentPrice;
  if (product.price !== undefined) product.price = Number(product.price);
  if (product.originalPrice !== undefined)
    product.originalPrice = Number(product.originalPrice);
  if (!product.slug && (product.sku || product.name))
    product.slug = slugify(product.sku || product.name);
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
  } = await getDb();
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

async function handleListStores(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const province =
    url.searchParams.get("province") || url.searchParams.get("city") || "";
  const district = url.searchParams.get("district") || "";
  const query =
    url.searchParams.get("q") || url.searchParams.get("keyword") || "";
  const pageSize = toPositiveInt(url.searchParams.get("pageSize"), 20, 20);
  const maxPages = toPositiveInt(url.searchParams.get("maxPages"), 3, 3);
  const latitude = Number(url.searchParams.get("lat"));
  const longitude = Number(url.searchParams.get("lng"));
  const radius = Number(url.searchParams.get("radius"));
  const forceRefresh = url.searchParams.get("refresh") === "true";

  try {
    const result = await searchCellphoneStores({
      province,
      district,
      query,
      pageSize,
      maxPages,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      radius: Number.isFinite(radius) ? radius : 50000,
      forceRefresh,
    });

    sendJson(res, 200, {
      ok: true,
      data: result.stores,
      meta: {
        province,
        district,
        query,
        googleQuery: result.googleQuery,
        officialSourceUrl: result.officialSourceUrl || "",
        resultCount: result.resultCount,
        pagesFetched: result.pagesFetched,
        cached: result.cached,
        fetchedAt: result.fetchedAt,
      },
    });
  } catch (error) {
    console.error("[stores]", error);
    const statusCode =
      Number(error.statusCode) ||
      (error.code === "GOOGLE_MAPS_API_KEY_MISSING" ? 503 : 502);

    sendError(
      res,
      statusCode,
      "Không thể tải danh sách cửa hàng CellphoneS.",
      error.message,
    );
  }
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
      stores: "/api/stores",
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
  const limit = toPositiveInt(
    url.searchParams.get("limit"),
    DEFAULT_LIMIT,
    MAX_LIMIT,
  );
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

  const [total, docs] = await Promise.all([
    webProducts.countDocuments(query),
    webProducts
      .find(query, { projection })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray(),
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
  const forceLazyScrape =
    url.searchParams.get("lazy") === "true" ||
    url.searchParams.get("forceLazy") === "true";
  const product = await findProductByIdentifier(productDetails, identifier);
  const manifest = await findProductDetailByIdentifier(
    productDetails,
    identifier,
    product,
  );
  let detail = await hydrateProductDetail(manifest);
  let cacheStatus = detail ? "hit" : "miss";

  if (!detail) {
    const detailUrl = resolveProductDetailUrl(identifier, product);

    if (!detailUrl) {
      sendError(
        res,
        404,
        "Product details not found and no CellphoneS URL is available for lazy scrape.",
      );
      return;
    }

    try {
      detail = await scrapeCellphonesDetailCached(detailUrl, {
        force: forceLazyScrape,
      });
      await persistProductDetailManifest({ productDetails, detail });
      cacheStatus = "lazy-scraped";
    } catch (error) {
      if (!product) {
        const statusCode = [
          "LAZY_SCRAPE_DISABLED",
          "LAZY_SCRAPE_COOLDOWN",
        ].includes(error.code)
          ? 404
          : 502;
        sendError(
          res,
          statusCode,
          "Product details not found and lazy scrape is unavailable.",
          error.message,
        );
        return;
      }

      detail = buildSummaryBackedDetail(product, {}, identifier);
      cacheStatus =
        error.code === "LAZY_SCRAPE_DISABLED"
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
      ...(product.categories || []).map((category) => ({
        categories: category,
      })),
      ...(product.brand ? [{ brand: product.brand }] : []),
    ],
  };

  if (relatedQuery.$or.length === 0) delete relatedQuery.$or;

  const categories = Array.isArray(product.categories)
    ? product.categories.filter(Boolean)
    : [];
  const focusedCategories = categories.slice(-2);
  const broadCategories = categories.slice(0, -2);
  const scoreParts = [
    product.brand ? { $cond: [{ $eq: ["$brand", product.brand] }, 6, 0] } : 0,
    focusedCategories.length
      ? {
          $multiply: [
            {
              $size: {
                $setIntersection: [
                  { $ifNull: ["$categories", []] },
                  focusedCategories,
                ],
              },
            },
            3,
          ],
        }
      : 0,
    broadCategories.length
      ? {
          $size: {
            $setIntersection: [
              { $ifNull: ["$categories", []] },
              broadCategories,
            ],
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
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
}

function sanitizePhone(value = "") {
  return String(value || "")
    .replace(/[^\d+]/g, "")
    .slice(0, 24);
}

function sanitizeRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return 5;
  return Math.min(5, Math.max(1, Math.round(rating)));
}

async function ensureCartIndexes(carts) {
  if (cartIndexesReady) return;

  await Promise.all([
    carts.createIndex(
      { userId: 1 },
      { unique: true, name: "unique_cart_user" },
    ),
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
    variantId: cleanCartText(
      source.variantId || variant.id || input.variantId,
      80,
    ),
    variantName: cleanCartText(
      source.variantName || variant.name || input.variantName,
      120,
    ),
    colorId: cleanCartText(source.colorId || color.id || input.colorId, 80),
    colorName: cleanCartText(
      source.colorName || color.name || input.colorName,
      120,
    ),
  };

  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => Boolean(value)),
  );
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
    700,
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
    160,
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
      slugify(name),
  );
  const selectedOptions = sanitizeCartOptions(product);
  const item = {
    productId: cleanCartText(
      product.productId || product.id || product.mongoId || product._id || slug,
      180,
    ),
    mongoId: cleanCartText(product.mongoId || product._id, 80),
    sku: cleanCartText(product.sku || slug, 180),
    slug,
    name: name || "Sản phẩm CellphoneS",
    image: getCartImage(product),
    url: cleanCartText(
      product.url || product.productUrl || (slug ? `/${slug}.html` : ""),
      700,
    ),
    price: cleanCartPrice(product.price ?? product.currentPrice),
    currentPrice: cleanCartPrice(product.currentPrice ?? product.price),
    originalPrice: cleanCartPrice(product.originalPrice),
    brand: cleanCartText(
      product.brandName || product.brand || product.brandKey,
      120,
    ),
    selectedOptions,
    quantity: cleanCartQuantity(input.quantity ?? product.quantity ?? 1),
  };

  item.id = cleanCartText(
    input.itemId ||
      input.cartItemId ||
      product.cartItemId ||
      buildCartItemId(item),
    240,
  );
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
        quantity: Math.min(
          99,
          Number(previous.quantity || 1) + Number(item.quantity || 1),
        ),
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
  const totalQuantity = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      cleanCartPrice(item.currentPrice || item.price) *
        Number(item.quantity || 0),
    0,
  );
  const originalSubtotal = items.reduce(
    (sum, item) =>
      sum +
      cleanCartPrice(item.originalPrice || item.currentPrice || item.price) *
        Number(item.quantity || 0),
    0,
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
  const items = Array.isArray(cart.items)
    ? cart.items.map(sanitizeCartItem)
    : [];
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
    const items =
      mode === "merge"
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
      { upsert: true },
    );

    const cart = await carts.findOne({ userId: owner.userId });
    sendJson(res, 200, { ok: true, data: normalizeCart(cart, owner) });
    return;
  }

  if (!section && req.method === "DELETE") {
    await findOrCreateCart(carts, owner);
    await carts.updateOne(
      { userId: owner.userId },
      { $set: { items: [], updatedAt: now } },
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
      {
        $set: { email: owner.email, phone: owner.phone, items, updatedAt: now },
      },
    );

    const cart = await carts.findOne({ userId: owner.userId });
    sendJson(res, 201, {
      ok: true,
      data: normalizeCart(cart, owner),
      item: incomingItem,
    });
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
      { $set: { items, updatedAt: now } },
    );
    const cart = await carts.findOne({ userId: owner.userId });
    sendJson(res, 200, { ok: true, data: normalizeCart(cart, owner) });
    return;
  }

  if (req.method === "DELETE") {
    const items = (currentCart.items || []).filter(
      (item) => item.id !== itemId,
    );
    await carts.updateOne(
      { userId: owner.userId },
      { $set: { items, updatedAt: now } },
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
    orders.createIndex(
      { orderCode: 1 },
      { unique: true, name: "unique_order_code" },
    ),
    orders.createIndex(
      { userId: 1, createdAt: -1 },
      { name: "orders_user_created_at" },
    ),
    orders.createIndex(
      { status: 1, createdAt: -1 },
      { name: "orders_status_created_at" },
    ),
    orders.createIndex(
      { "payment.reference": 1 },
      { name: "orders_payment_reference" },
    ),
    orders.createIndex(
      { "payment.status": 1, createdAt: -1 },
      { name: "orders_payment_status_created_at" },
    ),
    orders.createIndex(
      { "paymentHistory.transactionId": 1 },
      { sparse: true, name: "orders_payment_history_transaction" },
    ),
    orders.createIndex(
      { "customer.phone": 1 },
      { name: "orders_customer_phone" },
    ),
    orders.createIndex(
      { "customer.email": 1 },
      { name: "orders_customer_email" },
    ),
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
  return db
    .collection(process.env.USERS_COLLECTION || "smember_users")
    .findOne({
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
    fullName: cleanLimitedText(
      input.fullName || input.name || fallback.fullName || fallback.name,
      120,
    ),
    phone: sanitizePhone(input.phone || fallback.phone),
    email: normalizeEmail(input.email || fallback.email),
    memberTier: cleanLimitedText(
      input.memberTier || fallback.memberTier || "S-NEW",
      40,
    ),
  };
}

function sanitizeShippingAddress(input = {}) {
  const addressLine = cleanLimitedText(
    input.addressLine || input.address || input.street,
    260,
  );
  const ward = cleanLimitedText(input.ward, 120);
  const district = cleanLimitedText(input.district, 120);
  const province = cleanLimitedText(input.province || input.city, 120);
  const fullAddress = cleanLimitedText(
    input.fullAddress ||
      [addressLine, ward, district, province].filter(Boolean).join(", "),
    700,
  );

  return {
    receiverName: cleanLimitedText(
      input.receiverName || input.fullName || input.name,
      120,
    ),
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
  const invoiceEmail = requested
    ? normalizeEmail(input.invoiceEmail || input.email)
    : "";
  return {
    requested,
    companyName: requested ? cleanLimitedText(input.companyName, 180) : "",
    taxCode: requested ? cleanLimitedText(input.taxCode, 40) : "",
    companyAddress: requested
      ? cleanLimitedText(input.companyAddress, 320)
      : "",
    invoiceEmail,
    email: invoiceEmail,
    invoiceStatus: requested
      ? cleanLimitedText(input.invoiceStatus || "pending", 40)
      : "not_requested",
    note: requested ? cleanLimitedText(input.note, 1000) : "",
  };
}

function sanitizeShippingChoice(input = {}) {
  const type = ["store", "express", "standard"].includes(input.type)
    ? input.type
    : "express";
  const fallbackLabel =
    type === "express" ? "Giao siêu tốc" : "Giao thông thường";
  const choiceLabel = type === "store" ? "Nhận tại cửa hàng" : fallbackLabel;
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
  const totalBeforePayment = Math.max(
    0,
    cartSummary.subtotal + shippingFee - educationDiscount - couponDiscount,
  );

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

async function buildCheckoutPreview({
  productDetails,
  products,
  coupons,
  body = {},
  couponContext = {},
}) {
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
  const shippingChoice = sanitizeShippingChoice(
    bodyData.shippingChoice || bodyData.shipping || {},
  );
  const educationOffer = Boolean(bodyData.educationOffer);
  const preCouponTotals = buildOrderTotals(items, {
    shippingFee: shippingChoice.fee,
    educationOffer,
  });

  let coupon = null;
  let couponDiscount = 0;
  let couponError = "";
  if (bodyData.couponCode || body.coupon?.code) {
    coupon = await findActiveCoupon(
      coupons,
      bodyData.couponCode || body.coupon?.code,
    );
    couponError = getCouponInvalidReason(coupon, preCouponTotals, {
      ...couponContext,
      educationOffer,
    });
    couponDiscount = couponError
      ? 0
      : computeCouponDiscount(coupon, preCouponTotals);
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
    coupon:
      coupon && !couponError
        ? normalizeCouponForPublic(coupon, couponDiscount)
        : null,
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

  return (
    candidates.find((candidate) => {
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
        candidateValues.some(
          (value) =>
            value === needle ||
            value.includes(needle) ||
            needle.includes(value),
        ),
      );
    }) || null
  );
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
    normalized.price,
  );
  const originalPrice = firstPositiveNumber(
    matchedOption?.originalPrice,
    matchedOption?.listedPrice,
    matchedOption?.priceBeforeDiscount,
    product.originalPrice,
    product.listedPrice,
    normalized.originalPrice,
    price,
  );
  const quantity = cleanCartQuantity(rawItem.quantity || 1);

  if (!price) {
    throw new Error(
      `Sản phẩm "${normalized.name || rawItem.name || rawItem.slug}" chưa có giá bán hợp lệ.`,
    );
  }

  const item = sanitizeCartItem({
    productId: String(
      product._id || normalized.id || rawItem.productId || normalized.slug,
    ),
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
            variantId:
              selectedOptions.variantId ||
              String(matchedOption.id || matchedOption._id || ""),
            variantName:
              selectedOptions.variantName ||
              matchedOption.name ||
              matchedOption.label ||
              "",
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
    240,
  );
}

async function resolveOrderItemsFromDb({
  productDetails,
  products,
  rawItems = [],
}) {
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
  ]
    .map((value) => slugify(value))
    .filter(Boolean)
    .join("::");
}

async function ensureInventoryIndexes(inventory) {
  if (inventoryIndexesReady) return;

  await Promise.all([
    inventory.createIndex(
      { key: 1 },
      { unique: true, name: "unique_inventory_key" },
    ),
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
              stock:
                Number.isFinite(initialStock) && initialStock > 0
                  ? initialStock
                  : 100,
              reservedStock: 0,
              soldCount: 0,
              createdAt: now,
            },
            $set: { updatedAt: now },
          },
          { upsert: true },
        );
        doc = await inventory.findOne({ key });
      }

      const stock = Number(doc.stock || 0);
      const reservedStock = Number(doc.reservedStock || 0);
      const availableStock = Math.max(0, stock - reservedStock);
      if (availableStock < quantity) {
        throw new Error(
          `Sản phẩm "${item.name}" chỉ còn ${availableStock} sản phẩm trong kho.`,
        );
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
        },
      );
      reserved.push({ key, quantity });
    }
  } catch (error) {
    await Promise.all(
      reserved.map((entry) =>
        inventory.updateOne(
          { key: entry.key },
          {
            $inc: { reservedStock: -entry.quantity },
            $set: { updatedAt: new Date() },
          },
        ),
      ),
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
        {
          $inc: { reservedStock: -entry.quantity },
          $set: { updatedAt: new Date() },
        },
      ),
    ),
  );
}

function validateOrderPayload({
  customer,
  receiver,
  shippingAddress,
  shippingChoice,
  items,
}) {
  if (!items.length) return "Giỏ hàng đang trống, không thể tạo đơn hàng.";
  if (!customer.fullName) return "Vui lòng nhập họ tên khách hàng.";
  if (!/^0\d{9}$/.test(customer.phone))
    return "Số điện thoại khách hàng cần gồm 10 chữ số và bắt đầu bằng 0.";
  if (!customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return "Vui lòng nhập email hợp lệ để nhận hóa đơn VAT.";
  }
  if (!receiver.fullName) return "Vui lòng nhập họ tên người nhận.";
  if (!/^0\d{9}$/.test(receiver.phone))
    return "Số điện thoại người nhận cần gồm 10 chữ số và bắt đầu bằng 0.";
  const isStorePickup = shippingChoice?.type === "store";
  if (
    !shippingAddress.province ||
    !shippingAddress.district ||
    !shippingAddress.addressLine
  ) {
    return "Vui lòng nhập đầy đủ tỉnh/thành, quận/huyện, phường/xã và địa chỉ nhận hàng.";
  }
  if (!isStorePickup && !shippingAddress.ward)
    return "Vui lòng nhập đầy đủ Phường / Xã.";
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
  const match = String(value || "")
    .toUpperCase()
    .match(/CPS\d{8}[A-Z0-9]{6}/);
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
      body.data?.transferAmount,
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
      body.transactionId ||
        body.bankReference ||
        body.reference ||
        body.referenceCode ||
        body.tid ||
        body.transaction?.id ||
        body.data?.id,
      120,
    ),
    bankReference: cleanLimitedText(
      body.bankReference ||
        body.refNo ||
        body.referenceCode ||
        body.transaction?.reference ||
        body.data?.reference,
      120,
    ),
    description: cleanLimitedText(
      body.description ||
        body.content ||
        body.memo ||
        body.transaction?.description ||
        body.data?.description,
      500,
    ),
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
        id:
          item.id || item.transactionId || item.tid || item.referenceCode || "",
        content: item.content || item.description || item.memo || "",
        amount: item.amount || item.transferAmount || "",
      });
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .filter((item) => {
      const type = cleanLimitedText(
        item.transferType || item.type || item.direction,
        40,
      ).toLowerCase();
      return !type || !["out", "withdraw", "debit", "chi"].includes(type);
    });
}

async function markOrderBankPaymentPaid({
  orders,
  identifier = "",
  body = {},
  actor = "webhook",
}) {
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
            ...(ObjectId.isValid(identifier)
              ? [{ _id: new ObjectId(identifier) }]
              : []),
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

  const expectedAmount = Number(
    order.totals?.total ||
      order.totals?.roundedTotal ||
      order.payment?.amount ||
      0,
  );
  const receivedAmount = getPaymentConfirmationAmount(body);
  if (
    receivedAmount > 0 &&
    expectedAmount > 0 &&
    receivedAmount < expectedAmount
  ) {
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
        statusLabel:
          order.status === "pending" ? "Đã xác nhận" : order.statusLabel,
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
    { returnDocument: "after" },
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
    const result = await markOrderBankPaymentPaid({
      orders,
      body: transaction,
      actor: "bank-webhook",
    });
    const confirmation = compactPaymentConfirmation(transaction);
    if (confirmation.transactionId || result.order?.orderCode) {
      try {
        await payments.updateOne(
          {
            transactionId:
              confirmation.transactionId ||
              `${result.order?.orderCode || "unmatched"}-${confirmation.receivedAt.getTime()}`,
          },
          {
            $setOnInsert: {
              transactionId:
                confirmation.transactionId ||
                `${result.order?.orderCode || "unmatched"}-${confirmation.receivedAt.getTime()}`,
              orderCode:
                result.order?.orderCode ||
                getPaymentConfirmationReference(transaction),
              amount: confirmation.amount,
              status: result.error ? "unmatched" : "paid",
              raw: transaction,
              createdAt: new Date(),
            },
            $set: {
              updatedAt: new Date(),
            },
          },
          { upsert: true },
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
      message:
        "Đã nhận webhook nhưng chưa tìm thấy đơn hàng khớp nội dung chuyển khoản.",
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
  const {
    db,
    orders,
    carts,
    products,
    productDetails,
    inventory,
    coupons,
    userEvents,
    notifications,
  } = await getDb();
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
        identifier:
          owner?.userId ||
          parsed.data.customer?.email ||
          parsed.data.customer?.phone ||
          "",
        max: Number(process.env.RATE_LIMIT_ORDER_MAX || 20),
        message: "Bạn tạo đơn hàng quá nhanh. Vui lòng thử lại sau ít phút.",
      })
    ) {
      return;
    }

    const bodyData = parsed.data;
    if (bodyData.educationOffer) {
      if (!owner?.userId || !ObjectId.isValid(owner.userId)) {
        sendError(
          res,
          403,
          "Vui lòng đăng nhập và xác minh S-Student/S-Teacher để dùng ưu đãi giáo dục.",
        );
        return;
      }
      const member = await db
        .collection(process.env.USERS_COLLECTION || "smember_users")
        .findOne({
          _id: new ObjectId(owner.userId),
          "educationVerification.status": "verified",
          "educationVerification.expiresAt": { $gt: new Date() },
        });
      if (!member) {
        sendError(
          res,
          403,
          "Tài khoản chưa xác minh S-Student/S-Teacher hoặc xác minh đã hết hạn.",
        );
        return;
      }
    }
    const rawItems = Array.isArray(bodyData.items) ? bodyData.items : [];
    let items;

    try {
      items = await resolveOrderItemsFromDb({
        productDetails,
        products,
        rawItems,
      });
    } catch (error) {
      sendError(
        res,
        400,
        error.message || "Không thể xác thực sản phẩm trong đơn hàng.",
      );
      return;
    }

    const customer = sanitizeOrderPerson(bodyData.customer, owner || {});
    const receiver = sanitizeOrderPerson(
      bodyData.receiver || bodyData.recipient,
      customer,
    );
    const shippingAddress = sanitizeShippingAddress({
      ...(bodyData.shippingAddress || bodyData.address || {}),
      receiverName: receiver.fullName,
      receiverPhone: receiver.phone,
    });
    const educationOffer = Boolean(bodyData.educationOffer);
    const companyInvoice = sanitizeCompanyInvoice({
      ...(bodyData.companyInvoice || {}),
      requested: educationOffer
        ? false
        : Boolean(bodyData.companyInvoice?.requested),
    });
    const shippingChoice = sanitizeShippingChoice(
      bodyData.shippingChoice || bodyData.shipping || {},
    );
    const validationError = validateOrderPayload({
      customer,
      receiver,
      shippingAddress,
      shippingChoice,
      items,
    });

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
      const couponMember = await getCouponMember(req, db);
      const couponError = getCouponInvalidReason(
        appliedCoupon,
        preCouponTotals,
        {
          member: couponMember,
          educationOffer,
        },
      );
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
    const paymentMethod = sanitizePaymentMethod(
      bodyData.paymentMethod || bodyData.payment?.method,
    );
    let reservations = [];

    try {
      reservations = await reserveInventoryForOrder(
        inventory,
        items,
        orderCode,
      );
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
        ? bodyData.gifts
            .map((gift) => cleanLimitedText(gift, 180))
            .filter(Boolean)
            .slice(0, 10)
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
          { $inc: { usedCount: 1 }, $set: { updatedAt: now } },
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
          { $set: { items: [], updatedAt: now } },
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
    const docs = await orders
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
    sendJson(res, 200, { ok: true, data: docs.map(normalizeOrder) });
    return;
  }

  if (identifier && pathParts[3] === "tracking" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const phone = sanitizePhone(url.searchParams.get("phone"));
    const doc = await orders.findOne({
      $or: [
        { orderCode: identifier },
        ...(ObjectId.isValid(identifier)
          ? [{ _id: new ObjectId(identifier) }]
          : []),
      ],
    });

    if (!doc) {
      sendError(res, 404, "Order not found.");
      return;
    }

    const canViewByOwner =
      doc.userId && (owner?.role === "admin" || owner?.userId === doc.userId);
    const canViewByPhone =
      !doc.userId &&
      phone &&
      [doc.customer?.phone, doc.receiver?.phone]
        .filter(Boolean)
        .includes(phone);
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
        ...(ObjectId.isValid(identifier)
          ? [{ _id: new ObjectId(identifier) }]
          : []),
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

  if (
    identifier &&
    pathParts[3] === "payment" &&
    pathParts[4] === "qr" &&
    ["GET", "POST"].includes(req.method)
  ) {
    const doc = await orders.findOne({
      $or: [
        { orderCode: identifier },
        ...(ObjectId.isValid(identifier)
          ? [{ _id: new ObjectId(identifier) }]
          : []),
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

    const payment =
      doc.payment?.method === "bank_qr"
        ? doc.payment
        : buildOrderPayment({
            method: "bank_qr",
            orderCode: doc.orderCode,
            totals: doc.totals || {},
          });

    if (doc.payment?.method !== "bank_qr") {
      await orders.updateOne(
        { _id: doc._id },
        { $set: { payment, updatedAt: new Date() } },
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

  if (
    identifier &&
    pathParts[3] === "payment" &&
    pathParts[4] === "confirm" &&
    req.method === "POST"
  ) {
    const body = await parseJsonBody(req);
    if (!isBankPaymentConfirmationAuthorized(req, body)) {
      sendError(
        res,
        401,
        "Bạn không có quyền xác nhận thanh toán đơn hàng này.",
      );
      return;
    }

    const actor = isAdminAuthorized(req) ? "admin" : "bank-webhook";
    const result = await markOrderBankPaymentPaid({
      orders,
      identifier,
      body,
      actor,
    });
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
        ...(ObjectId.isValid(identifier)
          ? [{ _id: new ObjectId(identifier) }]
          : []),
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
  const fullName = cleanLimitedText(
    input.fullName || input.name || owner.username || owner.email,
    120,
  );
  const phone = sanitizePhone(input.phone);
  const province = cleanLimitedText(input.province || input.city, 120);
  const district = cleanLimitedText(input.district, 120);
  const ward = cleanLimitedText(input.ward, 120);
  const addressLine = cleanLimitedText(
    input.addressLine || input.address || input.street,
    260,
  );
  const fullAddress = cleanLimitedText(
    input.fullAddress ||
      [addressLine, ward, district, province].filter(Boolean).join(", "),
    700,
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
  const warrantyMonths = Number(
    item.warrantyMonths || item.warranty?.months || 12,
  );
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
    invoiceStatus:
      invoice.invoiceStatus ||
      invoice.status ||
      (invoice.requested ? "pending" : "not_requested"),
    companyName: invoice.companyName || "",
    taxCode: invoice.taxCode || "",
    companyAddress: invoice.companyAddress || "",
    invoiceEmail:
      invoice.invoiceEmail || invoice.email || order.customer?.email || "",
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
      (order.items || []).map((item, index) =>
        buildWarrantyItemFromOrder(order, item, index),
      ),
    );
    sendJson(res, 200, { ok: true, data: warranties });
    return;
  }

  if (resource === "invoices" && req.method === "GET") {
    const docs = await orders
      .find(query)
      .project({
        orderCode: 1,
        companyInvoice: 1,
        customer: 1,
        totals: 1,
        payment: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .toArray();
    sendJson(res, 200, { ok: true, data: docs.map(normalizeOrderInvoice) });
    return;
  }

  if (resource === "vouchers" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      message:
        "Mã giảm giá không tự gán vào tài khoản. Khách cần nhập mã ở bước thanh toán.",
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
      metadata:
        input.metadata && typeof input.metadata === "object"
          ? input.metadata
          : {},
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
  if (order.userId && owner?.userId === order.userId)
    return { ok: true, mode: "owner" };
  const normalizedPhone = sanitizePhone(phone || owner?.phone || "");
  if (
    normalizedPhone &&
    [order.customer?.phone, order.receiver?.phone]
      .filter(Boolean)
      .includes(normalizedPhone)
  ) {
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
      12,
  );
  const warrantyUntil =
    warrantyDoc?.warrantyUntil || addMonths(order.createdAt, warrantyMonths);

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
    const parsed = parseWithSchema(
      returnRequestSchema,
      await parseJsonBody(req),
    );
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
      sendError(
        res,
        403,
        "Bạn không có quyền tạo yêu cầu đổi trả cho đơn hàng này.",
      );
      return;
    }

    if (["cancelled", "refunded"].includes(order.status)) {
      sendError(
        res,
        400,
        "Đơn hàng đã hủy hoặc hoàn tiền, không thể tạo yêu cầu đổi trả mới.",
      );
      return;
    }

    const orderItems = Array.isArray(order.items) ? order.items : [];
    if (!orderItems.length) {
      sendError(res, 400, "Đơn hàng không có sản phẩm để đổi trả.");
      return;
    }

    const lookupKey = String(
      input.productId || input.productSlug || input.productName || "",
    ).trim();

    let selectedItem = null;

    if (lookupKey) {
      selectedItem = orderItems.find((item) =>
        [item.productId, item.mongoId, item.slug, item.sku, item.name]
          .filter(Boolean)
          .some((value) => String(value).includes(lookupKey)),
      );
    } else if (orderItems.length === 1) {
      selectedItem = orderItems[0];
    }

    if (!selectedItem) {
      sendError(
        res,
        400,
        "Không tìm thấy sản phẩm trong đơn hàng để tạo yêu cầu đổi trả.",
      );
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
      productName:
        selectedItem.name || selectedItem.productName || "Sản phẩm CellphoneS",
      productImage:
        selectedItem.image ||
        selectedItem.thumbnail ||
        selectedItem.primaryImage ||
        "",
      reason: cleanLimitedText(input.reason, 1000),
      status: "pending",
      statusLabel: "Chờ tiếp nhận",
      customerPhone: sanitizePhone(
        input.customerPhone || order.customer?.phone || order.receiver?.phone,
      ),
      images: Array.isArray(input.images)
        ? input.images
            .slice(0, 6)
            .map((item) => cleanLimitedText(item, 1000))
            .filter(Boolean)
        : [],
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
        ...(ObjectId.isValid(identifier)
          ? [{ _id: new ObjectId(identifier) }]
          : []),
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

    if (
      !doc.userId &&
      phone &&
      doc.customerPhone &&
      phone !== doc.customerPhone
    ) {
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
  const orderCode = cleanLimitedText(
    body.orderCode || url.searchParams.get("orderCode"),
    80,
  );
  const phone = sanitizePhone(
    body.phone || body.customerPhone || url.searchParams.get("phone"),
  );
  const productKey = cleanLimitedText(
    body.productId ||
      body.productSlug ||
      url.searchParams.get("productId") ||
      url.searchParams.get("slug"),
    240,
  );

  const order = await findOrderForService(orders, orderCode);
  if (!order) {
    sendError(res, 404, "Không tìm thấy đơn hàng để tra cứu bảo hành.");
    return;
  }

  const access = getOrderAccess(owner, order, phone);
  if (!access.ok) {
    sendError(
      res,
      403,
      "Bạn không có quyền tra cứu bảo hành của đơn hàng này.",
    );
    return;
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const filteredItems = productKey
    ? items.filter((item) =>
        [item.productId, item.mongoId, item.slug, item.sku, item.name].some(
          (value) => String(value || "").includes(productKey),
        ),
      )
    : items;
  const warrantyDocs = await warranties
    .find({ orderCode: order.orderCode })
    .toArray()
    .catch(() => []);
  const warrantyByProduct = new Map(
    warrantyDocs.map((doc) => [
      doc.productId || doc.productSlug || doc.productName,
      doc,
    ]),
  );
  const data = filteredItems.map((item) => {
    const doc =
      warrantyByProduct.get(item.productId) ||
      warrantyByProduct.get(item.slug) ||
      warrantyByProduct.get(item.name);
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
  const paymentStatus = String(
    order.payment?.status || order.paymentStatus || "",
  )
    .trim()
    .toLowerCase();
  const paymentMethod = String(
    order.payment?.method || order.paymentMethod || "",
  )
    .trim()
    .toLowerCase();

  if (["failed", "refunded", "cancelled"].includes(paymentStatus)) return false;

  if (
    [
      "bank_qr",
      "bank-qr",
      "vietqr",
      "qr",
      "bank_transfer",
      "bank-transfer",
    ].includes(paymentMethod)
  ) {
    return ["paid", "completed", "success", "succeeded"].includes(
      paymentStatus,
    );
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
    (sum, order) =>
      sum + cleanCartPrice(order.totals?.total || order.totals?.roundedTotal),
    0,
  );

  const totalOrders = eligibleDocs.length;
  const points = Math.floor(totalSpent / 100000);
  const memberRank = buildMemberRank(totalSpent);
  const nextRankSpent =
    memberRank === "S-NEW" ? 3000000 : memberRank === "S-MEM" ? 20000000 : null;

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
      remainingToNextRank: nextRankSpent
        ? Math.max(0, nextRankSpent - totalSpent)
        : 0,
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
      await addresses.updateMany(
        { userId: owner.userId },
        { $set: { isDefault: false, updatedAt: now } },
      );
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

    await addresses.updateMany(
      { userId: owner.userId },
      { $set: { isDefault: false, updatedAt: now } },
    );
    const result = await addresses.findOneAndUpdate(
      query,
      { $set: { isDefault: true, updatedAt: now } },
      { returnDocument: "after" },
    );
    sendJson(res, 200, {
      ok: true,
      data: normalizeAddress(result?.value || result),
    });
    return;
  }

  if (["PATCH", "PUT"].includes(req.method)) {
    const parsed = parseWithSchema(
      addressUpdateSchema,
      await parseJsonBody(req),
    );
    if (!parsed.ok) {
      sendError(res, 400, "Địa chỉ nhận hàng không hợp lệ.", parsed.message);
      return;
    }

    const now = new Date();
    const update = normalizeAddressPayload(parsed.data);
    if (!Object.prototype.hasOwnProperty.call(parsed.data, "isDefault"))
      delete update.isDefault;
    for (const [key, value] of Object.entries(update)) {
      if (value === "" || value === undefined) delete update[key];
    }
    update.updatedAt = now;

    if (update.isDefault) {
      await addresses.updateMany(
        { userId: owner.userId },
        { $set: { isDefault: false, updatedAt: now } },
      );
    }

    const result = await addresses.findOneAndUpdate(
      query,
      { $set: update },
      { returnDocument: "after" },
    );
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
    const fromDetails = await findProductByIdentifier(
      productDetails,
      identifier,
    );
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
    const parsed = parseWithSchema(
      wishlistItemSchema,
      await parseJsonBody(req),
    );
    if (!parsed.ok) {
      sendError(res, 400, "Sản phẩm yêu thích không hợp lệ.", parsed.message);
      return;
    }

    const product = await resolveWishlistProduct({
      productDetails,
      products,
      item: parsed.data,
    });
    if (!product) {
      sendError(res, 404, "Không tìm thấy sản phẩm để thêm vào yêu thích.");
      return;
    }

    const normalizedProduct = normalizeProduct(product);
    const productId = String(
      product._id ||
        normalizedProduct.id ||
        parsed.data.productId ||
        normalizedProduct.slug,
    );
    const now = new Date();
    const doc = {
      userId: owner.userId,
      productId,
      productSlug: normalizedProduct.slug || parsed.data.slug || "",
      productSku: normalizedProduct.sku || parsed.data.sku || "",
      productName: normalizedProduct.name || "",
      productUrl: normalizedProduct.url || parsed.data.url || "",
      productImage:
        normalizedProduct.image || normalizedProduct.primaryImage || "",
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
      { upsert: true },
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
        ...(ObjectId.isValid(identifier)
          ? [{ _id: new ObjectId(identifier) }]
          : []),
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
    const docs = await notifications
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
    sendJson(res, 200, { ok: true, data: docs.map(normalizeNotification) });
    return;
  }

  if (identifier === "read-all" && ["POST", "PATCH"].includes(req.method)) {
    await notifications.updateMany(
      { userId: owner.userId, readAt: null },
      { $set: { readAt: new Date() } },
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
      { returnDocument: "after" },
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
  const slug =
    product?.slug || stripHtmlExtension(identifier) || product?.sku || "";

  return {
    productId: product?._id ? String(product._id) : "",
    productSlug: slug,
    productSku: product?.sku || "",
    productName: product?.name || "Sản phẩm CellphoneS",
    productUrl: product?.url || resolveProductDetailUrl(identifier, product),
    productImage:
      product?.primaryImage ||
      product?.thumbnail ||
      product?.image ||
      product?.images?.[0] ||
      "",
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
  const approvedReviews = reviews.filter(
    (review) => review.status !== "hidden" && review.status !== "rejected",
  );
  const total = approvedReviews.length;
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: approvedReviews.filter((review) => Number(review.rating) === stars)
      .length,
  }));
  const rating = total
    ? approvedReviews.reduce(
        (sum, review) => sum + Number(review.rating || 0),
        0,
      ) / total
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
    body.authorName ||
      body.fullName ||
      requester?.fullName ||
      requester?.email ||
      "Khách hàng CellphoneS",
    120,
  );
  const content = cleanLimitedText(
    parsed.data.content || body.comment || body.review,
    2000,
  );

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
    body.authorName ||
      body.fullName ||
      requester?.fullName ||
      requester?.email ||
      "Khách hàng CellphoneS",
    120,
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
    coupons.createIndex(
      { code: 1 },
      { unique: true, name: "unique_coupon_code" },
    ),
    coupons.createIndex(
      { status: 1, expiresAt: 1 },
      { name: "coupons_status_expiry" },
    ),
  ]);

  couponIndexesReady = true;
}

async function handleCouponApply(req, res) {
  const { db, coupons } = await getDb();
  await ensureCouponIndexes(coupons);

  const body = await parseJsonBody(req);
  const code = cleanLimitedText(body.code || body.couponCode, 80).toUpperCase();
  const subtotal = cleanCartPrice(
    body.subtotal || body.totals?.subtotal || body.total,
  );
  const shippingFee = cleanCartPrice(
    body.shippingFee || body.totals?.shippingFee,
  );

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
  const code = cleanLimitedText(
    body.code || body.couponCode || body.coupon?.code,
    80,
  ).toUpperCase();

  if (!code) {
    sendError(res, 400, "Vui lòng nhập mã giảm giá.");
    return;
  }

  let subtotal = cleanCartPrice(
    body.subtotal || body.totals?.subtotal || body.total,
  );
  let shippingFee = cleanCartPrice(
    body.shippingFee || body.totals?.shippingFee,
  );
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
      sendError(
        res,
        error.statusCode || 400,
        error.message || "Không thể kiểm tra mã giảm giá.",
      );
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

async function handleCouponsAvailable(req, res) {
  const { db, coupons } = await getDb();
  await ensureCouponIndexes(coupons);
  const now = new Date();
  const docs = await coupons
    .find({
      status: "active",
      $and: [
        {
          $or: [
            { startsAt: { $exists: false } },
            { startsAt: null },
            { startsAt: { $lte: now } },
          ],
        },
        {
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gte: now } },
          ],
        },
      ],
    })
    .sort({ expiresAt: 1, createdAt: -1 })
    .limit(50)
    .toArray();
  const member = await getCouponMember(req, db);
  const eligibleDocs = docs.filter(
    (coupon) => !getCouponAudienceInvalidReason(coupon, member),
  );

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
      if (
        education.status !== "verified" ||
        (education.expiresAt && new Date(education.expiresAt) <= new Date())
      ) {
        sendError(
          res,
          403,
          "Tài khoản chưa xác minh S-Student/S-Teacher hoặc xác minh đã hết hạn.",
        );
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
    sendError(
      res,
      error.statusCode || 400,
      error.message || "Không thể tính thử đơn hàng.",
    );
  }
}

async function ensureUserEventIndexes(userEvents) {
  if (userEventIndexesReady) return;

  await Promise.all([
    userEvents.createIndex(
      { type: 1, createdAt: -1 },
      { name: "events_type_created_at" },
    ),
    userEvents.createIndex(
      { userId: 1, createdAt: -1 },
      { name: "events_user_created_at" },
    ),
    userEvents.createIndex(
      { productId: 1, createdAt: -1 },
      { name: "events_product_created_at" },
    ),
    userEvents.createIndex(
      { slug: 1, createdAt: -1 },
      { name: "events_slug_created_at" },
    ),
  ]);

  userEventIndexesReady = true;
}

async function handleCreateUserEvent(req, res, options = {}) {
  const { userEvents, productDetails, products } = await getDb();
  await ensureUserEventIndexes(userEvents);
  const requester = getRequestUser(req);
  const body = await parseJsonBody(req);
  const type = cleanLimitedText(
    options.type || body.type || body.eventType,
    80,
  );

  if (
    !["view_product", "search", "add_to_cart", "order_created"].includes(type)
  ) {
    sendError(res, 400, "Event type không hợp lệ.");
    return;
  }

  let product = null;
  if (type === "view_product") {
    const identifier = cleanLimitedText(
      body.productId || body.id || body.slug || getSlugFromUrl(body.url || ""),
      240,
    );
    if (identifier) {
      product =
        (await findProductByIdentifier(productDetails, identifier)) ||
        (await findProductByIdentifier(products, identifier));
    }
  }
  const normalizedProduct = product ? normalizeProduct(product) : null;

  const doc = {
    type,
    userId: requester?.sub || requester?.id || "",
    productId: cleanLimitedText(
      normalizedProduct?.id || body.productId || body.id,
      180,
    ),
    slug: stripHtmlExtension(
      normalizedProduct?.slug || body.slug || getSlugFromUrl(body.url || ""),
    ),
    keyword: cleanLimitedText(body.keyword || body.query, 240),
    category: cleanLimitedText(
      normalizedProduct?.category || body.category,
      180,
    ),
    brand: cleanLimitedText(normalizedProduct?.brand || body.brand, 120),
    productName: cleanLimitedText(
      normalizedProduct?.name || body.productName || body.name,
      300,
    ),
    productImage: cleanLimitedText(
      normalizedProduct?.image || body.productImage || body.image,
      700,
    ),
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
    data.push(
      product
        ? normalizeProduct(product)
        : {
            id: event.productId || event.slug,
            slug: event.slug || "",
            name: event.productName || "Sản phẩm đã xem",
            image: event.productImage || "",
            brand: event.brand || "",
            category: event.category || "",
          },
    );
    if (data.length >= limit) break;
  }

  sendJson(res, 200, { ok: true, data });
}

async function fetchRecommendationProducts({
  productDetails,
  query = {},
  limit = 12,
  sort = {},
}) {
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
    .sort(
      Object.keys(sort).length
        ? sort
        : { webFreshnessScore: -1, updatedAt: -1, scrapedAt: -1, _id: -1 },
    )
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
      ...(price
        ? [{ currentPrice: { $gte: price * 0.75, $lte: price * 1.35 } }]
        : []),
    ];
    const query = {
      _id: { $ne: base._id },
      ...(relatedOr.length ? { $or: relatedOr } : {}),
    };

    const data = await fetchRecommendationProducts({
      productDetails,
      query,
      limit,
    });
    sendJson(res, 200, { ok: true, baseProduct: normalizeProduct(base), data });
    return;
  }

  if (action === "for-you") {
    const requester = getRequestUser(req);
    const recentEvents = requester?.sub
      ? await userEvents
          .find({ userId: requester.sub })
          .sort({ createdAt: -1 })
          .limit(10)
          .toArray()
      : [];
    const brands = uniqueStrings(
      recentEvents.map((event) => event.brand),
    ).filter(Boolean);
    const categories = uniqueStrings(
      recentEvents.map((event) => event.category),
    ).filter(Boolean);
    const query =
      brands.length || categories.length
        ? {
            $or: [
              { brand: { $in: brands } },
              { categories: { $in: categories } },
            ],
          }
        : {};
    const data = await fetchRecommendationProducts({
      productDetails,
      query,
      limit,
    });
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
  const message = cleanLimitedText(
    body.message || body.text || body.query,
    500,
  );

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

async function writeApiAdminAuditLog(
  adminAuditLogs,
  req,
  action,
  targetType,
  targetId,
  changes = {},
) {
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
  await writeApiAdminAuditLog(
    adminAuditLogs,
    req,
    "create",
    "product",
    inserted?._id,
    {
      after: inserted,
    },
  );

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
    { returnDocument: "after" },
  );

  if (!result) {
    sendError(res, 404, "Product not found.");
    return;
  }

  await writeApiAdminAuditLog(
    adminAuditLogs,
    req,
    "update",
    "product",
    existing._id,
    {
      before: existing,
      after: result,
    },
  );

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

  await writeApiAdminAuditLog(
    adminAuditLogs,
    _req,
    "delete",
    "product",
    existing._id,
    {
      before: result,
    },
  );

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

  if (
    pathParts[1] === "checkout" &&
    pathParts[2] === "preview" &&
    req.method === "POST"
  ) {
    await handleCheckoutPreview(req, res);
    return;
  }

  if (
    pathParts[1] === "payments" &&
    pathParts[2] === "bank-transfer-webhook" &&
    req.method === "POST"
  ) {
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

  if (
    pathParts[1] === "smember" &&
    pathParts[2] === "profile" &&
    req.method === "GET"
  ) {
    await handleSmemberProfile(req, res);
    return;
  }

  if (
    pathParts[1] === "coupons" &&
    pathParts[2] === "apply" &&
    req.method === "POST"
  ) {
    await handleCouponApply(req, res);
    return;
  }

  if (
    pathParts[1] === "coupons" &&
    pathParts[2] === "validate" &&
    req.method === "POST"
  ) {
    await handleCouponValidate(req, res);
    return;
  }

  if (
    pathParts[1] === "coupons" &&
    pathParts[2] === "available" &&
    req.method === "GET"
  ) {
    await handleCouponsAvailable(req, res);
    return;
  }

  if (
    pathParts[1] === "warranty" &&
    pathParts[2] === "check" &&
    ["GET", "POST"].includes(req.method)
  ) {
    await handleWarrantyCheck(req, res);
    return;
  }

  if (pathParts[1] === "returns") {
    await handleReturnsRequest(req, res, pathParts);
    return;
  }

  if (
    pathParts[1] === "user-events" &&
    pathParts[2] === "view-product" &&
    req.method === "POST"
  ) {
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

  if (
    pathParts[1] === "chatbot" &&
    pathParts[2] === "message" &&
    req.method === "POST"
  ) {
    await handleChatbotMessage(req, res);
    return;
  }

  if (pathParts[1] === "stores" && req.method === "GET") {
    await handleListStores(req, res);
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
  const { dbName, productsCollection, productDetailsCollection } =
    getMongoConfig();
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
