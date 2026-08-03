import { useEffect, useMemo, useState } from 'react';
import { PHONE_BRANDS } from '../HeroSection/brandData';
import { buildCategoryPath } from '../../utils/linkRoutes';
import './CategoryShowcase.css';

const PHONE_BANNERS = [
  {
    alt: 'Samsung Galaxy Z Fold8 Ultra 5G',
    href: '/dien-thoai-samsung-galaxy-z-fold-8-ultra.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Z8_Cate_3.png',
  },
  {
    alt: 'iPhone 17 Pro Max',
    href: '/iphone-17-pro-max.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/595x100_iPhone17ProMax_07_2026.png',
  },
  {
    alt: 'Samsung Galaxy S26',
    href: '/dien-thoai-samsung-galaxy-s26-ultra.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cates26ggg.png',
  },
  {
    alt: 'HONOR 600 5G',
    href: '/dien-thoai-honor-600.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/cate_Honor600_opensale.jpg',
  },
  {
    alt: 'OPPO Reno16 F',
    href: '/dien-thoai-oppo-reno16-f.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/oppo-reno-16-f-cate.jpg',
  },
  {
    alt: 'Xiaomi 17T 5G',
    href: '/dien-thoai-xiaomi-17t.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/xiaomi-17t-cate-0726.png',
  },
];

const EXTRA_PHONE_BRANDS = [
  {
    name: 'Vivo',
    logo: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:30/plain/https://cellphones.com.vn/media/wysiwyg/Web/Brand/Vivo-240x50.png',
  },
  {
    name: 'OnePlus',
    logo: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:30/plain/https://cellphones.com.vn/media/wysiwyg/Web/Brand/ONEPLUS-240x50.png',
  },
  {
    name: 'TCL',
    logo: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:30/plain/https://cellphones.com.vn/media/tmp/catalog/product/t/i/tivi-logo-cate.png',
  },
  {
    name: 'Benco',
    logo: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:30/plain/https://cellphones.com.vn/media/wysiwyg/Web/Brand/benco-240x50.png',
  },
  {
    name: 'ASUS',
    logo: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:30/plain/https://cellphones.com.vn/media/wysiwyg/Web/Brand/ASUS-240x50.png',
  },
];

const PHONE_NEEDS = [
  {
    label: 'Điện thoại chơi game',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/mobile-gamning.png',
    query: { usage: 'Chơi game' },
  },
  {
    label: 'Điện thoại pin trâu',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/mobile-pin.png',
    query: { usage: 'Pin trâu' },
  },
  {
    label: 'Điện thoại 5G',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/mobile-5g_1.png',
    query: { special: '5G' },
  },
  {
    label: 'Điện thoại chụp ảnh đẹp',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/mobile-chup-anh.png',
    query: { usage: 'Chụp ảnh đẹp' },
  },
  {
    label: 'Điện thoại gập',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/mobile-gap_1.png',
    query: { q: 'Galaxy Z Fold Flip' },
  },
  {
    label: 'Điện thoại AI',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/dien-thoai-ai-icon-cate.png',
    query: { special: 'AI tích hợp' },
  },
  {
    label: 'Điện thoại phổ thông',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/dien-thoai-pho-thong-icon-cate.png',
    query: { q: 'điện thoại phổ thông' },
  },
];

const brandKeyByName = {
  apple: 'apple',
  oppo: 'oppo',
  oneplus: 'oneplus',
  realme: 'realme',
  nothing: 'nothing',
};

const getBrandKey = (name = '') => (
  brandKeyByName[name.toLowerCase()] || name.toLowerCase()
);

export default function CategoryShowcase({ page }) {
  const [activeBanner, setActiveBanner] = useState(0);
  const brands = useMemo(() => [...PHONE_BRANDS, ...EXTRA_PHONE_BRANDS], []);
  const visibleBanners = [
    PHONE_BANNERS[activeBanner],
    PHONE_BANNERS[(activeBanner + 1) % PHONE_BANNERS.length],
  ];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveBanner((current) => (current + 2) % PHONE_BANNERS.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="category-showcase" aria-label="Khám phá danh mục điện thoại">
      <div className="category-showcase-banners">
        {visibleBanners.map((banner) => (
          <a href={banner.href} key={banner.image} className="category-showcase-banner">
            <img src={banner.image} alt={banner.alt} width="595" height="100" />
          </a>
        ))}
        <button
          type="button"
          className="category-showcase-arrow previous"
          aria-label="Banner danh mục trước"
          onClick={() => setActiveBanner((current) => (
            current - 2 < 0 ? PHONE_BANNERS.length - 2 : current - 2
          ))}
        >
          ‹
        </button>
        <button
          type="button"
          className="category-showcase-arrow next"
          aria-label="Banner danh mục tiếp theo"
          onClick={() => setActiveBanner((current) => (current + 2) % PHONE_BANNERS.length)}
        >
          ›
        </button>
        <div className="category-showcase-dots" aria-label="Chọn nhóm banner">
          {Array.from({ length: PHONE_BANNERS.length / 2 }).map((_, index) => (
            <button
              type="button"
              key={index}
              aria-label={`Nhóm banner ${index + 1}`}
              aria-pressed={activeBanner === index * 2}
              onClick={() => setActiveBanner(index * 2)}
            />
          ))}
        </div>
      </div>

      <h1>{page.title}</h1>

      <div className="category-brand-grid" aria-label="Hãng điện thoại">
        {brands.map((brand) => (
          <a
            key={brand.name}
            href={buildCategoryPath('Điện thoại', {
              brand: getBrandKey(brand.name),
              title: `Điện thoại ${brand.name}`,
            })}
            aria-label={`Điện thoại ${brand.name}`}
          >
            <img src={brand.logo} alt={`Điện thoại ${brand.name}`} loading="lazy" />
          </a>
        ))}
      </div>

      <section className="category-needs" aria-labelledby="category-needs-title">
        <h2 id="category-needs-title">Chọn theo nhu cầu</h2>
        <div className="category-needs-list">
          {PHONE_NEEDS.map((item) => (
            <a
              href={buildCategoryPath('Điện thoại', {
                ...item.query,
                title: item.label,
              })}
              key={item.label}
            >
              <img src={item.image} alt="" loading="lazy" />
              <span>{item.label}</span>
            </a>
          ))}
        </div>
      </section>
    </section>
  );
}
