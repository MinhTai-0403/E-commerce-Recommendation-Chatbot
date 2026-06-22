import './AccessoryCategories.css';
import { accessoryCategories } from '../../data/mockData';

export default function AccessoryCategories() {
  return (
    <section className="accessory-categories section-gap" aria-labelledby="accessory-categories-title">
      <div className="container">
        <div className="accessory-categories-header">
          <h2 id="accessory-categories-title">Sắm thêm phụ kiện chất lượng</h2>
          <span className="accessory-categories-divider" aria-hidden="true" />
          <a className="accessory-categories-view-all" href="#">
            Xem tất cả
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        </div>

        <div className="accessory-categories-shell">
          <div className="accessory-categories-grid">
            {accessoryCategories.map((category) => (
              <a className="accessory-category-item" href="#" key={category.id}>
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
