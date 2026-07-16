import { useMemo, useState } from 'react';
import './HotTrend.css';
import {
  hotTrendCategoryFilters,
  hotTrendSubFilters,
  hotTrendProducts,
  phoneProducts,
  laptopProducts,
  audioProducts,
  watchProducts,
  tvProducts,
  applianceProducts,
} from '../../data/mockData';
import ProductCard, { ProductCardSkeleton } from '../ProductCard/ProductCard';
import { useApiProducts } from '../../hooks/useApiProducts';

const normalizeText = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const mainTabConfig = {
  deal: { sort: 'hot_deal', filter: 'hot-deal' },
  hot: { sort: 'hot_trend' },
  new: { sort: 'latest' },
};

const categoryQueryMap = {
  'phu-kien': { category: 'Phụ kiện' },
  'dong-ho': { category: 'Đồng hồ thông minh|Âm thanh' },
  'dien-thoai': { category: 'Điện thoại' },
  tablet: { category: 'Máy tính bảng' },
  laptop: { category: 'Laptop' },
  'man-hinh': { category: 'Màn hình|Linh kiện máy tính' },
  'dien-may': { category: 'Đồ gia dụng|Tivi' },
};

const subFilterQueryMap = {
  all: {},
  'cu-cap': { productType: 'cu-cap' },
  chuot: { productType: 'chuot-ban-phim' },
  sac: { productType: 'sac-du-phong' },
  camera: { productType: 'camera' },
  'apple-pk': { productType: 'phu-kien-apple' },
  'tien-ich': { productType: 'phu-kien-tien-ich' },
  'op-lung': { productType: 'op-lung' },
};

const categoryKeywordMap = {
  'phu-kien': ['phu kien', 'sac', 'cap', 'op lung', 'bao da', 'camera', 'chuot', 'ban phim', 'tai nghe'],
  'dong-ho': ['dong ho', 'am thanh', 'tai nghe', 'loa', 'apple watch', 'garmin', 'soundpeats', 'jbl'],
  'dien-thoai': ['dien thoai', 'iphone', 'samsung', 'xiaomi', 'oppo', 'honor', 'realme'],
  tablet: ['tablet', 'may tinh bang', 'ipad'],
  laptop: ['laptop', 'macbook', 'asus', 'lenovo', 'acer', 'hp', 'dell'],
  'man-hinh': ['man hinh', 'pc', 'may tinh', 'gaming pc'],
  'dien-may': ['dien may', 'gia dung', 'tivi', 'may hut bui', 'tu lanh', 'may giat', 'noi chien'],
};

const categoryFallbackProducts = {
  'phu-kien': hotTrendProducts,
  'dong-ho': [...watchProducts, ...audioProducts],
  'dien-thoai': phoneProducts,
  tablet: phoneProducts,
  laptop: laptopProducts,
  'man-hinh': laptopProducts,
  'dien-may': [...applianceProducts, ...tvProducts],
};

const subKeywordMap = {
  all: [],
  'cu-cap': ['cu sac', 'cap sac', 'adapter', 'cap type c', 'type c to', 'lightning'],
  chuot: ['chuot', 'ban phim', 'keyboard', 'mouse'],
  sac: ['sac du phong', 'pin du phong', 'power bank'],
  camera: ['camera', 'webcam', 'ip 360', 'dji', 'gimbal', 'flycam'],
  'apple-pk': ['apple', 'iphone', 'airpods', 'magsafe'],
  'tien-ich': ['tien ich', 'quat', 'den', 'may loc', 'massage'],
  'op-lung': ['op lung', 'bao da', 'case'],
};

const textOfProduct = (product = {}) => normalizeText([
  product.name,
  product.title,
  product.category,
  product.categoryName,
  product.brand,
  product.brandKey,
  product.segment,
  product.sku,
  product.slug,
].filter(Boolean).join(' '));

const matchesKeywords = (product, keywords = []) => {
  if (!keywords.length) return true;
  const text = textOfProduct(product);
  return keywords.some((keyword) => text.includes(keyword));
};

const matchesSubFilter = (product, filterId) => {
  if (filterId === 'all') return true;
  const text = textOfProduct(product);
  if (filterId === 'cu-cap' && ['du phong', 'power bank', 'flash drive', 'usb sandisk', 'o cung', 'the nho'].some((value) => text.includes(value))) {
    return false;
  }
  return matchesKeywords(product, subKeywordMap[filterId] || []);
};

const hasSellablePrice = (product = {}) => toNumber(product.currentPrice || product.price) > 0;

const isAvailableProduct = (product = {}) => {
  const status = normalizeText(product.statusLabel || product.availability?.status || product.availability);
  return hasSellablePrice(product) && !['lien he', 'het hang', 'outofstock'].some((value) => status.includes(value));
};

const toNumber = (value) => {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : 0;
};

const productScore = (product = {}, activeMainTab = 'deal') => {
  if (activeMainTab === 'deal') {
    return toNumber(product.discount) * 100000000 + toNumber(product.originalPrice) - toNumber(product.currentPrice);
  }
  if (activeMainTab === 'new') {
    return toNumber(product.isNew || product.newArrival) * 100000000 + toNumber(product.id);
  }
  return toNumber(product.rating) * 1000000 + toNumber(product.ratingCount) * 1000 + toNumber(product.discount);
};

const buildHotTrendQuery = (activeMainTab, activeCategory, activeSubFilter) => {
  const base = {
    include: 'details',
    displayLimit: 12,
    fetchLimit: 96,
    inStock: true,
    ...(mainTabConfig[activeMainTab] || mainTabConfig.deal),
    ...(categoryQueryMap[activeCategory] || categoryQueryMap['phu-kien']),
  };
  const subQuery = activeCategory === 'phu-kien'
    ? (subFilterQueryMap[activeSubFilter] || {})
    : {};

  return {
    ...base,
    ...subQuery,
    q: subQuery.q || base.q,
  };
};

