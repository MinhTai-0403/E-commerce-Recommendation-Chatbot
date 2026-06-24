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
import ProductDetail from './components/ProductDetail/ProductDetail';
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

const homeProductQueries = {
  hotTrend: { category: 'Phụ kiện', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  phones: { category: 'Điện thoại', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  laptops: { category: 'Laptop', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  audio: { category: 'Âm thanh', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  watches: { category: 'Đồng hồ thông minh', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  tvs: { category: 'Tivi', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  appliances: { category: 'Đồ gia dụng', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
  coldAppliances: { q: 'Tủ lạnh', displayLimit: 12, fetchLimit: 72, sort: 'price_desc' },
};

const audioBrandFilters = [
  { id: 'all', name: 'Tất cả' },
  { id: 'apple', name: 'Apple' },
  { id: 'samsung', name: 'Samsung' },
  { id: 'sony', name: 'Sony' },
  { id: 'jbl', name: 'JBL' },
  { id: 'anker', name: 'Anker' },
];

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

function ProductRoute({ slug }) {
  const fallbackProduct = useMemo(() => (
    findProductDetailByPathname(window.location.pathname)
  ), []);
  const { product, loading, error } = useApiProductDetail(slug, fallbackProduct);

  if (product) {
    return <ProductDetail product={product} />;
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

function HomePage() {
  const hotTrend = useApiProducts(homeProductQueries.hotTrend, hotTrendProducts);
  const phones = useApiProducts(homeProductQueries.phones, phoneProducts);
  const laptops = useApiProducts(homeProductQueries.laptops, laptopProducts);
  const audio = useApiProducts(homeProductQueries.audio, audioProducts);
  const watches = useApiProducts(homeProductQueries.watches, watchProducts);
  const tvs = useApiProducts(homeProductQueries.tvs, tvProducts);
  const appliances = useApiProducts(homeProductQueries.appliances, applianceProducts);
  const coldAppliances = useApiProducts(homeProductQueries.coldAppliances, applianceProducts);

  return (
    <>
      <HeroSection />

      <HotTrend products={hotTrend.products} />

      <CategoryBlock
        title="Điện thoại nổi bật"
        tabs={['Điện thoại', 'Máy tính bảng']}
        subCategories={phoneSubCategories}
        filters={phoneBrandFilters}
        products={phones.products}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:795/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KTXD3MF8YTC80J2CHM6AVC9F.jpg"
      />

      <AccessoryCategories />

      <CategoryBlock
        title="Laptop"
        tabs={['Laptop', 'Màn hình', 'PC Gaming']}
        filters={laptopBrandFilters}
        products={laptops.products}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:795/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KVFPDXRAJ749QHYHQKZFR23W.png"
      />

      <CategoryBlock
        title="Âm thanh"
        tabs={['Âm thanh', 'Tai nghe', 'Loa']}
        filters={audioBrandFilters}
        products={audio.products}
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
        products={watches.products}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KTQYDCRMJX3BWCYNHPYJ6FRC.png"
      />

      <CategoryBlock
        title="Tivi"
        tabs={['Tivi']}
        filters={tvBrandFilters}
        products={tvs.products}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KT8ANYD04XX6K1VH0NZ387P7.png"
      />

      <HomeApplianceCategories />

      <CategoryBlock
        title="Tủ lạnh - Tủ đông"
        tabs={['Tủ lạnh - Tủ đông', 'Máy giặt', 'Máy sấy quần áo', 'Điều hòa - Máy lạnh']}
        filters={applianceBrandFilters}
        products={coldAppliances.products}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KDCX8QQYKQ4AX3BEHBRA5B9W.png"
      />

      <CategoryBlock
        title="Đồ gia dụng"
        tabs={['Đồ gia dụng', 'Chăm sóc nhà', 'Chăm sóc sức khỏe']}
        filters={applianceBrandFilters}
        products={appliances.products}
        campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KDCX8QQYKQ4AX3BEHBRA5B9W.png"
      />

      <UsedProducts />

      <TechNews />
    </>
  );
}

function App() {
  const productSlug = extractProductSlug(window.location.pathname);
  const isProductRoute = Boolean(productSlug);

  return (
    <div className="app">
      <TopBar />
      <MainHeader />

      <main className={`main-content ${isProductRoute ? 'product-detail-main' : ''}`}>
        {isProductRoute ? <ProductRoute slug={productSlug} /> : <HomePage />}
      </main>

      <Footer />

      <FloatingActions />
    </div>
  );
}

export default App;
