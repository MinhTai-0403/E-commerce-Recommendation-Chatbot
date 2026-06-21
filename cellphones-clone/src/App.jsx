import './App.css';
import { TopBar, MainHeader } from './components/Header/Header';
import HeroSection from './components/HeroSection/HeroSection';
import FlashSale from './components/FlashSale/FlashSale';
import HotTrend from './components/HotTrend/HotTrend';
import CategoryBlock from './components/CategoryBlock/CategoryBlock';
import PromoBanners from './components/PromoBanners/PromoBanners';
import UsedProducts from './components/UsedProducts/UsedProducts';
import BrandStores from './components/BrandStores/BrandStores';
import TechNews from './components/TechNews/TechNews';
import Footer from './components/Footer/Footer';
import {
  phoneSubCategories, phoneBrandFilters, phoneProducts,
  laptopBrandFilters, laptopProducts,
  audioProducts,
  watchProducts,
} from './data/mockData';
import { useState } from 'react';

function BackToTop() {
  const [visible, setVisible] = useState(false);

  const handleScroll = () => {
    setVisible(window.scrollY > 400);
  };

  useState(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  });

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      className={`back-to-top ${visible ? 'visible' : ''}`}
      onClick={scrollToTop}
      aria-label="Back to top"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="18 15 12 9 6 15"/>
      </svg>
    </button>
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

        {/* Flash Sale */}
        <FlashSale />

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

        {/* Laptop */}
        <CategoryBlock
          title="Laptop"
          tabs={['Laptop', 'Màn hình', 'PC Gaming']}
          filters={laptopBrandFilters}
          products={laptopProducts}
          campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:795/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KVFPDXRAJ749QHYHQKZFR23W.png"
        />

        {/* Promo Banners */}
        <PromoBanners />

        {/* Âm thanh */}
        <CategoryBlock
          title="Âm thanh"
          tabs={['Tai nghe', 'Loa']}
          filters={[
            { id: 'all', name: 'Tất cả' },
            { id: 'apple', name: 'Apple' },
            { id: 'sony', name: 'Sony' },
            { id: 'samsung', name: 'Samsung' },
            { id: 'jbl', name: 'JBL' },
            { id: 'marshall', name: 'Marshall' },
          ]}
          products={audioProducts}
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
        />



        {/* Hàng cũ */}
        <UsedProducts />

        {/* Brand Stores */}
        <BrandStores />

        {/* Tech News */}
        <TechNews />
      </main>

      {/* Footer */}
      <Footer />

      {/* Back to Top */}
      <BackToTop />
    </div>
  );
}

export default App;