export default function HotTrend({ products = hotTrendProducts, loading = false }) {
  const [activeMainTab, setActiveMainTab] = useState('deal');
  const [activeCategory, setActiveCategory] = useState('phu-kien');
  const [activeSubFilter, setActiveSubFilter] = useState('all');
  const query = useMemo(() => buildHotTrendQuery(activeMainTab, activeCategory, activeSubFilter), [activeMainTab, activeCategory, activeSubFilter]);
  const fallbackProducts = useMemo(() => {
    const propProducts = Array.isArray(products) && products.length ? products : [];
    const categoryProducts = categoryFallbackProducts[activeCategory] || hotTrendProducts;
    const seen = new Set();
    const source = [...propProducts, ...categoryProducts].filter((product) => {
      const key = product?.id || product?.slug || product?.sku || product?.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const categoryKeywords = categoryKeywordMap[activeCategory] || [];
    const filtered = source
      .filter((product) => matchesKeywords(product, categoryKeywords))
      .filter((product) => activeCategory !== 'phu-kien' || matchesSubFilter(product, activeSubFilter))
      .sort((a, b) => productScore(b, activeMainTab) - productScore(a, activeMainTab));

    return (filtered.length ? filtered : categoryProducts).slice(0, 12);
  }, [activeCategory, activeMainTab, activeSubFilter, products]);
  const trendProducts = useApiProducts(query, fallbackProducts);
  const displayProducts = useMemo(() => {
    const categoryKeywords = categoryKeywordMap[activeCategory] || [];
    const seen = new Set();
    const source = [...(trendProducts.products || []), ...fallbackProducts].filter((product) => {
      const key = product?.id || product?.slug || product?.sku || product?.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return source
      .filter(isAvailableProduct)
      .filter((product) => matchesKeywords(product, categoryKeywords))
      .filter((product) => activeCategory !== 'phu-kien' || matchesSubFilter(product, activeSubFilter))
      .sort((a, b) => productScore(b, activeMainTab) - productScore(a, activeMainTab))
      .slice(0, 12);
  }, [activeCategory, activeMainTab, activeSubFilter, fallbackProducts, trendProducts.products]);
  const isLoading = loading || trendProducts.loading;
  const resetSubFilter = () => setActiveSubFilter('all');
  const scrollSubFilters = () => {
    document.querySelector('.hot-trend-sub-filters')?.scrollBy({ left: 180, behavior: 'smooth' });
  };

  return (
    <section className="hot-trend section-gap" id="hot-trend-section">
      <div className="container">
        <div className="hot-trend-wrapper">
          {/* Top Banner & Tabs */}
          <div className="hot-trend-header">
            <div className="hot-trend-tabs-wrapper">
              <div className="hot-trend-tabs">
                <button className={`hot-trend-tab-btn ${activeMainTab === 'deal' ? 'active' : ''}`} onClick={() => setActiveMainTab('deal')} aria-pressed={activeMainTab === 'deal'}>
                  <img src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/hotDueHome03.png" alt="Deal sốc mỗi ngày" />
                </button>
                <button className={`hot-trend-tab-btn ${activeMainTab === 'hot' ? 'active' : ''}`} onClick={() => setActiveMainTab('hot')} aria-pressed={activeMainTab === 'hot'}>
                  <img src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/hotTrendHome02.png" alt="Sản phẩm hot trend" />
                </button>
                <button className={`hot-trend-tab-btn ${activeMainTab === 'new' ? 'active' : ''}`} onClick={() => setActiveMainTab('new')} aria-pressed={activeMainTab === 'new'}>
                  <img src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/newArrivalHome.png" alt="Hàng mới về" />
                </button>
              </div>
            </div>
          </div>

          <div className="hot-trend-content">
            {/* Category Filters */}
            <div className="hot-trend-category-filters">
              {hotTrendCategoryFilters.map(filter => (
                <button 
                  key={filter.id}
                  className={`ht-cat-filter ${activeCategory === filter.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveCategory(filter.id);
                    resetSubFilter();
                  }}
                  aria-pressed={activeCategory === filter.id}
                >
                  {filter.name}
                </button>
              ))}
            </div>

            {/* Sub Filters (Icons) */}
            {activeCategory === 'phu-kien' && <div className="hot-trend-sub-filters-container">
              <div className="hot-trend-sub-filters">
                {hotTrendSubFilters.map(filter => (
                  <button 
                    key={filter.id}
                    className={`ht-sub-filter ${activeSubFilter === filter.id ? 'active' : ''}`}
                    onClick={() => setActiveSubFilter(filter.id)}
                    aria-pressed={activeSubFilter === filter.id}
                  >
                    {filter.icon && <img className="ht-sub-filter-icon" src={filter.icon} alt="" />}
                    {filter.name}
                  </button>
                ))}
              </div>
              <button className="ht-sub-filter-next" type="button" aria-label="Xem thêm bộ lọc" onClick={scrollSubFilters}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>}

            {/* Products */}
            <div className="hot-trend-products" aria-busy={isLoading}>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <div key={`hot-trend-skeleton-${index}`} className="ht-product-wrapper">
                    <ProductCardSkeleton />
                  </div>
                ))
              ) : displayProducts.length ? (
                displayProducts.map((product) => (
                  <div key={product.id || product.slug || product.name} className="ht-product-wrapper">
                    <ProductCard product={product} />
                  </div>
                ))
              ) : (
                <div className="hot-trend-empty">Chưa có sản phẩm phù hợp với bộ lọc này.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
