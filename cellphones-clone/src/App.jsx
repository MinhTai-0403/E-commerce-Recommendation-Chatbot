import { lazy, useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import { TopBar, MainHeader } from './components/Header/Header';
import ChatbotWidget from './components/ChatbotWidget/ChatbotWidget';
import { FloatingActions, HeaderPopups } from './components/AppChrome/AppChrome';
import { findProductDetailByPathname } from './data/productCatalog';
import { getRouteForDeadAnchor } from './utils/linkRoutes';
import { getExternalRouteTarget, resolvePublicRoute } from './utils/routeRegistry';
import useRouteMetadata from './hooks/useRouteMetadata';
import {
  phoneSubCategories, phoneBrandFilters, phoneProducts,
  laptopBrandFilters, laptopProducts,
  audioProducts,
  watchProducts,
  tvBrandFilters, tvProducts,
  applianceBrandFilters, applianceProducts,
  hotTrendProducts,
  promoStripBanners,
} from './data/mockData';
import { useApiProductDetail } from './hooks/useApiProducts';
import useCart from './hooks/useCart';
import { clearAuthSession, fetchCurrentSmember, getStoredUser, logoutSmember } from './services/apiAuth';

const ProductDetail = lazy(() => import('./components/ProductDetail/ProductDetail'));
const HeroSection = lazy(() => import('./components/HeroSection/HeroSection'));
const HotTrend = lazy(() => import('./components/HotTrend/HotTrend'));
const CategoryBlock = lazy(() => import('./components/CategoryBlock/CategoryBlock'));
const AccessoryCategories = lazy(() => import('./components/AccessoryCategories/AccessoryCategories'));
const HomeApplianceCategories = lazy(() => import('./components/HomeApplianceCategories/HomeApplianceCategories'));
const UsedProducts = lazy(() => import('./components/UsedProducts/UsedProducts'));
const TechNews = lazy(() => import('./components/TechNews/TechNews'));
const Footer = lazy(() => import('./components/Footer/Footer'));
const LoginSmember = lazy(() => import('./components/LoginSmember/LoginSmember'));
const RegisterSmember = lazy(() => import('./components/RegisterSmember/RegisterSmember'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard/AdminDashboard'));
const CartPage = lazy(() => import('./components/CartPage/CartPage'));
const CheckoutPage = lazy(() => import('./components/CheckoutPage/CheckoutPage'));
const SmemberAccount = lazy(() => import('./components/SmemberAccount/SmemberAccount'));
const InfoPage = lazy(() => import('./components/InfoPage/InfoPage'));
const StoreLocator = lazy(() => import('./components/StoreLocator/StoreLocator'));
const TradeInPage = lazy(() => import('./components/TradeInPage/TradeInPage'));
const PromotionsPage = lazy(() => import('./components/PromotionsPage/PromotionsPage'));
const FooterPages = lazy(() => import('./components/FooterPages/FooterPages'));
const ShippingPolicyPage = lazy(() => import('./components/ShippingPolicyPage/ShippingPolicyPage'));
const InstallmentPage = lazy(() => import('./components/InstallmentPage/InstallmentPage'));
const CreditCardInstallmentGuidePage = lazy(() => import('./components/CreditCardInstallmentGuidePage/CreditCardInstallmentGuidePage'));
const NotFoundPage = lazy(() => import('./components/NotFoundPage/NotFoundPage'));

const homeProductQueries = {
  hotTrend: { category: 'Phụ kiện', displayLimit: 12, fetchLimit: 36, inStock: true, sort: 'latest' },
  phones: { category: 'Điện thoại', displayLimit: 12, fetchLimit: 36, inStock: true, sort: 'latest' },
  laptops: { category: 'Laptop', displayLimit: 12, fetchLimit: 72, sort: 'latest' },
  audio: { category: 'Âm thanh', displayLimit: 12, fetchLimit: 36, inStock: true, sort: 'latest' },
  watches: { category: 'Đồng hồ thông minh', displayLimit: 12, fetchLimit: 36, inStock: true, sort: 'latest' },
  tvs: { category: 'Tivi', displayLimit: 12, fetchLimit: 36, inStock: true, sort: 'latest' },
  appliances: { category: 'Đồ gia dụng', displayLimit: 12, fetchLimit: 36, inStock: true, sort: 'latest' },
  coldAppliances: { displayLimit: 12, fetchLimit: 36, inStock: true, sort: 'latest' },
};

const homeTabQueries = {
  phones: [
    { category: 'Điện thoại' },
    { category: 'Máy tính bảng' },
  ],
  laptops: [
    { category: 'Laptop' },
    { category: null, segment: 'monitor' },
    { category: null, segment: 'pc-gaming' },
  ],
  audio: [
    { category: 'Âm thanh' },
    { category: 'Tai nghe' },
    { category: 'Loa' },
  ],
  coldAppliances: [
    { q: 'Tủ lạnh' },
    { category: 'Máy giặt' },
    { category: 'Máy sấy quần áo' },
    { category: 'Điều hòa - Máy lạnh' },
  ],
  appliances: [
    { category: 'Đồ gia dụng' },
    { q: 'Robot hút bụi' },
    { q: 'Máy massage' },
  ],
};

const getPageFromPathname = (pathname = '', search = '') => {
  const route = resolvePublicRoute(pathname, search);
  return route.appPage || (route.pageType === 'product' ? 'product' : 'not-found');
};

const getBrowserLocationState = () => ({
  pathname: window.location.pathname,
  search: window.location.search,
  hash: window.location.hash,
});

const audioBrandFilters = [
  { id: 'all', name: 'Tất cả' },
  { id: 'apple', name: 'Apple' },
  { id: 'samsung', name: 'Samsung' },
  { id: 'sony', name: 'Sony' },
  { id: 'jbl', name: 'JBL' },
  { id: 'anker', name: 'Anker' },
];

const allBrandFilter = { id: 'all', name: 'Tất cả' };
const laptopFiltersByTab = [
  laptopBrandFilters,
  [allBrandFilter, { id: 'asus', name: 'ASUS' }, { id: 'samsung', name: 'Samsung' }, { id: 'lg', name: 'LG' }, { id: 'xiaomi', name: 'Xiaomi' }, { id: 'dell', name: 'Dell' }, { id: 'msi', name: 'MSI' }],
  [allBrandFilter, { id: 'asus', name: 'ASUS' }, { id: 'lenovo', name: 'Lenovo' }, { id: 'hp', name: 'HP' }, { id: 'dell', name: 'Dell' }],
];
const audioFiltersByTab = [
  audioBrandFilters,
  audioBrandFilters,
  [allBrandFilter, { id: 'sony', name: 'Sony' }, { id: 'jbl', name: 'JBL' }, { id: 'anker', name: 'Anker' }, { id: 'samsung', name: 'Samsung' }, { id: 'marshall', name: 'Marshall' }],
];
const coldApplianceFiltersByTab = [
  applianceBrandFilters,
  [allBrandFilter, { id: 'toshiba', name: 'Toshiba' }, { id: 'panasonic', name: 'Panasonic' }, { id: 'samsung', name: 'Samsung' }, { id: 'electrolux', name: 'Electrolux' }, { id: 'lg', name: 'LG' }],
  [allBrandFilter, { id: 'electrolux', name: 'Electrolux' }, { id: 'toshiba', name: 'Toshiba' }, { id: 'lg', name: 'LG' }, { id: 'samsung', name: 'Samsung' }, { id: 'panasonic', name: 'Panasonic' }],
  [allBrandFilter, { id: 'panasonic', name: 'Panasonic' }, { id: 'lg', name: 'LG' }, { id: 'xiaomi', name: 'Xiaomi' }, { id: 'daikin', name: 'Daikin' }, { id: 'casper', name: 'Casper' }],
];
const applianceFiltersByTab = [
  [allBrandFilter, { id: 'xiaomi', name: 'Xiaomi' }, { id: 'panasonic', name: 'Panasonic' }, { id: 'hoa-phat', name: 'Hòa Phát' }, { id: 'acerpure', name: 'Acerpure' }],
  [allBrandFilter, { id: 'xiaomi', name: 'Xiaomi' }, { id: 'roborock', name: 'Roborock' }, { id: 'dreame', name: 'Dreame' }],
  [allBrandFilter, { id: 'xiaomi', name: 'Xiaomi' }, { id: 'philips', name: 'Philips' }],
];

const CELLPHONES_47_PROVINCES = [
  'An Giang',
  'Bà Rịa - Vũng Tàu',
  'Bắc Giang',
  'Bắc Ninh',
  'Bến Tre',
  'Bình Định',
  'Bình Dương',
  'Bình Phước',
  'Bình Thuận',
  'Cà Mau',
  'Cần Thơ',
  'Đà Nẵng',
  'Đắk Lắk',
  'Đồng Nai',
  'Đồng Tháp',
  'Hà Nam',
  'Hà Nội',
  'Hà Tĩnh',
  'Hải Dương',
  'Hải Phòng',
  'Hậu Giang',
  'Hòa Bình',
  'Hồ Chí Minh',
  'Hưng Yên',
  'Khánh Hòa',
  'Kiên Giang',
  'Lạng Sơn',
  'Lâm Đồng',
  'Lào Cai',
  'Long An',
  'Nam Định',
  'Nghệ An',
  'Ninh Bình',
  'Ninh Thuận',
  'Phú Thọ',
  'Quảng Bình',
  'Quảng Nam',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Tây Ninh',
  'Thái Bình',
  'Thái Nguyên',
  'Thanh Hóa',
  'Thừa Thiên - Huế',
  'Tiền Giang',
  'Trà Vinh',
  'Vĩnh Long',
  'Vĩnh Phúc',
].sort((a, b) => a.localeCompare(b, 'vi'));

function ProductRoute({ slug, pathname = window.location.pathname, currentUser, onGoLogin, onAddToCart, onGoCart }) {
  const fallbackProduct = useMemo(() => (
    import.meta.env.DEV ? findProductDetailByPathname(pathname) : null
  ), [pathname]);
  const { product, loading, error, source } = useApiProductDetail(slug, fallbackProduct);
  const resolvedProduct = source === 'api' ? product : (fallbackProduct || product);

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

  if (loading) {
    return (
      <section className="route-state-card" aria-label="Đang tải sản phẩm">
        <div className="container">
          <div className="route-detail-skeleton" aria-hidden="true">
            <div className="route-detail-skeleton-title" />
            <div className="route-detail-skeleton-grid">
              <div className="route-detail-skeleton-media" />
              <div className="route-detail-skeleton-panel">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="route-detail-skeleton-side" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="route-state-card">
      <div className="container">
        <div className="route-state-box">
          <h1>Không tìm thấy sản phẩm</h1>
          {error && (
            <p>Sản phẩm hiện chưa khả dụng. Vui lòng thử lại sau.</p>
          )}
          <a href="/">Quay lại trang chủ</a>
        </div>
      </div>
    </section>
  );
}

function HomePromoStrip() {
  const desktopBanner = promoStripBanners[0];
  const mobileBanner = promoStripBanners[1] || desktopBanner;

  if (!desktopBanner?.image) return null;

  return (
    <div className="home-promo-strip-wrap container">
      <a
        className="home-promo-strip"
        href="/chao-nam-hoc-moi"
        aria-label="Xem ưu đãi Back to School"
      >
        <picture>
          {mobileBanner?.image && (
            <source media="(max-width: 640px)" srcSet={mobileBanner.image} />
          )}
          <img
            src={desktopBanner.image}
            alt="Back to School - Đặc quyền ưu đãi học sinh, sinh viên"
            width="1200"
            height="75"
          />
        </picture>
      </a>
    </div>
  );
}

function HomePage({ currentUser, onGoLogin, onGoRegister }) {
  return (
    <>
      <HeroSection
        currentUser={currentUser}
        onGoLogin={onGoLogin}
        onGoRegister={onGoRegister}
      />

      <HomePromoStrip />

      <HotTrend products={hotTrendProducts} />

      <CategoryBlock
        title="Điện thoại nổi bật"
        tabs={['Điện thoại', 'Máy tính bảng']}
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
        tabs={['Laptop', 'Màn hình', 'PC Gaming']}
        filters={laptopBrandFilters}
        filtersByTab={laptopFiltersByTab}
        productQuery={homeProductQueries.laptops}
        tabQueries={homeTabQueries.laptops}
        products={laptopProducts}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:795/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KVFPDXRAJ749QHYHQKZFR23W.png"
      />

      <CategoryBlock
        title="Âm thanh"
        tabs={['Âm thanh', 'Tai nghe', 'Loa']}
        filters={audioBrandFilters}
        filtersByTab={audioFiltersByTab}
        productQuery={homeProductQueries.audio}
        tabQueries={homeTabQueries.audio}
        products={audioProducts}
      />

      <CategoryBlock
        title="Đồng hồ thông minh"
        tabs={['Đồng hồ thông minh']}
        filters={[
          { id: 'all', name: 'Tất cả' },
          { id: 'apple', name: 'Apple' },
          { id: 'samsung', name: 'Samsung' },
          { id: 'garmin', name: 'Garmin' },
          { id: 'xiaomi', name: 'Xiaomi' },
        ]}
        productQuery={homeProductQueries.watches}
        products={watchProducts}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KTQYDCRMJX3BWCYNHPYJ6FRC.png"
      />

      <CategoryBlock
        title="Tivi"
        tabs={['Tivi']}
        filters={tvBrandFilters}
        productQuery={homeProductQueries.tvs}
        products={tvProducts}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KT8ANYD04XX6K1VH0NZ387P7.png"
      />

      <HomeApplianceCategories />

      <CategoryBlock
        title="Tủ lạnh - Tủ đông"
        tabs={['Tủ lạnh - Tủ đông', 'Máy giặt', 'Máy sấy quần áo', 'Điều hòa - Máy lạnh']}
        filters={applianceBrandFilters}
        filtersByTab={coldApplianceFiltersByTab}
        productQuery={homeProductQueries.coldAppliances}
        tabQueries={homeTabQueries.coldAppliances}
        products={applianceProducts}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KDCX8QQYKQ4AX3BEHBRA5B9W.png"
      />

      <CategoryBlock
        title="Đồ gia dụng"
        tabs={['Đồ gia dụng', 'Chăm sóc nhà', 'Chăm sóc sức khỏe']}
        filters={applianceBrandFilters}
        filtersByTab={applianceFiltersByTab}
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
  const [currentLocation, setCurrentLocation] = useState(() => getBrowserLocationState());
  const resolvedRoute = useMemo(
    () => resolvePublicRoute(currentLocation.pathname, currentLocation.search),
    [currentLocation.pathname, currentLocation.search],
  );
  const initialPage = getPageFromPathname(currentLocation.pathname, currentLocation.search);
  const productSlug = resolvedRoute.productSlug || '';
  const isProductRoute = resolvedRoute.pageType === 'product' && Boolean(productSlug);
  const [activePopup, setActivePopup] = useState(null);
  const [currentPage, setCurrentPage] = useState(() => (
    initialPage
  ));
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [selectedLocation, setSelectedLocation] = useState('Hồ Chí Minh');
  const [locationSearch, setLocationSearch] = useState('');
  const cartState = useCart(currentUser);
  useRouteMetadata(resolvedRoute, currentLocation.search);

  useEffect(() => {
    if (resolvedRoute.handling === 'external') {
      const target = getExternalRouteTarget(resolvedRoute);
      if (target) window.location.replace(target);
      return;
    }

    if (resolvedRoute.handling === 'legacy-redirect' && resolvedRoute.canonicalPath) {
      const nextPath = `${resolvedRoute.canonicalPath}${currentLocation.search || ''}`;
      window.location.replace(nextPath);
    }
  }, [currentLocation.search, resolvedRoute]);

  useEffect(() => {
    let ignore = false;

    async function restoreUserSession() {
      try {
        const user = await fetchCurrentSmember();
        if (!ignore && user) setCurrentUser(user);
      } catch {
        clearAuthSession();
        if (!ignore) setCurrentUser(null);
      }
    }

    if (getStoredUser()) restoreUserSession();

    return () => {
      ignore = true;
    };
  }, []);

  const filteredProvinces = CELLPHONES_47_PROVINCES.filter((province) => (
    province.toLowerCase().includes(locationSearch.toLowerCase())
  ));

  const handleCloseAllPopups = useCallback(() => {
    setActivePopup(null);
    setLocationSearch('');
  }, []);

  const goHome = () => {
    window.history.pushState(null, '', '/');
    setCurrentLocation(getBrowserLocationState());
    setCurrentPage('home');
  };

  const navigateToPath = useCallback((path) => {
    if (!path || path === '#') return;
    if (/^https?:\/\//i.test(path) || path.startsWith('tel:') || path.startsWith('mailto:')) {
      window.location.href = path;
      return;
    }

    window.history.pushState(null, '', path);
    const nextLocation = getBrowserLocationState();
    setCurrentLocation(nextLocation);
    const nextPage = getPageFromPathname(nextLocation.pathname, nextLocation.search);
    setCurrentPage(nextPage);
    handleCloseAllPopups();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [handleCloseAllPopups]);

  const goLogin = () => {
    window.history.pushState(null, '', '/smember/login');
    setCurrentLocation(getBrowserLocationState());
    setCurrentPage('login');
  };

  const goRegister = () => {
    window.history.pushState(null, '', '/smember/register');
    setCurrentLocation(getBrowserLocationState());
    setCurrentPage('register');
  };

  const goAdmin = () => {
    window.history.pushState(null, '', '/admin');
    setCurrentLocation(getBrowserLocationState());
    setCurrentPage('admin');
  };

  const goCart = () => {
    window.history.pushState(null, '', '/cart');
    setCurrentLocation(getBrowserLocationState());
    setCurrentPage('cart');
    handleCloseAllPopups();
  };

  const goCheckout = () => {
    window.history.pushState(null, '', '/checkout');
    setCurrentLocation(getBrowserLocationState());
    setCurrentPage('checkout');
    handleCloseAllPopups();
  };

  const goAccount = () => {
    window.history.pushState(null, '', '/smember');
    setCurrentLocation(getBrowserLocationState());
    setCurrentPage('account');
    handleCloseAllPopups();
  };

  useEffect(() => {
    const handlePopState = () => {
      const nextLocation = getBrowserLocationState();
      setCurrentLocation(nextLocation);
      setCurrentPage(getPageFromPathname(nextLocation.pathname, nextLocation.search));
      handleCloseAllPopups();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [handleCloseAllPopups]);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      const anchor = event.target.closest?.('a');
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const href = anchor.getAttribute('href') || '';
      if (!href) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (href.startsWith('tel:') || href.startsWith('mailto:') || /^https?:\/\//i.test(href)) return;

      if (href.startsWith('#')) {
        const targetId = href.slice(1);
        if (targetId && document.getElementById(targetId)) return;

        event.preventDefault();
        navigateToPath(getRouteForDeadAnchor(anchor));
        return;
      }

      if (href.startsWith('/')) {
        event.preventDefault();
        navigateToPath(href);
      }
    };

    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [navigateToPath]);

  const handleAuthSuccess = (user) => {
    if (user) setCurrentUser(user);
    if (user?.role === 'admin') {
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
    goLogin,
    goRegister,
    handleCloseAllPopups,
    locationSearch,
    selectedLocation,
    setLocationSearch,
    setSelectedLocation,
  };

  if (currentPage === 'login') {
    return (
      <LoginSmember
        onBackToHome={goHome}
        onGoRegister={goRegister}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  if (currentPage === 'register') {
    return (
      <RegisterSmember
        onBackToHome={goHome}
        onGoLogin={goLogin}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  if (currentPage === 'admin') {
    return (
      <AdminDashboard
        currentUser={currentUser}
        onBackHome={goHome}
        onLogout={handleLogout}
        onGoLogin={goLogin}
      />
    );
  }

  if (currentPage === 'account') {
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
            onNavigate={navigateToPath}
            search={currentLocation.search}
          />
        </main>
        <Footer />
        <FloatingActions />
        <HeaderPopups {...headerPopupProps} />
      </div>
    );
  }

  if (currentPage === 'cart') {
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

  if (currentPage === 'checkout') {
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

  if (currentPage === 'stores') {
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
            currentUser?.fullName
            || currentUser?.displayName
            || currentUser?.name
            || currentUser?.username
            || ''
          }
        />
      </div>
    );
  }

  if (currentPage === 'trade-in') {
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
        <main className="main-content tradein-main-shell">
          <TradeInPage />
        </main>
        <Footer />
        <FloatingActions />
        <HeaderPopups {...headerPopupProps} />
        <ChatbotWidget
          userName={
            currentUser?.fullName
            || currentUser?.displayName
            || currentUser?.name
            || currentUser?.username
            || ''
          }
        />
      </div>
    );
  }

  if (currentPage === 'promotions') {
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
        <main className="main-content promotions-main-shell">
          <PromotionsPage />
        </main>
        <Footer />
        <FloatingActions />
        <HeaderPopups {...headerPopupProps} />
        <ChatbotWidget
          userName={
            currentUser?.fullName
            || currentUser?.displayName
            || currentUser?.name
            || currentUser?.username
            || ''
          }
        />
      </div>
    );
  }

  if (currentPage === 'credit-card-installment-guide') {
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
        <main className="main-content credit-card-installment-main-shell">
          <CreditCardInstallmentGuidePage />
        </main>
        <Footer />
        <FloatingActions />
        <HeaderPopups {...headerPopupProps} />
        <ChatbotWidget
          userName={
            currentUser?.fullName
            || currentUser?.displayName
            || currentUser?.name
            || currentUser?.username
            || ''
          }
        />
      </div>
    );
  }

  if (currentPage === 'installment') {
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
        <main className="main-content installment-main-shell">
          <InstallmentPage />
        </main>
        <Footer />
        <FloatingActions />
        <HeaderPopups {...headerPopupProps} />
        <ChatbotWidget
          userName={
            currentUser?.fullName
            || currentUser?.displayName
            || currentUser?.name
            || currentUser?.username
            || ''
          }
        />
      </div>
    );
  }

  if (currentPage === 'shipping-policy') {
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
        <main className="main-content shipping-policy-main-shell">
          <ShippingPolicyPage />
        </main>
        <Footer />
        <FloatingActions />
        <HeaderPopups {...headerPopupProps} />
        <ChatbotWidget
          userName={
            currentUser?.fullName
            || currentUser?.displayName
            || currentUser?.name
            || currentUser?.username
            || ''
          }
        />
      </div>
    );
  }

  if (currentPage === 'footer-pages') {
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
        <main className="main-content footer-pages-main-shell">
          <FooterPages
            pathname={currentLocation.pathname}
            search={currentLocation.search}
          />
        </main>
        <Footer />
        <FloatingActions />
        <HeaderPopups {...headerPopupProps} />
        <ChatbotWidget
          userName={
            currentUser?.fullName
            || currentUser?.displayName
            || currentUser?.name
            || currentUser?.username
            || ''
          }
        />
      </div>
    );
  }

  if (currentPage === 'info' && currentLocation.pathname === '/sforum') {
    return (
      <div className="app app-sforum">
        <main className="main-content">
          <InfoPage
            pathname={currentLocation.pathname}
            search={currentLocation.search}
            onGoHome={goHome}
            currentUser={currentUser}
          />
        </main>
      </div>
    );
  }

  if (currentPage === 'info') {
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
            currentUser={currentUser}
          />
        </main>
        <Footer />
        <FloatingActions />
        <HeaderPopups {...headerPopupProps} />
        <ChatbotWidget
          userName={
            currentUser?.fullName
            || currentUser?.displayName
            || currentUser?.name
            || currentUser?.username
            || ''
          }
        />
      </div>
    );
  }

  if (currentPage === 'not-found') {
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
          <NotFoundPage onGoHome={goHome} />
        </main>
        <Footer />
        <FloatingActions />
        <HeaderPopups {...headerPopupProps} />
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

      <main className={`main-content ${isProductRoute ? 'product-detail-main' : ''}`}>
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
          currentUser?.fullName
          || currentUser?.displayName
          || currentUser?.name
          || currentUser?.username
          || ''
        }
      />
    </div>
  );
}

export default App;
