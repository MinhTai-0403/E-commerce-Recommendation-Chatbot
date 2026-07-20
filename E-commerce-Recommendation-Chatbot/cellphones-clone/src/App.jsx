import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { TopBar, MainHeader } from "./components/Header/Header";
import ChatbotWidget from "./components/ChatbotWidget/ChatbotWidget";
import {
  FloatingActions,
  HeaderPopups,
} from "./components/AppChrome/AppChrome";
import {
  extractProductSlug,
  findProductDetailByPathname,
} from "./data/productCatalog";
import { getInfoRouteKind, getRouteForDeadAnchor } from "./utils/linkRoutes";
import {
  phoneSubCategories,
  phoneBrandFilters,
  phoneProducts,
  laptopBrandFilters,
  laptopProducts,
  audioProducts,
  watchProducts,
  tvBrandFilters,
  tvProducts,
  applianceBrandFilters,
  applianceProducts,
  hotTrendProducts,
} from "./data/mockData";
import { useApiProductDetail, useApiProducts } from "./hooks/useApiProducts";
import useCart from "./hooks/useCart";
import {
  clearAuthSession,
  fetchCurrentSmember,
  getStoredUser,
  logoutSmember,
} from "./services/apiAuth";

const ProductDetail = lazy(
  () => import("./components/ProductDetail/ProductDetail"),
);

const HeroSection = lazy(() => import("./components/HeroSection/HeroSection"));

const HotTrend = lazy(() => import("./components/HotTrend/HotTrend"));

const CategoryBlock = lazy(
  () => import("./components/CategoryBlock/CategoryBlock"),
);

const AccessoryCategories = lazy(
  () => import("./components/AccessoryCategories/AccessoryCategories"),
);

const HomeApplianceCategories = lazy(
  () => import("./components/HomeApplianceCategories/HomeApplianceCategories"),
);

const UsedProducts = lazy(
  () => import("./components/UsedProducts/UsedProducts"),
);

const TechNews = lazy(() => import("./components/TechNews/TechNews"));

const Footer = lazy(() => import("./components/Footer/Footer"));

const LoginSmember = lazy(
  () => import("./components/LoginSmember/LoginSmember"),
);

const RegisterSmember = lazy(
  () => import("./components/RegisterSmember/RegisterSmember"),
);

const AdminDashboard = lazy(
  () => import("./components/AdminDashboard/AdminDashboard"),
);

const CartPage = lazy(() => import("./components/CartPage/CartPage"));

const CheckoutPage = lazy(
  () => import("./components/CheckoutPage/CheckoutPage"),
);

const SmemberAccount = lazy(
  () => import("./components/SmemberAccount/SmemberAccount"),
);

const InfoPage = lazy(() => import("./components/InfoPage/InfoPage"));

const StoreLocator = lazy(
  () => import("./components/StoreLocator/StoreLocator"),
);

const BuildPcPage = lazy(
  () => import("./components/InfoPage/BuildPcPage"),
);

const homeProductQueries = {
  hotTrend: {
    category: "Phụ kiện",
    include: "details",
    displayLimit: 12,
    fetchLimit: 72,
    sort: "latest",
  },

  phones: {
    category: "Điện thoại",
    include: "details",
    displayLimit: 12,
    fetchLimit: 72,
    sort: "latest",
  },

  laptops: {
    category: "Laptop",
    include: "details",
    displayLimit: 12,
    fetchLimit: 72,
    sort: "latest",
  },

  audio: {
    category: "Âm thanh",
    include: "details",
    displayLimit: 12,
    fetchLimit: 72,
    sort: "latest",
  },

  watches: {
    category: "Đồng hồ thông minh",
    include: "details",
    displayLimit: 12,
    fetchLimit: 72,
    sort: "latest",
  },

  tvs: {
    category: "Tivi",
    include: "details",
    displayLimit: 12,
    fetchLimit: 72,
    sort: "latest",
  },

  appliances: {
    category: "Đồ gia dụng",
    include: "details",
    displayLimit: 12,
    fetchLimit: 72,
    sort: "latest",
  },

  coldAppliances: {
    include: "details",
    displayLimit: 12,
    fetchLimit: 72,
    sort: "latest",
  },
};

