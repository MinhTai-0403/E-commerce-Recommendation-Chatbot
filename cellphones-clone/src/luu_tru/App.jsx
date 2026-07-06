import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { TopBar, MainHeader } from './components/Header/Header';
import HeroSection from './components/HeroSection/HeroSection';
import HotTrend from './components/HotTrend/HotTrend';
import CategoryBlock from './components/CategoryBlock/CategoryBlock';
import AccessoryCategories from './components/AccessoryCategories/AccessoryCategories';
import HomeApplianceCategories from './components/HomeApplianceCategories/HomeApplianceCategories';
import UsedProducts from './components/UsedProducts/UsedProducts';
import TechNews from './components/TechNews/TechNews';
import Footer from './components/Footer/Footer';
import ChatbotWidget from './components/ChatbotWidget/ChatbotWidget';
import ProductDetail from './components/ProductDetail/ProductDetail';
import LoginSmember from './components/LoginSmember/LoginSmember';
import RegisterSmember from './components/RegisterSmember/RegisterSmember';
import AdminDashboard from './components/AdminDashboard/AdminDashboard';
import { extractProductSlug, findProductDetailByPathname } from './data/productCatalog';
import {
  phoneSubCategories, phoneBrandFilters, phoneProducts,
  laptopBrandFilters, laptopProducts,
  audioProducts,
  watchProducts,
  tvBrandFilters, tvProducts,
  applianceBrandFilters, applianceProducts,
  hotTrendProducts,
} from './data/mockData';
import { useApiProductDetail, useApiProducts } from './hooks/useApiProducts';
import { clearAuthSession, fetchCurrentSmember, getStoredUser } from './services/apiAuth';

