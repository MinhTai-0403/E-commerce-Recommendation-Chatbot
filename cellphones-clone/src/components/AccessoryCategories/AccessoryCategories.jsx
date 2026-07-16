import './AccessoryCategories.css';
import { accessoryCategories } from '../../data/mockData';
import { buildCategoryPath } from '../../utils/linkRoutes';

const accessoryCategoryRouteById = {
  'apple-accessories': { category: 'Phụ kiện', segment: 'apple-accessories' },
  'cables-chargers': { category: 'Phụ kiện', segment: 'cables-chargers' },
  'power-banks': { category: 'Phụ kiện', segment: 'power-banks' },
  cases: { category: 'Phụ kiện', segment: 'cases' },
  'screen-protectors': { category: 'Phụ kiện', segment: 'screen-protectors' },
  'memory-usb': { category: 'Phụ kiện', segment: 'memory-usb' },
  'gaming-gear': { category: 'Gaming Gear', segment: 'gaming-gear' },
  sim: { category: 'Sim 4G', segment: 'sim' },
  network: { category: 'Thiết bị mạng', segment: 'network' },
  camera: { category: 'Camera', segment: 'camera' },
  gimbal: { category: 'Camera', segment: 'gimbal' },
  flycam: { category: 'Camera', segment: 'flycam' },
  cameras: { category: 'Máy ảnh', segment: 'cameras' },
  'mouse-keyboard': { category: 'Phụ kiện', segment: 'mouse-keyboard' },
  bags: { category: 'Phụ kiện', segment: 'bags' },
  hubs: { category: 'Phụ kiện', segment: 'hubs' },
  'phone-accessories': { category: 'Phụ kiện', segment: 'phone-accessories' },
  'laptop-accessories': { category: 'Phụ kiện', segment: 'laptop-accessories' },
};

const getAccessoryCategoryPath = (category) => {
  const name = category?.name || '';
  const route = accessoryCategoryRouteById[category?.id] || {
    category: 'Phụ kiện',
    segment: category?.id || '',
  };

  return buildCategoryPath(route.category, {
    keyword: name,
    title: name,
    category: route.category,
    segment: route.segment,
  });
};

export default function AccessoryCategories() {
  return (
    <section className="accessory-categories section-gap" aria-labelledby="accessory-categories-title">
      <div className="container">
        <div className="accessory-categories-header">
          <h2 id="accessory-categories-title">Sắm thêm phụ kiện chất lượng</h2>
          <span className="accessory-categories-divider" aria-hidden="true" />
          <a className="accessory-categories-view-all" href={buildCategoryPath('Phụ kiện')}>
            Xem tất cả
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        </div>

        <div className="accessory-categories-shell">
          <div className="accessory-categories-grid">
            {accessoryCategories.map((category) => (
              <a className="accessory-category-item" href={getAccessoryCategoryPath(category)} key={category.id}>
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
