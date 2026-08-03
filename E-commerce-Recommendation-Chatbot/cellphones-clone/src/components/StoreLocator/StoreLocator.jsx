import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchStores,
  getStoreDirectionsUrl,
  getStoreGoogleMapsUrl,
  getStorePhoneUrl,
  getTodayOpeningHours,
} from "../../services/storeApi";

import "./StoreLocator.css";
import GoogleMaps3D from "./GoogleMaps3D";

const COMMON_PROVINCES = [
  "Hồ Chí Minh",
  "Hà Nội",
  "Đà Nẵng",
  "Cần Thơ",
  "Hải Phòng",
  "Bình Dương",
  "Đồng Nai",
  "Bà Rịa - Vũng Tàu",
  "Khánh Hòa",
  "Lâm Đồng",
  "Long An",
  "Tiền Giang",
  "Tây Ninh",
  "Bình Thuận",
  "Bình Định",
  "Quảng Nam",
  "Quảng Ngãi",
  "Thừa Thiên - Huế",
  "Nghệ An",
  "Thanh Hóa",
  "Quảng Ninh",
  "Bắc Ninh",
  "Thái Nguyên",
];

const STORES_PER_PAGE = 10;

function createUniqueList(values = []) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  ).sort((first, second) => first.localeCompare(second, "vi"));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(
  firstLatitude,
  firstLongitude,
  secondLatitude,
  secondLongitude,
) {
  const latitude1 = Number(firstLatitude);
  const longitude1 = Number(firstLongitude);
  const latitude2 = Number(secondLatitude);
  const longitude2 = Number(secondLongitude);

  if (
    !Number.isFinite(latitude1) ||
    !Number.isFinite(longitude1) ||
    !Number.isFinite(latitude2) ||
    !Number.isFinite(longitude2)
  ) {
    return null;
  }

  const earthRadiusKm = 6371;

  const latitudeDifference = toRadians(latitude2 - latitude1);

  const longitudeDifference = toRadians(longitude2 - longitude1);

  const firstLatitudeRadians = toRadians(latitude1);

  const secondLatitudeRadians = toRadians(latitude2);

  const latitudeSine = Math.sin(latitudeDifference / 2);

  const longitudeSine = Math.sin(longitudeDifference / 2);

  const haversine =
    latitudeSine * latitudeSine +
    Math.cos(firstLatitudeRadians) *
      Math.cos(secondLatitudeRadians) *
      longitudeSine *
      longitudeSine;

  const safeHaversine = Math.min(1, Math.max(0, haversine));

  const centralAngle =
    2 * Math.atan2(Math.sqrt(safeHaversine), Math.sqrt(1 - safeHaversine));

  return earthRadiusKm * centralAngle;
}

function formatDistance(distance) {
  if (!Number.isFinite(distance)) {
    return "";
  }

  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }

  return `${distance.toFixed(1)} km`;
}

function formatPhoneNumber(phone = "") {
  const digits = String(phone || "").replace(/\D/g, "");

  if (!digits) {
    return "1800 2097";
  }

  if (digits.length === 10 || digits.length === 11) {
    return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7)].join(" ");
  }

  return phone;
}

function buildGoogleMapEmbedUrl(store) {
  if (!store) {
    return "";
  }

  const hasCoordinates =
    Number.isFinite(Number(store.latitude)) &&
    Number.isFinite(Number(store.longitude));

  const query = hasCoordinates
    ? `${store.latitude},${store.longitude}`
    : store.address || store.name || "CellphoneS";

  return (
    "https://www.google.com/maps" +
    `?q=${encodeURIComponent(query)}` +
    "&z=17" +
    "&output=embed"
  );
}

function LocationIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="store-locator-icon">
      <path
        d="M12 21s7-5.4 7-12A7 7 0 1 0 5 9c0 6.6 7 12 7 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <circle
        cx="12"
        cy="9"
        r="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="store-locator-icon">
      <path
        d="M7.1 3.5 4.9 5.7c-.8.8-.8 2.1-.3 3.4 1.8 4.5 5.8 8.5 10.3 10.3 1.3.5 2.6.5 3.4-.3l2.2-2.2-4.4-3-1.8 1.8c-2.4-1.2-4.8-3.6-6-6l1.8-1.8-3-4.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="store-locator-icon">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M12 7v5l3.5 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavigationIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="store-locator-icon">
      <path
        d="m21 3-8 18-2.6-7.4L3 11l18-8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="store-locator-icon">
      <circle
        cx="11"
        cy="11"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="m16 16 4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="store-locator-icon">
      <path
        d="M20 6v5h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M18.2 15a7 7 0 1 1-.8-7.2L20 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StoreCard({ store, selected, userLocation, onSelect }) {
  const distance = userLocation
    ? calculateDistanceKm(
        userLocation.latitude,
        userLocation.longitude,
        store.latitude,
        store.longitude,
      )
    : null;

  const todayOpeningHours = getTodayOpeningHours(store.openingHours);

  return (
    <article
      className={["store-card", selected ? "store-card--selected" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="store-card__select"
        onClick={() => onSelect(store)}
      >
        <span className="store-card__heading">
          <span className="store-card__marker">
            <LocationIcon />
          </span>

          <span className="store-card__title-wrap">
            <strong className="store-card__title">{store.name}</strong>

            {Number.isFinite(distance) && (
              <span className="store-card__distance">
                Cách bạn {formatDistance(distance)}
              </span>
            )}
          </span>
        </span>

        <span className="store-card__information">
          <span className="store-card__information-row">
            <LocationIcon />

            <span>{store.address || "Địa chỉ đang được cập nhật"}</span>
          </span>

          <span className="store-card__information-row">
            <ClockIcon />

            <span>{todayOpeningHours}</span>
          </span>

          <span className="store-card__information-row">
            <PhoneIcon />

            <span>{formatPhoneNumber(store.phone)}</span>
          </span>
        </span>
      </button>

      <div className="store-card__actions">
        <a
          href={getStorePhoneUrl(store.phone)}
          className="store-card__action"
          aria-label={`Gọi ${store.name}`}
        >
          <PhoneIcon />
          Gọi cửa hàng
        </a>

        <a
          href={getStoreDirectionsUrl(store, userLocation)}
          target="_blank"
          rel="noreferrer"
          className="store-card__action store-card__action--primary"
        >
          <NavigationIcon />
          Chỉ đường
        </a>
      </div>
    </article>
  );
}

export default function StoreLocator({ initialCity = "Hồ Chí Minh" }) {
  const normalizedInitialCity = String(initialCity || "").trim();

  const [province, setProvince] = useState(
    normalizedInitialCity || "Hồ Chí Minh",
  );

  const [district, setDistrict] = useState("");

  const [keywordInput, setKeywordInput] = useState("");

  const [submittedKeyword, setSubmittedKeyword] = useState("");

  const [stores, setStores] = useState([]);

  const [selectedStore, setSelectedStore] = useState(null);

  const [userLocation, setUserLocation] = useState(null);

  const [loading, setLoading] = useState(false);

  const [locatingUser, setLocatingUser] = useState(false);

  const [error, setError] = useState("");

  const [locationError, setLocationError] = useState("");

  const [visibleCount, setVisibleCount] = useState(STORES_PER_PAGE);

  const [refreshCounter, setRefreshCounter] = useState(0);

  const selectedStoreRef = useRef(null);

  useEffect(() => {
    selectedStoreRef.current = selectedStore;
  }, [selectedStore]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStores() {
      setLoading(true);
      setError("");

      try {
        const result = await fetchStores(
          {
            province,
            district,
            q: submittedKeyword,
            pageSize: 20,
            maxPages: 3,
            refresh: refreshCounter > 0,
          },
          controller.signal,
        );

        const nextStores = Array.isArray(result.stores) ? result.stores : [];

        setStores(nextStores);

        setVisibleCount(STORES_PER_PAGE);

        const previousSelectedId = selectedStoreRef.current
          ? selectedStoreRef.current.id
          : null;

        const previousSelectedStore = nextStores.find(
          (store) => store.id === previousSelectedId,
        );

        setSelectedStore(previousSelectedStore || nextStores[0] || null);
      } catch (loadError) {
        if (loadError && loadError.name === "AbortError") {
          return;
        }

        console.error("[StoreLocator]", loadError);

        setStores([]);
        setSelectedStore(null);

        setError(
          (loadError && loadError.message) ||
            "Không thể tải danh sách cửa hàng CellphoneS.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadStores();

    return () => {
      controller.abort();
    };
  }, [province, district, submittedKeyword, refreshCounter]);

  const districtOptions = useMemo(
    () => createUniqueList(stores.map((store) => store.district)),
    [stores],
  );

  const sortedStores = useMemo(() => {
    const copiedStores = [...stores];

    if (!userLocation) {
      return copiedStores;
    }

    return copiedStores.sort((first, second) => {
      const firstDistance = calculateDistanceKm(
        userLocation.latitude,
        userLocation.longitude,
        first.latitude,
        first.longitude,
      );

      const secondDistance = calculateDistanceKm(
        userLocation.latitude,
        userLocation.longitude,
        second.latitude,
        second.longitude,
      );

      if (!Number.isFinite(firstDistance) && !Number.isFinite(secondDistance)) {
        return 0;
      }

      if (!Number.isFinite(firstDistance)) {
        return 1;
      }

      if (!Number.isFinite(secondDistance)) {
        return -1;
      }

      return firstDistance - secondDistance;
    });
  }, [stores, userLocation]);

  const visibleStores = useMemo(
    () => sortedStores.slice(0, visibleCount),
    [sortedStores, visibleCount],
  );

  const closestStore = useMemo(() => {
    if (!userLocation || sortedStores.length === 0) {
      return null;
    }

    const firstStore = sortedStores[0];

    const distance = calculateDistanceKm(
      userLocation.latitude,
      userLocation.longitude,
      firstStore.latitude,
      firstStore.longitude,
    );

    if (!Number.isFinite(distance)) {
      return null;
    }

    return {
      store: firstStore,
      distance,
    };
  }, [sortedStores, userLocation]);

  const mapEmbedUrl = useMemo(
    () => buildGoogleMapEmbedUrl(selectedStore),
    [selectedStore],
  );

  const handleSearchSubmit = (event) => {
    event.preventDefault();

    setSubmittedKeyword(keywordInput.trim());

    setVisibleCount(STORES_PER_PAGE);
  };

  const handleProvinceChange = (event) => {
    setProvince(event.target.value);

    setDistrict("");

    setVisibleCount(STORES_PER_PAGE);
  };

  const handleDistrictChange = (event) => {
    setDistrict(event.target.value);

    setVisibleCount(STORES_PER_PAGE);
  };

  const handleClearSearch = () => {
    setKeywordInput("");
    setSubmittedKeyword("");
    setDistrict("");

    setVisibleCount(STORES_PER_PAGE);
  };

  const handleRefresh = () => {
    setRefreshCounter((currentValue) => currentValue + 1);
  };

  const handleUseCurrentLocation = () => {
    setLocationError("");

    if (!navigator.geolocation) {
      setLocationError("Trình duyệt không hỗ trợ xác định vị trí.");

      return;
    }

    setLocatingUser(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,

          longitude: position.coords.longitude,
        };

        setUserLocation(nextLocation);

        setLocatingUser(false);

        const nearestStore = [...stores]
          .map((store) => ({
            store,

            distance: calculateDistanceKm(
              nextLocation.latitude,
              nextLocation.longitude,
              store.latitude,
              store.longitude,
            ),
          }))
          .filter((item) => Number.isFinite(item.distance))
          .sort((first, second) => first.distance - second.distance)[0];

        if (nearestStore && nearestStore.store) {
          setSelectedStore(nearestStore.store);
        }
      },

      (geolocationError) => {
        setLocatingUser(false);

        if (geolocationError.code === geolocationError.PERMISSION_DENIED) {
          setLocationError("Bạn đã từ chối quyền truy cập vị trí.");

          return;
        }

        if (geolocationError.code === geolocationError.POSITION_UNAVAILABLE) {
          setLocationError("Không thể xác định vị trí hiện tại.");

          return;
        }

        if (geolocationError.code === geolocationError.TIMEOUT) {
          setLocationError("Quá thời gian chờ lấy vị trí.");

          return;
        }

        setLocationError("Đã xảy ra lỗi khi lấy vị trí.");
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 300000,
      },
    );
  };

  return (
    <section className="store-locator-page">
      <div className="store-locator-container">
        <nav className="store-locator-breadcrumb" aria-label="Điều hướng trang">
          <a href="/">Trang chủ</a>

          <span aria-hidden="true">/</span>

          <span>Hệ thống cửa hàng</span>
        </nav>

        <header className="store-locator-header">
          <div>
            <p className="store-locator-header__eyebrow">Hệ thống CellphoneS</p>

            <h1>Tìm cửa hàng gần bạn</h1>

            <p className="store-locator-header__description">
              Tìm kiếm địa chỉ, số điện thoại, giờ mở cửa và đường đi đến cửa
              hàng CellphoneS phù hợp.
            </p>
          </div>

          <button
            type="button"
            className="store-locator-refresh-button"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshIcon />

            {loading ? "Đang tải..." : "Cập nhật dữ liệu"}
          </button>
        </header>

        <div className="store-locator-control-panel">
          <form className="store-locator-filters" onSubmit={handleSearchSubmit}>
            <div className="store-locator-field">
              <label htmlFor="store-province">Tỉnh/Thành phố</label>

              <input
                id="store-province"
                type="text"
                list="store-province-options"
                value={province}
                onChange={handleProvinceChange}
                placeholder="Nhập tỉnh hoặc thành phố"
                autoComplete="off"
              />

              <datalist id="store-province-options">
                {COMMON_PROVINCES.map((provinceName) => (
                  <option key={provinceName} value={provinceName} />
                ))}
              </datalist>
            </div>

            <div className="store-locator-field">
              <label htmlFor="store-district">Quận/Huyện</label>

              <select
                id="store-district"
                value={district}
                onChange={handleDistrictChange}
              >
                <option value="">Tất cả quận/huyện</option>

                {districtOptions.map((districtName) => (
                  <option key={districtName} value={districtName}>
                    {districtName}
                  </option>
                ))}
              </select>
            </div>

            <div className="store-locator-field store-locator-field--search">
              <label htmlFor="store-keyword">Tìm theo tên hoặc địa chỉ</label>

              <div className="store-locator-search">
                <SearchIcon />

                <input
                  id="store-keyword"
                  type="search"
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  placeholder="Ví dụ: Nguyễn Tri Phương"
                />

                <button type="submit" disabled={loading}>
                  Tìm kiếm
                </button>
              </div>
            </div>
          </form>

          <div className="store-locator-location-tools">
            <button
              type="button"
              className="store-locator-location-button"
              onClick={handleUseCurrentLocation}
              disabled={locatingUser || loading}
            >
              <NavigationIcon />

              {locatingUser
                ? "Đang xác định vị trí..."
                : "Sử dụng vị trí của tôi"}
            </button>

            {(district || submittedKeyword) && (
              <button
                type="button"
                className="store-locator-clear-button"
                onClick={handleClearSearch}
              >
                Xóa bộ lọc
              </button>
            )}

            {locationError && (
              <p className="store-locator-location-error">{locationError}</p>
            )}
          </div>
        </div>

        <div className="store-locator-summary">
          <div>
            <strong>
              {loading
                ? "Đang tìm cửa hàng..."
                : `${sortedStores.length} cửa hàng`}
            </strong>

            <span>
              {province ? ` tại ${province}` : " trên toàn quốc"}

              {district ? `, ${district}` : ""}
            </span>
          </div>

          {closestStore && (
            <button
              type="button"
              className="store-locator-nearest"
              onClick={() => setSelectedStore(closestStore.store)}
            >
              Gần bạn nhất: <strong>{closestStore.store.name}</strong>
              <span>{formatDistance(closestStore.distance)}</span>
            </button>
          )}
        </div>

        {error && (
          <div
            className="store-locator-message store-locator-message--error"
            role="alert"
          >
            <strong>Không thể tải danh sách cửa hàng</strong>

            <p>{error}</p>

            <button type="button" onClick={handleRefresh}>
              Thử tải lại
            </button>
          </div>
        )}

        {!error && loading && (
          <div className="store-locator-loading" aria-live="polite">
            <span className="store-locator-spinner" />

            <p>Đang lấy danh sách cửa hàng CellphoneS từ Google Places...</p>
          </div>
        )}

        {!error && !loading && sortedStores.length === 0 && (
          <div className="store-locator-message">
            <strong>Không tìm thấy cửa hàng phù hợp</strong>

            <p>
              Hãy thử đổi tỉnh/thành phố, bỏ chọn quận/huyện hoặc tìm bằng một
              từ khóa khác.
            </p>

            <button type="button" onClick={handleClearSearch}>
              Xóa bộ lọc
            </button>
          </div>
        )}

        {!error && sortedStores.length > 0 && (
          <div className="store-locator-content">
            <div className="store-locator-list-column">
              <div className="store-locator-list">
                {visibleStores.map((store) => (
                  <StoreCard
                    key={store.id}
                    store={store}
                    selected={
                      Boolean(selectedStore) && selectedStore.id === store.id
                    }
                    userLocation={userLocation}
                    onSelect={setSelectedStore}
                  />
                ))}
              </div>

              {visibleCount < sortedStores.length && (
                <button
                  type="button"
                  className="store-locator-load-more"
                  onClick={() =>
                    setVisibleCount(
                      (currentValue) => currentValue + STORES_PER_PAGE,
                    )
                  }
                >
                  Xem thêm cửa hàng
                </button>
              )}
            </div>

            <aside className="store-locator-map-column">
              <div className="store-locator-map-card">
                <div className="store-locator-map-card__header">
                  <div>
                    <span>Cửa hàng đang chọn</span>

                    <strong>
                      {selectedStore
                        ? selectedStore.name
                        : "Chưa chọn cửa hàng"}
                    </strong>
                  </div>

                  {selectedStore && (
                    <a
                      href={getStoreGoogleMapsUrl(selectedStore)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mở Google Maps
                    </a>
                  )}
                </div>

                <div className="store-locator-map">
                  {mapEmbedUrl ? (
                    <GoogleMaps3D stores={stores} selectedStore={selectedStore}
                      key={mapEmbedUrl}
                      title={`Bản đồ ${
                        selectedStore ? selectedStore.name : "CellphoneS"
                      }`}
                      fallbackUrl={mapEmbedUrl}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  ) : (
                    <div className="store-locator-map__empty">
                      Chọn một cửa hàng để xem bản đồ.
                    </div>
                  )}
                </div>

                {selectedStore && (
                  <div className="store-locator-selected-store">
                    <div className="store-locator-selected-store__row">
                      <LocationIcon />

                      <span>{selectedStore.address}</span>
                    </div>

                    <div className="store-locator-selected-store__row">
                      <ClockIcon />

                      <span>
                        {getTodayOpeningHours(selectedStore.openingHours)}
                      </span>
                    </div>

                    <div className="store-locator-selected-store__row">
                      <PhoneIcon />

                      <a href={getStorePhoneUrl(selectedStore.phone)}>
                        {formatPhoneNumber(selectedStore.phone)}
                      </a>
                    </div>

                    <a
                      href={getStoreDirectionsUrl(selectedStore, userLocation)}
                      target="_blank"
                      rel="noreferrer"
                      className="store-locator-directions-button"
                    >
                      <NavigationIcon />
                      Chỉ đường đến cửa hàng
                    </a>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        <section className="store-locator-notice">
          <h2>Thông tin cửa hàng CellphoneS</h2>

          <p>
            Danh sách cửa hàng được lấy tự động thông qua Google Places API.
            Thông tin địa chỉ, số điện thoại và giờ hoạt động có thể được Google
            cập nhật theo từng thời điểm.
          </p>

          <p>
            Trước khi đến cửa hàng, bạn nên gọi hotline để xác nhận giờ làm việc
            và tình trạng sản phẩm.
          </p>
        </section>
      </div>
    </section>
  );
}