const homeProductQueries = {
  hotTrend: { category: 'Phụ kiện', include: 'details', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  phones: { category: 'Điện thoại', include: 'details', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  laptops: { category: 'Laptop', include: 'details', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  audio: { category: 'Âm thanh', include: 'details', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  watches: { category: 'Đồng hồ thông minh', include: 'details', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  tvs: { category: 'Tivi', include: 'details', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  appliances: { category: 'Đồ gia dụng', include: 'details', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  coldAppliances: { include: 'details', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
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

const authRouteMap = {
  '/login': 'login',
  '/register': 'register',
  '/smember/login': 'login',
  '/smember/register': 'register',
};

const getAuthPageFromPathname = (pathname = '') => {
  const cleaned = pathname.replace(/\/+$/g, '') || '/';
  return authRouteMap[cleaned] || '';
};

const getAppPageFromPathname = (pathname = '') => {
  const cleaned = pathname.replace(/\/+$/g, '') || '/';
  if (cleaned === '/admin') return 'admin';
  return getAuthPageFromPathname(cleaned);
};

const audioBrandFilters = [
  { id: 'all', name: 'Tất cả' },
  { id: 'apple', name: 'Apple' },
  { id: 'samsung', name: 'Samsung' },
  { id: 'sony', name: 'Sony' },
  { id: 'jbl', name: 'JBL' },
  { id: 'anker', name: 'Anker' },
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

function FloatingActions() {
  const [visible, setVisible] = useState(false);
  const [showApp, setShowApp] = useState(true);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <aside className="floating-actions" aria-label="Liên kết hỗ trợ nhanh">
      {showApp && (
        <div className="floating-app">
          <button type="button" onClick={() => setShowApp(false)} aria-label="Đóng quảng cáo tải ứng dụng">×</button>
          <a href="#" aria-label="Tải ứng dụng CellphoneS">
            <img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:100:100/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon_downloadapp.png" alt="Tải ứng dụng CellphoneS" width="100" height="100" />
          </a>
        </div>
      )}
      <button
        className={`floating-action-button back-to-top ${visible ? 'visible' : ''}`}
        onClick={scrollToTop}
        type="button"
      >
        <span>Lên đầu</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <polyline points="18 15 12 9 6 15" />
          <polyline points="18 20 12 14 6 20" />
        </svg>
      </button>
      <a className="floating-action-button floating-contact" href="#">
        <span>Liên hệ</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <path d="M18 19h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-1zM6 19H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h1z" />
          <path d="M18 19c0 1.1-.9 2-2 2h-3" />
        </svg>
      </a>
    </aside>
  );
}

function ProductRoute({ slug, currentUser, onGoLogin }) {
  const fallbackProduct = useMemo(() => (
    findProductDetailByPathname(window.location.pathname)
  ), []);
  const { product, loading, error, source } = useApiProductDetail(slug, fallbackProduct);
  const resolvedProduct = source === 'api' ? product : (fallbackProduct || product);

  if (resolvedProduct) {
    return (
      <ProductDetail
        product={resolvedProduct}
        currentUser={currentUser}
        onGoLogin={onGoLogin}
      />
    );
  }

  return (
    <section className="route-state-card">
      <div className="container">
        <div className="route-state-box">
          <h1>{loading ? 'Đang tải sản phẩm từ MongoDB...' : 'Không tìm thấy sản phẩm'}</h1>
          <p>
            {error
              ? 'API chưa trả về sản phẩm này. Kiểm tra lại backend hoặc slug sản phẩm trong MongoDB.'
              : 'Frontend đang kết nối API backend để lấy chi tiết sản phẩm.'}
          </p>
          <a href="/">Quay lại trang chủ</a>
        </div>
      </div>
    </section>
  );
}

function HomePage({ currentUser, onGoLogin, onGoRegister }) {
  const hotTrend = useApiProducts(homeProductQueries.hotTrend, hotTrendProducts);

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
        productQuery={homeProductQueries.laptops}
        tabQueries={homeTabQueries.laptops}
        products={laptopProducts}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:795/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KVFPDXRAJ749QHYHQKZFR23W.png"
      />

      <CategoryBlock
        title="Âm thanh"
        tabs={['Âm thanh', 'Tai nghe', 'Loa']}
        filters={audioBrandFilters}
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
        productQuery={homeProductQueries.coldAppliances}
        tabQueries={homeTabQueries.coldAppliances}
        products={applianceProducts}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KDCX8QQYKQ4AX3BEHBRA5B9W.png"
      />

      <CategoryBlock
        title="Đồ gia dụng"
        tabs={['Đồ gia dụng', 'Chăm sóc nhà', 'Chăm sóc sức khỏe']}
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
  const appPage = getAppPageFromPathname(window.location.pathname);
  const productSlug = appPage ? '' : extractProductSlug(window.location.pathname);
  const isProductRoute = Boolean(productSlug) && !appPage;
  const [activePopup, setActivePopup] = useState(null);
  const [currentPage, setCurrentPage] = useState(() => (
    appPage || 'home'
  ));
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [selectedLocation, setSelectedLocation] = useState('Hồ Chí Minh');
  const [locationSearch, setLocationSearch] = useState('');

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

  const handleCloseAllPopups = () => {
    setActivePopup(null);
    setLocationSearch('');
  };

  const goHome = () => {
    window.history.pushState(null, '', '/');
    setCurrentPage('home');
  };

  const goLogin = () => {
    window.history.pushState(null, '', '/smember/login');
    setCurrentPage('login');
  };

  const goRegister = () => {
    window.history.pushState(null, '', '/smember/register');
    setCurrentPage('register');
  };

  const goAdmin = () => {
    window.history.pushState(null, '', '/admin');
    setCurrentPage('admin');
  };

  const handleAuthSuccess = (user) => {
    if (user) setCurrentUser(user);
    if (user?.role === 'admin') {
      goAdmin();
      return;
    }
    goHome();
  };

  const handleLogout = () => {
    clearAuthSession();
    setCurrentUser(null);
    handleCloseAllPopups();
    goHome();
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

  return (
    <div className="app">
      {activePopup === 'category' && (
        <div
          className="global-backdrop-overlay"
          onClick={handleCloseAllPopups}
          role="presentation"
        />
      )}

      {(activePopup === 'location' || activePopup === 'auth') && (
        <div
          className="location-global-overlay"
          onClick={handleCloseAllPopups}
          role="presentation"
        />
      )}

      <TopBar />
      <MainHeader
        activePopup={activePopup}
        setActivePopup={setActivePopup}
        selectedLocation={selectedLocation}
        currentUser={currentUser}
      />

      <main className={`main-content ${isProductRoute ? 'product-detail-main' : ''}`}>
        {isProductRoute ? (
          <ProductRoute
            slug={productSlug}
            currentUser={currentUser}
            onGoLogin={goLogin}
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

      <ChatbotWidget
        userName={
          currentUser?.fullName
          || currentUser?.displayName
          || currentUser?.name
          || currentUser?.username
          || ''
        }
      />

      {activePopup === 'location' && (
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
            Vui lòng chọn tỉnh, thành phố để biết chính xác giá, khuyến mãi và tồn kho
          </div>

          <div className="location-modal-body">
            {filteredProvinces.length > 0 ? (
              <div className="location-grid-layout">
                {filteredProvinces.map((province) => (
                  <button
                    key={province}
                    className={`location-grid-item ${selectedLocation === province ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedLocation(province);
                      handleCloseAllPopups();
                    }}
                    type="button"
                  >
                    <span>{province}</span>
                    {selectedLocation === province && <span className="check-mark">✓</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="location-no-data">Không tìm thấy tỉnh thành phù hợp</div>
            )}
          </div>
        </div>
      )}

      {activePopup === 'auth' && (
        <div className="auth-modal-box">
          <button className="auth-modal-close-x" onClick={handleCloseAllPopups} type="button">
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
                Xin chào <strong>{currentUser.fullName || currentUser.email}</strong>.
                Tài khoản của bạn đã đăng nhập và sẵn sàng dùng ưu đãi Smember.
              </p>
              <div className="auth-modal-user-meta">
                <span>{currentUser.email}</span>
                <span>{currentUser.phone}</span>
                <span>Role: {currentUser.role || 'customer'}</span>
              </div>
              <div className="auth-modal-actions stacked">
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
                Vui lòng đăng nhập tài khoản Smember để xem ưu đãi và thanh toán dễ dàng hơn.
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
