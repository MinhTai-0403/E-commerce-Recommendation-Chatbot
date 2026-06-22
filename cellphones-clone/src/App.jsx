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
import {
  phoneSubCategories, phoneBrandFilters, phoneProducts,
  laptopBrandFilters, laptopProducts,
  watchProducts,
  tvBrandFilters, tvProducts,
  applianceBrandFilters, applianceProducts,
} from './data/mockData';
import { useEffect, useState } from 'react';

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

function App() {
  return (
    <div className="app">
      {/* Header */}
      <TopBar />
      <MainHeader />

      {/* Main Content */}
      <main className="main-content">
        {/* Hero Section */}
        <HeroSection />

        {/* Hot Trend */}
        <HotTrend />

        {/* Điện thoại */}
        <CategoryBlock
          title="Điện thoại nổi bật"
          tabs={['Điện thoại', 'Máy tính bảng']}
          subCategories={phoneSubCategories}
          filters={phoneBrandFilters}
          products={phoneProducts}
          campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:795/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KTXD3MF8YTC80J2CHM6AVC9F.jpg"
        />

        <AccessoryCategories />

        {/* Laptop */}
        <CategoryBlock
          title="Laptop"
          tabs={['Laptop', 'Màn hình', 'PC Gaming']}
          filters={laptopBrandFilters}
          products={laptopProducts}
          campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:795/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KVFPDXRAJ749QHYHQKZFR23W.png"
        />

        {/* Đồng hồ */}
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
          products={watchProducts}
          campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KTQYDCRMJX3BWCYNHPYJ6FRC.png"
        />

        {/* Tivi */}
        <CategoryBlock
          title="Tivi"
          tabs={['Tivi']}
          filters={tvBrandFilters}
          products={tvProducts}
          campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KT8ANYD04XX6K1VH0NZ387P7.png"
        />

        <HomeApplianceCategories />

        {/* Tủ lạnh - Tủ đông */}
        <CategoryBlock
          title="Tủ lạnh - Tủ đông"
          tabs={['Tủ lạnh - Tủ đông', 'Máy giặt', 'Máy sấy quần áo', 'Điều hòa - Máy lạnh']}
          filters={applianceBrandFilters}
          products={applianceProducts}
          campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KDCX8QQYKQ4AX3BEHBRA5B9W.png"
        />

        {/* Hàng cũ */}
        <UsedProducts />

        {/* Tech News */}
        <TechNews />
      </main>

      {/* Footer */}
      <Footer />

      <FloatingActions />
    </div>
  );
}

export default App;