const homeTabQueries = {
  phones: [
    {
      category: "Điện thoại",
    },
    {
      category: "Máy tính bảng",
    },
  ],

  laptops: [
    {
      category: "Laptop",
    },
    {
      category: null,
      segment: "monitor",
    },
    {
      category: null,
      segment: "pc-gaming",
    },
  ],

  audio: [
    {
      category: "Âm thanh",
    },
    {
      category: "Tai nghe",
    },
    {
      category: "Loa",
    },
  ],

  coldAppliances: [
    {
      q: "Tủ lạnh",
    },
    {
      category: "Máy giặt",
    },
    {
      category: "Máy sấy quần áo",
    },
    {
      category: "Điều hòa - Máy lạnh",
    },
  ],

  appliances: [
    {
      category: "Đồ gia dụng",
    },
    {
      q: "Robot hút bụi",
    },
    {
      q: "Máy massage",
    },
  ],
};

const authRouteMap = {
  "/login": "login",
  "/register": "register",
  "/smember/login": "login",
  "/smember/register": "register",
};

const getAuthPageFromPathname = (pathname = "") => {
  const cleaned = pathname.replace(/\/+$/g, "") || "/";

  return authRouteMap[cleaned] || "";
};

const getAppPageFromPathname = (pathname = "") => {
  const cleaned = pathname.replace(/\/+$/g, "") || "/";

  if (cleaned === "/admin") {
    return "admin";
  }

  if (cleaned === "/cart" || cleaned === "/gio-hang") {
    return "cart";
  }

  if (cleaned === "/checkout" || cleaned === "/thanh-toan") {
    return "checkout";
  }

  if (
    cleaned === "/smember" ||
    cleaned === "/smember/profile" ||
    cleaned === "/smember/account" ||
    cleaned === "/thong-tin-ca-nhan"
  ) {
    return "account";
  }

  if (cleaned === "/dia-chi-cua-hang" || cleaned === "/he-thong-cua-hang") {
    return "stores";
  }

  if (cleaned === "/may-tinh-de-ban/build-pc.html" || cleaned === "/build-pc") {
    return "build-pc";
  }

  return getAuthPageFromPathname(cleaned);
};

const getPageFromPathname = (pathname = "") =>
  getAppPageFromPathname(pathname) || getInfoRouteKind(pathname);

const getBrowserLocationState = () => ({
  pathname: window.location.pathname,
  search: window.location.search,
  hash: window.location.hash,
});

const audioBrandFilters = [
  {
    id: "all",
    name: "Tất cả",
  },
  {
    id: "apple",
    name: "Apple",
  },
  {
    id: "samsung",
    name: "Samsung",
  },
  {
    id: "sony",
    name: "Sony",
  },
  {
    id: "jbl",
    name: "JBL",
  },
  {
    id: "anker",
    name: "Anker",
  },
];

const CELLPHONES_47_PROVINCES = [
  "An Giang",
  "Bà Rịa - Vũng Tàu",
  "Bắc Giang",
  "Bắc Ninh",
  "Bến Tre",
  "Bình Định",
  "Bình Dương",
  "Bình Phước",
  "Bình Thuận",
  "Cà Mau",
  "Cần Thơ",
  "Đà Nẵng",
  "Đắk Lắk",
  "Đồng Nai",
  "Đồng Tháp",
  "Hà Nam",
  "Hà Nội",
  "Hà Tĩnh",
  "Hải Dương",
  "Hải Phòng",
  "Hậu Giang",
  "Hòa Bình",
  "Hồ Chí Minh",
  "Hưng Yên",
  "Khánh Hòa",
  "Kiên Giang",
  "Lạng Sơn",
  "Lâm Đồng",
  "Lào Cai",
  "Long An",
  "Nam Định",
  "Nghệ An",
  "Ninh Bình",
  "Ninh Thuận",
  "Phú Thọ",
  "Quảng Bình",
  "Quảng Nam",
  "Quảng Ngãi",
  "Quảng Ninh",
  "Tây Ninh",
  "Thái Bình",
  "Thái Nguyên",
  "Thanh Hóa",
  "Thừa Thiên - Huế",
  "Tiền Giang",
  "Trà Vinh",
  "Vĩnh Long",
  "Vĩnh Phúc",
].sort((first, second) => first.localeCompare(second, "vi"));

