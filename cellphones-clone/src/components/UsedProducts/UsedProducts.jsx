import './UsedProducts.css';
import { usedProductCategories } from '../../data/mockData';
import { buildCategoryPath } from '../../utils/linkRoutes';

const usedProductSegmentById = {
  'used-phone': 'used-phone',
  'used-tablet': 'used-tablet',
  'used-macbook': 'used-macbook',
  'used-laptop': 'used-laptop',
  'used-headphones': 'used-headphones',
  'used-speaker': 'used-speaker',
  'used-watch': 'used-watch',
  'used-appliance': 'used-appliance',
  'used-accessories': 'used-accessories',
  'used-monitor': 'used-monitor',
  'used-tv': 'used-tv',
  'used-charger': 'used-charger',
};

const getUsedProductPath = (category) => {
  const name = category?.name || '';
  return buildCategoryPath('Hàng cũ', {
    keyword: name,
    title: name,
    category: 'Hàng cũ',
    segment: usedProductSegmentById[category?.id] || category?.id || '',
  });
};

export default function UsedProducts() {
  return (
    <section className="used-products section-gap" aria-labelledby="used-products-title">
      <div className="container">
        <div className="used-products-header">
          <h2 id="used-products-title">Hàng cũ</h2>
          <span className="used-products-divider" aria-hidden="true" />
          <a className="used-products-view-all" href={buildCategoryPath('Hàng cũ')}>
            Xem tất cả
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        </div>

        <div className="used-products-shell">
          <div className="used-products-grid">
            {usedProductCategories.map((category) => (
              <a className="used-product-item" href={getUsedProductPath(category)} key={category.id}>
                <img src={category.image} alt={category.name} width="72" height="72" loading="lazy" />
                <span>{category.name}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
