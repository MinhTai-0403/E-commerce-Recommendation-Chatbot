const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20000;

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
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
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function normalizeText(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

function getApiKey() {
  const apiKey = cleanText(process.env.GOOGLE_MAPS_API_KEY, 500);

  if (!apiKey) {
    const error = new Error(
      "Thiếu GOOGLE_MAPS_API_KEY trong biến môi trường backend.",
    );

    error.statusCode = 503;
    throw error;
  }

  return apiKey;
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

function normalizeProvince(value = "") {
  const text = cleanText(value, 160)
    .replace(/^Thành phố\s+/i, "")
    .replace(/^Tỉnh\s+/i, "")
    .trim();

  const key = normalizeText(text);

  if (key.includes("ho chi minh")) {
    return "Hồ Chí Minh";
  }

  if (key.includes("ha noi")) {
    return "Hà Nội";
  }

  if (key.includes("da nang")) {
    return "Đà Nẵng";
  }

  if (key.includes("can tho")) {
    return "Cần Thơ";
  }

  if (key.includes("hai phong")) {
    return "Hải Phòng";
  }

  return text;
}

function normalizeDistrict(value = "") {
  return cleanText(value, 160)
    .replace(/^District\s+/i, "Quận ")
    .trim();
}

function isCellphoneS(place = {}) {
  const name = normalizeText(place.displayName?.text || place.displayName);

  const correctBrand =
    name.includes("cellphones") ||
    name.includes("cellphone s") ||
    name.startsWith("cps ");

  const stillOperating = place.businessStatus !== "CLOSED_PERMANENTLY";

  return correctBrand && stillOperating;
}

function normalizePlace(place = {}) {
  const latitude = Number(place.location?.latitude);

  const longitude = Number(place.location?.longitude);

  const province = normalizeProvince(
    getAddressComponent(place.addressComponents, [
      "administrative_area_level_1",
    ]),
  );

  const district = normalizeDistrict(
    getAddressComponent(place.addressComponents, [
      "administrative_area_level_2",
      "sublocality_level_1",
      "sublocality",
    ]),
  );

  return {
    id: cleanText(place.id, 200),

    placeId: cleanText(place.id, 200),

    system: "cellphones",

    name: cleanText(
      place.displayName?.text || place.displayName || "CellphoneS",
      240,
    ),

    address: cleanText(place.formattedAddress, 500),

    province,

    district,

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

function buildQuery({ province = "", district = "", q = "" } = {}) {
  return [
    "cửa hàng CellphoneS",
    cleanText(q, 120),
    cleanText(district, 120),
    cleanText(province, 120),
    "Việt Nam",
  ]
    .filter(Boolean)
    .join(" ");
}

async function requestPage({ textQuery, pageSize, pageToken = "" }) {
  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const body = {
      textQuery,
      languageCode: "vi",
      regionCode: "VN",
      pageSize,
    };

    if (pageToken) {
      body.pageToken = pageToken;
    }

    const response = await fetch(GOOGLE_PLACES_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        "X-Goog-Api-Key": getApiKey(),

        "X-Goog-FieldMask": FIELD_MASK,
      },

      body: JSON.stringify(body),

      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        payload?.error?.message ||
          `Google Places trả về HTTP ${response.status}.`,
      );

      error.statusCode = response.status;

      throw error;
    }

    return {
      places: Array.isArray(payload.places) ? payload.places : [],

      nextPageToken: cleanText(payload.nextPageToken, 2000),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function applyFilters(stores, { province = "", district = "", q = "" }) {
  const provinceKey = normalizeText(province);

  const districtKey = normalizeText(district);

  const queryKey = normalizeText(q);

  return stores.filter((store) => {
    const searchable = normalizeText(
      [
        store.name,
        store.address,
        store.province,
        store.district,
        store.phone,
      ].join(" "),
    );

    if (provinceKey && !searchable.includes(provinceKey)) {
      return false;
    }

    if (districtKey && !searchable.includes(districtKey)) {
      return false;
    }

    if (queryKey && !searchable.includes(queryKey)) {
      return false;
    }

    return true;
  });
}

async function searchCellphoneStores(options = {}) {
  const province = cleanText(options.province, 120);

  const district = cleanText(options.district, 120);

  const q = cleanText(options.q || options.query, 120);

  const pageSize = Math.max(1, Math.min(Number(options.pageSize) || 20, 20));

  const maxPages = Math.max(1, Math.min(Number(options.maxPages) || 3, 3));

  const forceRefresh = options.forceRefresh === true;

  const cacheKey = JSON.stringify({
    province,
    district,
    q,
    pageSize,
    maxPages,
  });

  const cached = cache.get(cacheKey);

  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.value,
      cached: true,
    };
  }

  const textQuery = buildQuery({
    province,
    district,
    q,
  });

  const rawPlaces = [];

  let nextPageToken = "";
  let pagesFetched = 0;

  do {
    const page = await requestPage({
      textQuery,
      pageSize,
      pageToken: nextPageToken,
    });

    rawPlaces.push(...page.places);

    nextPageToken = page.nextPageToken;

    pagesFetched += 1;
  } while (nextPageToken && pagesFetched < maxPages);

  const uniqueStores = new Map();

  rawPlaces
    .filter(isCellphoneS)
    .map(normalizePlace)
    .forEach((store) => {
      const key =
        store.placeId || normalizeText(`${store.name}|${store.address}`);

      if (key && !uniqueStores.has(key)) {
        uniqueStores.set(key, store);
      }
    });

  const stores = applyFilters([...uniqueStores.values()], {
    province,
    district,
    q,
  }).sort(
    (first, second) =>
      first.province.localeCompare(second.province, "vi") ||
      first.district.localeCompare(second.district, "vi") ||
      first.name.localeCompare(second.name, "vi"),
  );

  const result = {
    stores,

    googleQuery: textQuery,

    resultCount: stores.length,

    pagesFetched,

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
