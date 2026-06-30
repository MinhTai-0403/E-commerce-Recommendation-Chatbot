import './UsedProducts.css';
import { usedProductCategories } from '../../data/mockData';

export default function UsedProducts() {
  return (
    <section className="used-products section-gap" aria-labelledby="used-products-title">
      <div className="container">
        <div className="used-products-header">
          <h2 id="used-products-title">Hàng cũ</h2>
          <span className="used-products-divider" aria-hidden="true" />
          <a className="used-products-view-all" href="#">
            Xem tất cả
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        </div>

        <div className="used-products-shell">
          <div className="used-products-grid">
            {usedProductCategories.map((category) => (
              <a className="used-product-item" href="#" key={category.id}>
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
