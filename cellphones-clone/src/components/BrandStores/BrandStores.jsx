import './BrandStores.css';
import { brandStores } from '../../data/mockData';
import { buildCategoryPath } from '../../utils/linkRoutes';

const getBrandStorePath = (brandName = '') => {
  const name = String(brandName || '').trim();
  const phoneBrands = new Set(['Apple', 'Samsung', 'Xiaomi', 'OPPO']);
  const laptopBrands = new Set(['ASUS', 'Lenovo']);
  const category = laptopBrands.has(name) ? 'Laptop' : phoneBrands.has(name) ? 'Điện thoại' : 'Sản phẩm';

  return buildCategoryPath(category, {
    brand: /apple/i.test(name) ? 'apple' : name,
    keyword: name,
    title: name,
  });
};

export default function BrandStores() {
  return (
    <section className="brand-stores section-gap" id="brand-stores-section">
      <div className="container">
        <div className="brand-stores-wrapper">
          <div className="brand-stores-header">
            <h2 className="brand-stores-title">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              Chuyên trang thương hiệu
            </h2>
          </div>
          <div className="brand-stores-grid">
            {brandStores.map(brand => (
              <a
                key={brand.id}
                href={getBrandStorePath(brand.name)}
                className="brand-store-item"
                style={{ background: brand.color, color: brand.textColor }}
              >
                <div className="brand-store-content">
                  <span className="brand-store-name">{brand.name}</span>
                  <span className="brand-store-label">Chuyên trang</span>
                </div>
                <div className="brand-store-badge">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
