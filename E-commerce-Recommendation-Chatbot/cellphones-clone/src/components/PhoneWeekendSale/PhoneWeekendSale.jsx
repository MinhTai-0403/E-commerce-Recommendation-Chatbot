import { useEffect, useId, useMemo, useRef, useState } from 'react';
import './PhoneWeekendSale.css';
import { phoneProducts } from '../../data/mockData';
import { useApiProducts } from '../../hooks/useApiProducts';
import ProductCard, { ProductCardSkeleton } from '../ProductCard/ProductCard';

const weekendSaleQuery = {
  filter: 'hot-deal',
  sort: 'hot_deal',
  include: 'details',
  inStock: true,
  displayLimit: 24,
  fetchLimit: 96,
};

const EMPTY_PRODUCTS = [];

const productRailSortOptions = [
  { label: 'Phổ biến', sort: 'latest', filter: '' },
  { label: 'Khuyến mãi Hot', sort: 'hot_deal', filter: 'hot-deal' },
  { label: 'Giá Cao - Thấp', sort: 'price_desc', filter: '' },
  { label: 'Giá Thấp - Cao', sort: 'price_asc', filter: '' },
];

const normalizeCategory = (value = '') => (
  String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
);

const getWeekendDeadline = () => {
  const now = new Date();
  const deadline = new Date(now);
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  deadline.setDate(now.getDate() + daysUntilMonday);
  deadline.setHours(0, 0, 0, 0);
  return deadline.getTime();
};

const getRemainingTime = () => {
  const remaining = Math.max(0, getWeekendDeadline() - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
};

const padTime = (value) => String(value).padStart(2, '0');

export default function PhoneWeekendSale({
  brand = '',
  category = 'Điện thoại',
  title = 'HOT SALE CUỐI TUẦN',
  showCountdown = true,
  usage = '',
  special = '',
  q = '',
  filter = 'hot-deal',
  sort = 'hot_deal',
  showSort = false,
}) {
  const railRef = useRef(null);
  const componentId = useId().replace(/:/g, '');
  const titleId = `weekend-sale-title-${componentId}`;
  const [remainingTime, setRemainingTime] = useState(getRemainingTime);
  const [railState, setRailState] = useState({
    canScrollBack: false,
    canScrollForward: false,
  });
  const [activeSort, setActiveSort] = useState({ sort, filter });
  const effectiveSort = showSort ? activeSort.sort : sort;
  const effectiveFilter = showSort ? activeSort.filter : filter;
  const query = useMemo(() => ({
    ...weekendSaleQuery,
    filter: effectiveFilter,
    sort: effectiveSort,
    category,
    ...(brand ? { brand } : {}),
    ...(usage ? { usage } : {}),
    ...(special ? { special } : {}),
    ...(q ? { q } : {}),
  }), [brand, category, effectiveFilter, effectiveSort, q, special, usage]);
  const fallbackProducts = !brand && normalizeCategory(category) === 'dien thoai'
    ? phoneProducts
    : EMPTY_PRODUCTS;
  const { products, loading } = useApiProducts(query, fallbackProducts);
  const visibleProducts = useMemo(() => {
    if (brand || normalizeCategory(category) === 'dien thoai') return products;

    const groups = new Map();
    products.forEach((product) => {
      const brandKey = product.brandKey || product.brand || 'hang-khac';
      const group = groups.get(brandKey) || [];
      group.push(product);
      groups.set(brandKey, group);
    });

    const diversified = [];
    let groupIndex = 0;
    let hasProduct = true;
    while (hasProduct) {
      hasProduct = false;
      groups.forEach((group) => {
        if (group[groupIndex]) {
          diversified.push(group[groupIndex]);
          hasProduct = true;
        }
      });
      groupIndex += 1;
    }

    return diversified;
  }, [brand, category, products]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRemainingTime(getRemainingTime());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const updateRailState = () => {
      const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
      setRailState({
        canScrollBack: rail.scrollLeft > 4,
        canScrollForward: rail.scrollLeft < maxScrollLeft - 4,
      });
    };

    const frameId = window.requestAnimationFrame(updateRailState);
    rail.addEventListener('scroll', updateRailState, { passive: true });
    window.addEventListener('resize', updateRailState);

    return () => {
      window.cancelAnimationFrame(frameId);
      rail.removeEventListener('scroll', updateRailState);
      window.removeEventListener('resize', updateRailState);
    };
  }, [loading, visibleProducts.length]);

  const scrollProducts = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * Math.max(240, rail.clientWidth * 0.84),
      behavior: 'smooth',
    });
  };

  return (
    <section className="phone-weekend-sale" aria-labelledby={titleId}>
      <header className="phone-weekend-sale-head">
        <h2 id={titleId}>
          <span className="phone-weekend-sale-flame" aria-hidden="true">♨</span>
          {title}
        </h2>

        {showCountdown && (
          <div className="phone-weekend-sale-countdown" aria-label="Thời gian còn lại của chương trình">
            <strong>Kết thúc sau:</strong>
            <div className="phone-weekend-sale-time" aria-live="off">
              <span>{padTime(remainingTime.days)}</span>
              <b>:</b>
              <span>{padTime(remainingTime.hours)}</span>
              <b>:</b>
              <span>{padTime(remainingTime.minutes)}</span>
              <b>:</b>
              <span>{padTime(remainingTime.seconds)}</span>
            </div>
          </div>
        )}
      </header>

      {showSort && (
        <div className="phone-weekend-sale-sort" aria-label="Sắp xếp sản phẩm">
          {productRailSortOptions.map((option) => {
            const isActive = activeSort.sort === option.sort && activeSort.filter === option.filter;
            return (
              <button
                type="button"
                className={isActive ? 'active' : ''}
                aria-pressed={isActive}
                onClick={() => setActiveSort({ sort: option.sort, filter: option.filter })}
                key={option.label}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="phone-weekend-sale-rail-wrap">
        {!loading && railState.canScrollBack && (
          <button
            type="button"
            className="phone-weekend-sale-nav phone-weekend-sale-prev"
            aria-label="Xem sản phẩm khuyến mãi trước"
            onClick={() => scrollProducts(-1)}
          >
            ‹
          </button>
        )}

        <div className="phone-weekend-sale-rail" ref={railRef} aria-busy={loading}>
          {loading
            ? Array.from({ length: 6 }).map((_, index) => (
              <div className="phone-weekend-sale-card" key={`weekend-sale-skeleton-${index}`}>
                <ProductCardSkeleton />
              </div>
            ))
            : visibleProducts.length > 0
              ? visibleProducts.map((product) => (
                <div className="phone-weekend-sale-card" key={product.id || product.slug || product.name}>
                  <ProductCard product={product} />
                </div>
              ))
              : (
                <div className="phone-weekend-sale-empty">
                  Chưa có sản phẩm khuyến mãi phù hợp với hãng này.
                </div>
              )}
        </div>

        {!loading && railState.canScrollForward && (
          <button
            type="button"
            className="phone-weekend-sale-nav phone-weekend-sale-next"
            aria-label="Xem thêm sản phẩm khuyến mãi"
            onClick={() => scrollProducts(1)}
          >
            ›
          </button>
        )}
      </div>
    </section>
  );
}
