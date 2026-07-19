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

const categoryValueMap = {
  'phu-kien': ['phu kien'],
  'dong-ho': ['dong ho thong minh', 'am thanh'],
  'dien-thoai': ['dien thoai'],
  tablet: ['may tinh bang'],
  laptop: ['laptop'],
  'man-hinh': ['man hinh', 'linh kien may tinh'],
  'dien-may': ['do gia dung', 'nha thong minh', 'tivi'],
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
  camera: ['camera ip', 'camera wifi', 'camera an ninh', 'camera giam sat', 'camera hanh trinh', 'webcam', 'ip 360', 'dji osmo', 'may quay', 'gimbal', 'flycam'],
  'apple-pk': ['apple', 'iphone', 'ipad', 'macbook', 'airpods', 'airtag', 'apple pencil', 'apple watch', 'magic keyboard', 'magic mouse'],
  'tien-ich': ['tien ich', 'quat', 'den led', 'den ban', 'den ngu', 'den pin', 'gia do', 'gay selfie', 'hub', 'thiet bi mang', 'kich song', 'bo phat wifi', 'router', 'tripod', 'but cam ung', 'tay cam', 'bo chuyen doi'],
  'op-lung': ['op lung', 'bao da'],
};

const subExcludeKeywordMap = {
  'cu-cap': ['du phong', 'power bank', 'flash drive', 'usb sandisk', 'o cung', 'the nho'],
  camera: ['op lung', 'bao da', ' case ', 'dan man hinh', 'mieng dan', 'kinh cuong luc', 'bao ve camera', 'vien camera', 'camera control', 'sticker'],
  'tien-ich': ['dan man hinh', 'mieng dan', 'kinh cuong luc', 'op lung', 'bao da'],
  'op-lung': ['dan man hinh', 'mieng dan', 'kinh cuong luc', 'screen protector'],
};

const textOfProduct = (product = {}) => normalizeText([
  product.name,
  product.title,
  product.category,
  product.categoryName,
  ...(Array.isArray(product.categories) ? product.categories : []),
  ...(Array.isArray(product.categoryTrail)
    ? product.categoryTrail.flatMap((item) => [item?.name, item?.label, item?.href])
    : []),
  product.brand,
  product.brandKey,
  product.segment,
  product.sku,
  product.slug,
].filter(Boolean).join(' '));

const categoryValuesOfProduct = (product = {}) => [
  product.category,
  product.categoryName,
  ...(Array.isArray(product.categories) ? product.categories : []),
  ...(Array.isArray(product.categoryTrail)
    ? product.categoryTrail.flatMap((item) => [item?.name, item?.label])
    : []),
].filter(Boolean).map(normalizeText);

const matchesCategory = (product, categoryId) => {
  const acceptedValues = categoryValueMap[categoryId] || [];
  if (!acceptedValues.length) return true;
  const productValues = categoryValuesOfProduct(product);
  return acceptedValues.some((accepted) => productValues.includes(accepted));
};

const matchesSubFilter = (product, filterId) => {
  if (filterId === 'all') return true;
  const text = ` ${textOfProduct(product)} `;
  const excludedKeywords = subExcludeKeywordMap[filterId] || [];
  if (excludedKeywords.some((value) => text.includes(value))) {
    return false;
  }
  return (subKeywordMap[filterId] || []).some((keyword) => text.includes(keyword));
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
    const filtered = source
      .filter((product) => matchesCategory(product, activeCategory))
      .filter((product) => activeCategory !== 'phu-kien' || matchesSubFilter(product, activeSubFilter))
      .sort((a, b) => productScore(b, activeMainTab) - productScore(a, activeMainTab));

    // A selected sub-filter is strict. Falling back to the whole accessory
    // category is what caused "Camera" to show cases and unrelated products.
    if (activeCategory === 'phu-kien' && activeSubFilter !== 'all') {
      return filtered.slice(0, 12);
    }

    return (filtered.length ? filtered : categoryProducts).slice(0, 12);
  }, [activeCategory, activeMainTab, activeSubFilter, products]);
  const trendProducts = useApiProducts(query, fallbackProducts);
  const displayProducts = useMemo(() => {
    const seen = new Set();
    const source = [...(trendProducts.products || [])].filter((product) => {
      const key = product?.id || product?.slug || product?.sku || product?.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return source
      .filter(isAvailableProduct)
      .filter((product) => matchesCategory(product, activeCategory))
      .filter((product) => activeCategory !== 'phu-kien' || matchesSubFilter(product, activeSubFilter))
      .sort((a, b) => productScore(b, activeMainTab) - productScore(a, activeMainTab))
      .slice(0, 12);
  }, [activeCategory, activeMainTab, activeSubFilter, trendProducts.products]);
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
