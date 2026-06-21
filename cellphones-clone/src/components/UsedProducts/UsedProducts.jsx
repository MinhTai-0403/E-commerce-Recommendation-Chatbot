import './UsedProducts.css';
import { usedProductCategories } from '../../data/mockData';

export default function UsedProducts() {
  return (
    <section className="used-products section-gap" id="used-products-section">
      <div className="container">
        <div className="used-products-wrapper">
          <div className="used-products-header">
            <h2 className="used-products-title">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              Hàng cũ - Giá tốt
            </h2>
            <p className="used-products-subtitle">Sản phẩm qua sử dụng, chất lượng đảm bảo, bảo hành như mới</p>
          </div>
          <div className="used-products-grid">
            {usedProductCategories.map(cat => (
              <a key={cat.id} href="#" className="used-product-item">
                <div className="used-product-icon">{cat.icon}</div>
                <div className="used-product-info">
                  <span className="used-product-name">{cat.name}</span>
                  <span className="used-product-discount">{cat.discount}</span>
                </div>
                <svg className="used-product-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
