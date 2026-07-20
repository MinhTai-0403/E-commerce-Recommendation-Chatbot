const cheerio = require("cheerio");

const GOOGLE_PLACES_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";
const CACHE_TTL_MS = Number(
  process.env.GOOGLE_PLACES_STORE_CACHE_TTL_MS || 10 * 60 * 1000,
);
const REQUEST_TIMEOUT_MS = Number(
  process.env.GOOGLE_PLACES_STORE_TIMEOUT_MS || 20000,
);
const MAX_PAGES = 3;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FIELD_MASK = [
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

const cache = new Map();

function cleanText(value = "", maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeText(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

function slugifyProvince(value = "") {
  return cleanText(value || "Hồ Chí Minh", 160)
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ho-chi-minh";
}

function normalizeProvince(value = "") {
  const text = cleanText(value, 160)
    .replace(/^Thành phố\s+/i, "")
    .replace(/^Tỉnh\s+/i, "")
    .trim();
  const key = normalizeText(text);
  const aliases = [
    ["ho chi minh", "Hồ Chí Minh"],
    ["ha noi", "Hà Nội"],
    ["da nang", "Đà Nẵng"],
    ["can tho", "Cần Thơ"],
    ["hai phong", "Hải Phòng"],
    ["ba ria vung tau", "Bà Rịa - Vũng Tàu"],
    ["thua thien hue", "Thừa Thiên - Huế"],
  ];
  return aliases.find(([alias]) => key.includes(alias))?.[1] || text;
}

function normalizeDistrict(value = "") {
  return cleanText(value, 160)
    .replace(/^District\s+/i, "Quận ")
    .trim();
}

function getAddressComponent(components = [], acceptedTypes = []) {
  const item = Array.isArray(components)
    ? components.find((component) => {
        const types = Array.isArray(component?.types) ? component.types : [];
        return acceptedTypes.some((type) => types.includes(type));
      })
    : null;
  return cleanText(item?.longText || item?.shortText || "", 160);
}

function getDistrictFromText(value = "") {
  const match = cleanText(value, 600).match(
    /(?:Q\.?|Quận|Huyện|TP\.?|Thành phố)\s*[^,]+/i,
  );
  return normalizeDistrict(match?.[0] || "");
}

function calculateDistanceKm(latitude1, longitude1, latitude2, longitude2) {
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

function applyFilters(stores, { province = "", district = "", query = "" }) {
  const provinceKey = normalizeText(province);
  const districtKey = normalizeText(district);
  const queryKey = normalizeText(query);
  return stores.filter((store) => {
    const searchable = normalizeText(
      [store.name, store.address, store.province, store.district, store.phone].join(
        " ",
      ),
    );
    return (
      (!provinceKey || searchable.includes(provinceKey)) &&
      (!districtKey || searchable.includes(districtKey)) &&
      (!queryKey || searchable.includes(queryKey))
    );
  });
}

function sortStores(stores, latitude, longitude) {
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return stores
      .map((store) => ({
        ...store,
        distanceKm: calculateDistanceKm(
          latitude,
          longitude,
          Number(store.latitude),
          Number(store.longitude),
        ),
      }))
      .sort(
        (first, second) =>
          (first.distanceKm ?? Number.POSITIVE_INFINITY) -
          (second.distanceKm ?? Number.POSITIVE_INFINITY),
      );
  }

  return stores.sort(
    (first, second) =>
      first.province.localeCompare(second.province, "vi") ||
      first.district.localeCompare(second.district, "vi") ||
      first.name.localeCompare(second.name, "vi"),
  );
}

function getOfficialAddress(schemaStore = {}, province = "") {
  const address = schemaStore.address;
  if (typeof address === "string") return cleanText(address, 600);
  const parts = [
    address?.streetAddress,
    address?.addressLocality,
    address?.addressRegion,
  ]
    .map((item) => cleanText(item, 240))
    .filter(Boolean);
  return parts.join(", ") || cleanText(schemaStore.name, 600);
}

function normalizeOfficialStore(schemaStore = {}, province = "") {
  const latitude = Number(schemaStore.geo?.latitude);
  const longitude = Number(schemaStore.geo?.longitude);
  const name = cleanText(schemaStore.name || "CellphoneS", 400);
  const address = getOfficialAddress(schemaStore, province);
  return {
    id: `official-${normalizeText(`${name}|${address}`).replace(/\s+/g, "-")}`,
    placeId: "",
    system: "cellphones",
    name,
    address,
    province: normalizeProvince(
      schemaStore.address?.addressRegion ||
        schemaStore.address?.addressLocality ||
        province,
    ),
    district: getDistrictFromText(address || name),
    phone: cleanText(schemaStore.telephone, 80),
    openingHours: ["08:00 - 22:00 (tất cả các ngày trong tuần)"],
    openNow: null,
    businessStatus: "OPERATIONAL",
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    googleMapsUri: "",
    source: "cellphones-official",
  };
}

function collectSchemaStores(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    value.forEach((item) => collectSchemaStores(item, output));
    return output;
  }
  const type = value["@type"];
  if (type === "Store" || (Array.isArray(type) && type.includes("Store"))) {
    output.push(value);
  }
  if (value["@graph"]) collectSchemaStores(value["@graph"], output);
  if (value.department) collectSchemaStores(value.department, output);
  if (value.itemListElement) collectSchemaStores(value.itemListElement, output);
  if (value.item) collectSchemaStores(value.item, output);
  return output;
}

async function fetchOfficialStores({ province = "", district = "", query = "" }) {
  const sourceUrl =
    `https://cellphones.com.vn/dia-chi-cua-hang/${slugifyProvince(province)}`;
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`CellphoneS trả về HTTP ${response.status}.`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const candidates = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      collectSchemaStores(JSON.parse($(element).text()), candidates);
    } catch {
      // Bỏ qua một JSON-LD không hợp lệ, tiếp tục đọc các block còn lại.
    }
  });

  const seen = new Set();
  const stores = candidates
    .map((entry) => normalizeOfficialStore(entry, province))
    .filter((store) => {
      const key = normalizeText(
        `${store.name}|${store.address}|${store.latitude}|${store.longitude}`,
      );
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    stores: applyFilters(stores, { province, district, query }),
    sourceUrl,
  };
}

