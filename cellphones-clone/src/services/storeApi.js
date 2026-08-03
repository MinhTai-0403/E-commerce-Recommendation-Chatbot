const DEFAULT_API_BASE_URL = import.meta.env.DEV ? "http://localhost:5050" : "";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

const cleanText = (value = "", maxLength = 300) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

const appendSearchParam = (searchParams, key, value) => {
  const cleanedValue = cleanText(value);

  if (!cleanedValue) {
    return;
  }

  searchParams.set(key, cleanedValue);
};

export const normalizeStore = (store = {}) => {
  const latitude = Number(store.latitude);

  const longitude = Number(store.longitude);

  const openingHours = Array.isArray(store.openingHours)
    ? store.openingHours
    : [];

  return {
    id: store.id || store.placeId || `${store.name}-${store.address}`,

    placeId: store.placeId || store.id || "",

    system: store.system || "cellphones",

    name: cleanText(store.name || "Cửa hàng CellphoneS", 250),

    address: cleanText(store.address, 600),

    province: cleanText(store.province, 150),

    district: cleanText(store.district, 150),

    phone: cleanText(store.phone, 80),

    openingHours,

    openNow: typeof store.openNow === "boolean" ? store.openNow : null,

    businessStatus: cleanText(store.businessStatus, 80),

    latitude: Number.isFinite(latitude) ? latitude : null,

    longitude: Number.isFinite(longitude) ? longitude : null,

    googleMapsUri: cleanText(store.googleMapsUri, 1200),

    source: store.source || "google-places",
  };
};

export const buildStoreApiUrl = (filters = {}) => {
  const searchParams = new URLSearchParams();

  appendSearchParam(searchParams, "province", filters.province);

  appendSearchParam(searchParams, "district", filters.district);

  appendSearchParam(searchParams, "q", filters.q || filters.keyword);

  appendSearchParam(searchParams, "lat", filters.latitude ?? filters.lat);

  appendSearchParam(searchParams, "lng", filters.longitude ?? filters.lng);

  appendSearchParam(searchParams, "radius", filters.radius);

  appendSearchParam(searchParams, "pageSize", filters.pageSize);

  appendSearchParam(searchParams, "maxPages", filters.maxPages);

  if (filters.refresh === true) {
    searchParams.set("refresh", "true");
  }

  const query = searchParams.toString();

  return `${API_BASE_URL}/api/stores${query ? `?${query}` : ""}`;
};

export async function fetchStores(filters = {}, signal) {
  const response = await fetch(buildStoreApiUrl(filters), {
    method: "GET",

    headers: {
      Accept: "application/json",
    },

    cache: "no-store",

    signal,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    const message =
      payload.message ||
      payload.details ||
      payload.error?.message ||
      payload.error ||
      "Không thể tải danh sách cửa hàng CellphoneS.";

    throw new Error(message);
  }

  const stores = Array.isArray(payload.data)
    ? payload.data.map(normalizeStore)
    : [];

  return {
    stores,

    meta: payload.meta || {},
  };
}

export async function fetchStoresByProvince(province, signal) {
  return fetchStores(
    {
      province,
      pageSize: 20,
      maxPages: 3,
    },
    signal,
  );
}

export async function searchStores(
  keyword,
  { province = "", district = "" } = {},
  signal,
) {
  return fetchStores(
    {
      province,
      district,
      q: keyword,
      pageSize: 20,
      maxPages: 3,
    },
    signal,
  );
}

export async function fetchNearbyStores(
  { latitude, longitude, radius = 20, province = "" },
  signal,
) {
  return fetchStores(
    {
      latitude,
      longitude,
      radius,
      province,
      pageSize: 20,
      maxPages: 3,
    },
    signal,
  );
}

export function getStoreGoogleMapsUrl(store) {
  if (store?.googleMapsUri) {
    return store.googleMapsUri;
  }

  if (
    Number.isFinite(Number(store?.latitude)) &&
    Number.isFinite(Number(store?.longitude))
  ) {
    return (
      "https://www.google.com/maps/search/?api=1" +
      `&query=${encodeURIComponent(`${store.latitude},${store.longitude}`)}`
    );
  }

  return (
    "https://www.google.com/maps/search/?api=1" +
    `&query=${encodeURIComponent(
      store?.address || store?.name || "CellphoneS",
    )}`
  );
}

export function getStoreDirectionsUrl(store, userLocation = null) {
  const destination =
    Number.isFinite(Number(store?.latitude)) &&
    Number.isFinite(Number(store?.longitude))
      ? `${store.latitude},${store.longitude}`
      : store?.address || store?.name || "CellphoneS";

  const searchParams = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "driving",
  });

  if (
    userLocation &&
    Number.isFinite(Number(userLocation.latitude)) &&
    Number.isFinite(Number(userLocation.longitude))
  ) {
    searchParams.set(
      "origin",
      `${userLocation.latitude},${userLocation.longitude}`,
    );
  }

  return "https://www.google.com/maps/dir/?" + searchParams.toString();
}

export function getStorePhoneUrl(phone = "") {
  const normalizedPhone = String(phone || "").replace(/[^\d+]/g, "");

  return normalizedPhone ? `tel:${normalizedPhone}` : "tel:18002097";
}

export function getTodayOpeningHours(openingHours = []) {
  if (!Array.isArray(openingHours) || openingHours.length === 0) {
    return "Liên hệ cửa hàng";
  }

  const today = new Date().getDay();

  const googleDayIndex = today === 0 ? 6 : today - 1;

  return openingHours[googleDayIndex] || openingHours[0] || "Liên hệ cửa hàng";
}