function ProductRoute({
  slug,
  pathname = window.location.pathname,
  currentUser,
  onGoLogin,
  onAddToCart,
  onGoCart,
}) {
  const fallbackProduct = useMemo(
    () => findProductDetailByPathname(pathname),
    [pathname],
  );

  const { product, loading, error, source } = useApiProductDetail(
    slug,
    fallbackProduct,
  );

  const resolvedProduct =
    source === "api" ? product : fallbackProduct || product;

  if (resolvedProduct) {
    return (
      <ProductDetail
        product={resolvedProduct}
        currentUser={currentUser}
        onGoLogin={onGoLogin}
        onAddToCart={onAddToCart}
        onGoCart={onGoCart}
      />
    );
  }

  return (
    <section className="route-state-card">
      <div className="container">
        <div className="route-state-box">
          <h1>
            {loading
              ? "Đang tải sản phẩm từ MongoDB..."
              : "Không tìm thấy sản phẩm"}
          </h1>

          {error && (
            <p>
              API chưa trả về sản phẩm này. Kiểm tra lại backend hoặc slug sản
              phẩm trong MongoDB.
            </p>
          )}

          <a href="/">Quay lại trang chủ</a>
        </div>
      </div>
    </section>
  );
}

function HomePage({ currentUser, onGoLogin, onGoRegister }) {
  const hotTrend = useApiProducts(
    homeProductQueries.hotTrend,
    hotTrendProducts,
  );

  return (
    <>
      <HeroSection
        currentUser={currentUser}
        onGoLogin={onGoLogin}
        onGoRegister={onGoRegister}
      />

      <HotTrend products={hotTrend.products} loading={hotTrend.loading} />

      <CategoryBlock
        title="Điện thoại nổi bật"
        tabs={["Điện thoại", "Máy tính bảng"]}
        subCategories={phoneSubCategories}
        filters={phoneBrandFilters}
        productQuery={homeProductQueries.phones}
        tabQueries={homeTabQueries.phones}
        products={phoneProducts}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:795/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KTXD3MF8YTC80J2CHM6AVC9F.jpg"
      />

      <AccessoryCategories />

      <CategoryBlock
        title="Laptop"
        tabs={["Laptop", "Màn hình", "PC Gaming"]}
        filters={laptopBrandFilters}
        productQuery={homeProductQueries.laptops}
        tabQueries={homeTabQueries.laptops}
        products={laptopProducts}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:795/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KVFPDXRAJ749QHYHQKZFR23W.png"
      />

      <CategoryBlock
        title="Âm thanh"
        tabs={["Âm thanh", "Tai nghe", "Loa"]}
        filters={audioBrandFilters}
        productQuery={homeProductQueries.audio}
        tabQueries={homeTabQueries.audio}
        products={audioProducts}
      />

      <CategoryBlock
        title="Đồng hồ thông minh"
        tabs={["Đồng hồ thông minh"]}
        filters={[
          {
            id: "all",
            name: "Tất cả",
          },
          {
            id: "apple",
            name: "Apple",
          },
          {
            id: "samsung",
            name: "Samsung",
          },
          {
            id: "garmin",
            name: "Garmin",
          },
          {
            id: "xiaomi",
            name: "Xiaomi",
          },
        ]}
        productQuery={homeProductQueries.watches}
        products={watchProducts}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KTQYDCRMJX3BWCYNHPYJ6FRC.png"
      />

      <CategoryBlock
        title="Tivi"
        tabs={["Tivi"]}
        filters={tvBrandFilters}
        productQuery={homeProductQueries.tvs}
        products={tvProducts}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KT8ANYD04XX6K1VH0NZ387P7.png"
      />

      <HomeApplianceCategories />

      <CategoryBlock
        title="Tủ lạnh - Tủ đông"
        tabs={[
          "Tủ lạnh - Tủ đông",
          "Máy giặt",
          "Máy sấy quần áo",
          "Điều hòa - Máy lạnh",
        ]}
        filters={applianceBrandFilters}
        productQuery={homeProductQueries.coldAppliances}
        tabQueries={homeTabQueries.coldAppliances}
        products={applianceProducts}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KDCX8QQYKQ4AX3BEHBRA5B9W.png"
      />

      <CategoryBlock
        title="Đồ gia dụng"
        tabs={["Đồ gia dụng", "Chăm sóc nhà", "Chăm sóc sức khỏe"]}
        filters={applianceBrandFilters}
        productQuery={homeProductQueries.appliances}
        tabQueries={homeTabQueries.appliances}
        products={applianceProducts}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KDCX8QQYKQ4AX3BEHBRA5B9W.png"
      />

      <UsedProducts />

      <TechNews />
    </>
  );
}