function isCellphoneSPlace(place = {}) {
  const name = normalizeText(place.displayName?.text || place.displayName);
  return (
    place.businessStatus !== "CLOSED_PERMANENTLY" &&
    (name.includes("cellphones") ||
      name.includes("cellphone s") ||
      name.startsWith("cps "))
  );
}

function normalizeGoogleStore(place = {}) {
  const latitude = Number(place.location?.latitude);
  const longitude = Number(place.location?.longitude);
  const address = cleanText(
    place.formattedAddress || place.shortFormattedAddress,
    600,
  );
  return {
    id: cleanText(place.id, 200),
    placeId: cleanText(place.id, 200),
    system: "cellphones",
    name: cleanText(
      place.displayName?.text || place.displayName || "CellphoneS",
      240,
    ),
    address,
    province: normalizeProvince(
      getAddressComponent(place.addressComponents, [
        "administrative_area_level_1",
      ]),
    ),
    district:
      normalizeDistrict(
        getAddressComponent(place.addressComponents, [
          "administrative_area_level_2",
          "sublocality_level_1",
          "sublocality",
        ]),
      ) || getDistrictFromText(address),
    phone: cleanText(place.nationalPhoneNumber, 80),
    openingHours:
      place.currentOpeningHours?.weekdayDescriptions ||
      place.regularOpeningHours?.weekdayDescriptions ||
      [],
    openNow: place.currentOpeningHours?.openNow ?? null,
    businessStatus: cleanText(place.businessStatus, 80),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    googleMapsUri: cleanText(place.googleMapsUri, 1000),
    source: "google-places",
  };
}

function buildGoogleTextQuery({ province = "", district = "", query = "" }) {
  return [
    "cửa hàng CellphoneS",
    cleanText(query, 160),
    cleanText(district, 120),
    cleanText(province, 120),
    "Việt Nam",
  ]
    .filter(Boolean)
    .join(" ");
}

function getGoogleMapsApiKey() {
  const key = cleanText(process.env.GOOGLE_MAPS_API_KEY, 1000);
  if (key) return key;
  const error = new Error(
    "Không tải được nguồn cửa hàng CellphoneS và chưa cấu hình GOOGLE_MAPS_API_KEY cho Google Places.",
  );
  error.code = "GOOGLE_MAPS_API_KEY_MISSING";
  error.statusCode = 503;
  throw error;
}

async function requestGooglePage({
  textQuery,
  pageSize,
  pageToken = "",
  latitude,
  longitude,
  radius,
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
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    nextPageToken: cleanText(payload.nextPageToken, 2000),
  };
}

async function searchCellphoneStores(options = {}) {
  const province = cleanText(options.province || "Hồ Chí Minh", 120);
  const district = cleanText(options.district, 120);
  const query = cleanText(options.query || options.q, 160);
  const pageSize = Math.max(1, Math.min(Number(options.pageSize) || 20, 20));
  const maxPages = Math.max(
    1,
    Math.min(Number(options.maxPages) || MAX_PAGES, MAX_PAGES),
  );
  const parsedLatitude = Number(options.latitude);
  const parsedLongitude = Number(options.longitude);
  const latitude = Number.isFinite(parsedLatitude) ? parsedLatitude : null;
  const longitude = Number.isFinite(parsedLongitude) ? parsedLongitude : null;
  const radius = Math.max(
    1000,
    Math.min(Number(options.radius) || 50000, 50000),
  );
  const cacheKey = JSON.stringify({
    province,
    district,
    query,
    pageSize,
    maxPages,
    latitude,
    longitude,
    radius,
  });

  const cached = cache.get(cacheKey);
  if (
    options.forceRefresh !== true &&
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return { ...cached.value, cached: true };
  }

  try {
    const official = await fetchOfficialStores({ province, district, query });
    if (official.stores.length > 0) {
      const result = {
        stores: sortStores(official.stores, latitude, longitude),
        officialSourceUrl: official.sourceUrl,
        googleQuery: "",
        pagesFetched: 1,
        resultCount: official.stores.length,
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
      cache.set(cacheKey, {
        value: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return result;
    }
  } catch (error) {
    console.warn(
      "[stores] Không tải được nguồn CellphoneS, chuyển sang Google Places:",
      error.message,
    );
  }

  const textQuery = buildGoogleTextQuery({ province, district, query });
  const rawPlaces = [];
  let nextPageToken = "";
  let pagesFetched = 0;

  do {
    const page = await requestGooglePage({
      textQuery,
      pageSize,
      pageToken: nextPageToken,
      latitude,
      longitude,
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
        store.placeId || normalizeText(`${store.name}|${store.address}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  stores = sortStores(
    applyFilters(stores, { province, district, query }),
    latitude,
    longitude,
  );

  const result = {
    stores,
    googleQuery: textQuery,
    pagesFetched,
    resultCount: stores.length,
    cached: false,
    fetchedAt: new Date().toISOString(),
  };
  cache.set(cacheKey, {
    value: result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return result;
}

module.exports = {
  searchCellphoneStores,
};