function App() {
  const [currentLocation, setCurrentLocation] = useState(() =>
    getBrowserLocationState(),
  );

  const initialPage = getPageFromPathname(currentLocation.pathname);

  const productSlug = initialPage
    ? ""
    : extractProductSlug(currentLocation.pathname);

  const isProductRoute = Boolean(productSlug) && !initialPage;

  const [activePopup, setActivePopup] = useState(null);

  const [currentPage, setCurrentPage] = useState(() => initialPage || "home");

  const [currentUser, setCurrentUser] = useState(() => getStoredUser());

  const [selectedLocation, setSelectedLocation] = useState("Hồ Chí Minh");

  const [locationSearch, setLocationSearch] = useState("");

  const cartState = useCart(currentUser);

  useEffect(() => {
    let ignore = false;

    async function restoreUserSession() {
      try {
        const user = await fetchCurrentSmember();

        if (!ignore && user) {
          setCurrentUser(user);
        }
      } catch {
        clearAuthSession();

        if (!ignore) {
          setCurrentUser(null);
        }
      }
    }

    if (getStoredUser()) {
      restoreUserSession();
    }

    return () => {
      ignore = true;
    };
  }, []);

  const filteredProvinces = CELLPHONES_47_PROVINCES.filter((province) =>
    province.toLowerCase().includes(locationSearch.toLowerCase()),
  );

  const handleCloseAllPopups = useCallback(() => {
    setActivePopup(null);
    setLocationSearch("");
  }, []);

  const goHome = () => {
    window.history.pushState(null, "", "/");

    setCurrentLocation(getBrowserLocationState());

    setCurrentPage("home");
  };

  const navigateToPath = useCallback(
    (path, options = {}) => {
      if (!path || path === "#") {
        return;
      }

      if (
        /^https?:\/\//i.test(path) ||
        path.startsWith("tel:") ||
        path.startsWith("mailto:")
      ) {
        window.location.href = path;
        return;
      }

      window.history.pushState(null, "", path);

      const nextLocation = getBrowserLocationState();

      setCurrentLocation(nextLocation);

      const nextPage = getPageFromPathname(nextLocation.pathname) || "home";

      setCurrentPage(nextPage);
      handleCloseAllPopups();

      if (!options.preserveScroll) {
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }
    },
    [handleCloseAllPopups],
  );

  const goLogin = () => {
    window.history.pushState(null, "", "/smember/login");

    setCurrentLocation(getBrowserLocationState());

    setCurrentPage("login");
  };

  const goRegister = () => {
    window.history.pushState(null, "", "/smember/register");

    setCurrentLocation(getBrowserLocationState());

    setCurrentPage("register");
  };

  const goAdmin = () => {
    window.history.pushState(null, "", "/admin");

    setCurrentLocation(getBrowserLocationState());

    setCurrentPage("admin");
  };

  const goCart = () => {
    window.history.pushState(null, "", "/cart");

    setCurrentLocation(getBrowserLocationState());

    setCurrentPage("cart");
    handleCloseAllPopups();
  };

  const goCheckout = () => {
    window.history.pushState(null, "", "/checkout");

    setCurrentLocation(getBrowserLocationState());

    setCurrentPage("checkout");
    handleCloseAllPopups();
  };

  const goAccount = () => {
    window.history.pushState(null, "", "/smember");

    setCurrentLocation(getBrowserLocationState());

    setCurrentPage("account");
    handleCloseAllPopups();
  };

  useEffect(() => {
    const handlePopState = () => {
      const nextLocation = getBrowserLocationState();

      setCurrentLocation(nextLocation);

      setCurrentPage(getPageFromPathname(nextLocation.pathname) || "home");

      handleCloseAllPopups();
    };

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [handleCloseAllPopups]);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      const anchor = event.target.closest?.("a");

      if (
        !anchor ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const href = anchor.getAttribute("href") || "";

      if (!href) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      if (
        href.startsWith("tel:") ||
        href.startsWith("mailto:") ||
        /^https?:\/\//i.test(href)
      ) {
        return;
      }

      if (href.startsWith("#")) {
        const targetId = href.slice(1);

        if (targetId && document.getElementById(targetId)) {
          return;
        }

        event.preventDefault();

        navigateToPath(getRouteForDeadAnchor(anchor));

        return;
      }

      const hrefPathname = href.startsWith("/")
        ? new URL(href, window.location.origin).pathname
        : "";

      const isInternalInfoRoute = getInfoRouteKind(hrefPathname) === "info";

      if (
        href.startsWith("/") &&
        (!hrefPathname.toLowerCase().endsWith(".html") || isInternalInfoRoute)
      ) {
        event.preventDefault();

        navigateToPath(href, {
          preserveScroll: anchor.dataset.preserveScroll === "true",
        });
      }
    };

    document.addEventListener("click", handleDocumentClick);

    return () => document.removeEventListener("click", handleDocumentClick);
  }, [navigateToPath]);

  const handleAuthSuccess = (user) => {
    if (user) {
      setCurrentUser(user);
    }

    if (user?.role === "admin") {
      goAdmin();
      return;
    }

    goHome();
  };

  const handleLogout = async () => {
    try {
      await logoutSmember();
    } catch {
      clearAuthSession();
    }

    setCurrentUser(null);
    handleCloseAllPopups();
    goHome();
  };

  const headerPopupProps = {
    activePopup,
    currentUser,
    filteredProvinces,
    goAccount,
    goLogin,
    goRegister,
    handleCloseAllPopups,
    handleLogout,
    locationSearch,
    selectedLocation,
    setLocationSearch,
    setSelectedLocation,
  };

  if (currentPage === "login") {
    return (
      <LoginSmember
        onBackToHome={goHome}
        onGoRegister={goRegister}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  if (currentPage === "register") {
    return (
      <RegisterSmember
        onBackToHome={goHome}
        onGoLogin={goLogin}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  if (currentPage === "admin") {
    return (
      <AdminDashboard
        currentUser={currentUser}
        onBackHome={goHome}
        onLogout={handleLogout}
        onGoLogin={goLogin}
      />
    );
  }

  if (currentPage === "account") {
    return (
      <div className="app">
        <TopBar />

        <MainHeader
          activePopup={activePopup}
          setActivePopup={setActivePopup}
          selectedLocation={selectedLocation}
          currentUser={currentUser}
          cartCount={cartState.count}
          onGoCart={goCart}
        />

        <main className="main-content">
          <SmemberAccount
            currentUser={currentUser}
            onGoLogin={goLogin}
            onGoHome={goHome}
            onLogout={handleLogout}
            onUserUpdate={setCurrentUser}
          />
        </main>

        <Footer />

        <FloatingActions />

        <HeaderPopups {...headerPopupProps} />
      </div>
    );
  }

  if (currentPage === "cart") {
    return (
      <div className="app">
        <TopBar />

        <MainHeader
          activePopup={activePopup}
          setActivePopup={setActivePopup}
          selectedLocation={selectedLocation}
          currentUser={currentUser}
          cartCount={cartState.count}
          onGoCart={goCart}
        />

        <main className="main-content">
          <CartPage
            cart={cartState.cart}
            loading={cartState.loading}
            error={cartState.error}
            currentUser={currentUser}
            onUpdateItem={cartState.updateItem}
            onRemoveItem={cartState.removeItem}
            onClearCart={cartState.clearCart}
            onGoHome={goHome}
            onGoLogin={goLogin}
            onGoCheckout={goCheckout}
          />
        </main>

        <Footer />

        <FloatingActions />

        <HeaderPopups {...headerPopupProps} />
      </div>
    );
  }

  if (currentPage === "checkout") {
    return (
      <div className="app">
        <TopBar />

        <MainHeader
          activePopup={activePopup}
          setActivePopup={setActivePopup}
          selectedLocation={selectedLocation}
          currentUser={currentUser}
          cartCount={cartState.count}
          onGoCart={goCart}
        />

        <main className="main-content">
          <CheckoutPage
            cart={cartState.cart}
            currentUser={currentUser}
            selectedLocation={selectedLocation}
            onGoCart={goCart}
            onGoHome={goHome}
            onGoAccount={goAccount}
            onClearCart={cartState.clearCart}
          />
        </main>

        <Footer />

        <FloatingActions />

        <HeaderPopups {...headerPopupProps} />
      </div>
    );
  }

  if (currentPage === "stores") {
    return (
      <div className="app">
        <TopBar />

        <MainHeader
          activePopup={activePopup}
          setActivePopup={setActivePopup}
          selectedLocation={selectedLocation}
          currentUser={currentUser}
          cartCount={cartState.count}
          onGoCart={goCart}
        />

        <main className="main-content store-locator-main">
          <StoreLocator initialCity={selectedLocation} />
        </main>

        <Footer />

        <FloatingActions />

        <HeaderPopups {...headerPopupProps} />

        <ChatbotWidget
          userName={
            currentUser?.fullName ||
            currentUser?.displayName ||
            currentUser?.name ||
            currentUser?.username ||
            ""
          }
        />
      </div>
    );
  }

  if (currentPage === "build-pc") {
    return (
      <div className="app">
        <TopBar />
        <MainHeader activePopup={activePopup} setActivePopup={setActivePopup} selectedLocation={selectedLocation} currentUser={currentUser} cartCount={cartState.count} onGoCart={goCart} />
        <main className="main-content"><BuildPcPage /></main>
        <Footer />
        <FloatingActions />
        <HeaderPopups {...headerPopupProps} />
        <ChatbotWidget userName={currentUser?.fullName || currentUser?.displayName || currentUser?.name || currentUser?.username || ""} />
      </div>
    );
  }

  if (currentPage === "info") {
    return (
      <div className="app">
        <TopBar />

        <MainHeader
          activePopup={activePopup}
          setActivePopup={setActivePopup}
          selectedLocation={selectedLocation}
          currentUser={currentUser}
          cartCount={cartState.count}
          onGoCart={goCart}
        />

        <main className="main-content">
          <InfoPage
            pathname={currentLocation.pathname}
            search={currentLocation.search}
            onGoHome={goHome}
          />
        </main>

        <Footer />

        <FloatingActions />

        <HeaderPopups {...headerPopupProps} />

        <ChatbotWidget
          userName={
            currentUser?.fullName ||
            currentUser?.displayName ||
            currentUser?.name ||
            currentUser?.username ||
            ""
          }
        />
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />

      <MainHeader
        activePopup={activePopup}
        setActivePopup={setActivePopup}
        selectedLocation={selectedLocation}
        currentUser={currentUser}
        cartCount={cartState.count}
        onGoCart={goCart}
      />

      <main
        className={`main-content ${
          isProductRoute ? "product-detail-main" : ""
        }`}
      >
        {isProductRoute ? (
          <ProductRoute
            pathname={currentLocation.pathname}
            slug={productSlug}
            currentUser={currentUser}
            onGoLogin={goLogin}
            onAddToCart={cartState.addItem}
            onGoCart={goCart}
          />
        ) : (
          <HomePage
            currentUser={currentUser}
            onGoLogin={goLogin}
            onGoRegister={goRegister}
          />
        )}
      </main>

      <Footer />

      <FloatingActions />

      <HeaderPopups {...headerPopupProps} />

      <ChatbotWidget
        userName={
          currentUser?.fullName ||
          currentUser?.displayName ||
          currentUser?.name ||
          currentUser?.username ||
          ""
        }
      />

      {activePopup === "location" && (
        <div className="location-modal-box">
          <div className="location-modal-header-bar">
            <div className="location-modal-search-wrapper">
              <svg
                className="modal-search-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#999"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />

                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>

              <input
                type="text"
                placeholder="Nhập tên tỉnh thành"
                value={locationSearch}
                onChange={(event) => setLocationSearch(event.target.value)}
                autoFocus
              />
            </div>

            <button
              className="location-modal-close-btn"
              onClick={handleCloseAllPopups}
              type="button"
            >
              Đóng ×
            </button>
          </div>

          <div className="location-modal-hint">
            Vui lòng chọn tỉnh, thành phố để biết chính xác giá, khuyến mãi và
            tồn kho
          </div>

          <div className="location-modal-body">
            {filteredProvinces.length > 0 ? (
              <div className="location-grid-layout">
                {filteredProvinces.map((province) => (
                  <button
                    key={province}
                    className={`location-grid-item ${
                      selectedLocation === province ? "active" : ""
                    }`}
                    onClick={() => {
                      setSelectedLocation(province);

                      handleCloseAllPopups();
                    }}
                    type="button"
                  >
                    <span>{province}</span>

                    {selectedLocation === province && (
                      <span className="check-mark">✓</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="location-no-data">
                Không tìm thấy tỉnh thành phù hợp
              </div>
            )}
          </div>
        </div>
      )}

      {activePopup === "auth" && (
        <div className="auth-modal-box">
          <button
            className="auth-modal-close-x"
            onClick={handleCloseAllPopups}
            type="button"
          >
            ×
          </button>

          <h2 className="auth-modal-title">Smember</h2>

          <div className="auth-modal-mascot">
            <img
              src="https://cellphones.com.vn/media/wysiwyg/ant-smile.png"
              alt="Smember Mascot"
            />
          </div>

          {currentUser ? (
            <>
              <p className="auth-modal-desc">
                Xin chào{" "}
                <strong>{currentUser.fullName || currentUser.email}</strong>.
                Tài khoản của bạn đã đăng nhập và sẵn sàng dùng ưu đãi Smember.
              </p>

              <div className="auth-modal-user-meta">
                <span>{currentUser.email}</span>

                <span>{currentUser.phone}</span>

                <span>Role: {currentUser.role || "customer"}</span>
              </div>

              <div className="auth-modal-actions stacked">
                <button
                  className="auth-btn btn-login"
                  onClick={goAccount}
                  type="button"
                >
                  Thông tin cá nhân
                </button>

                <button
                  className="auth-btn btn-register"
                  onClick={handleLogout}
                  type="button"
                >
                  Đăng xuất
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="auth-modal-desc">
                Vui lòng đăng nhập tài khoản Smember để xem ưu đãi và thanh toán
                dễ dàng hơn.
              </p>

              <div className="auth-modal-actions">
                <button
                  className="auth-btn btn-register"
                  onClick={() => {
                    handleCloseAllPopups();
                    goRegister();
                  }}
                  type="button"
                >
                  Đăng ký
                </button>

                <button
                  className="auth-btn btn-login"
                  onClick={() => {
                    handleCloseAllPopups();
                    goLogin();
                  }}
                  type="button"
                >
                  Đăng nhập
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
