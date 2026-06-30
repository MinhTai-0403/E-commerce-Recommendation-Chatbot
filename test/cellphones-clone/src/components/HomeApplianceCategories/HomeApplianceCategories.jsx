import './HomeApplianceCategories.css';
import { homeApplianceBrands, homeApplianceShowcases } from '../../data/mockData';

function AppliancePanel({ panel }) {
  return (
    <article className="home-appliance-panel">
      <a className="home-appliance-banner" href="#">
        <img src={panel.banner} alt={panel.bannerAlt} width="594" height="95" loading="lazy" />
      </a>
      <div className="home-appliance-category-grid">
        {panel.categories.map((category) => (
          <a
            className={`home-appliance-category ${category.viewAll ? 'is-view-all' : ''}`}
            href="#"
            key={category.id}
          >
            <img src={category.image} alt={category.name} width={category.viewAll ? 34 : 72} height={category.viewAll ? 34 : 72} loading="lazy" />
            <span>{category.name}</span>
          </a>
        ))}
      </div>
    </article>
  );
}

export default function HomeApplianceCategories() {
  return (
    <section className="home-appliance-categories section-gap" aria-labelledby="home-appliance-title">
      <div className="container">
        <div className="home-appliance-header">
          <h2 id="home-appliance-title">Đồ gia dụng</h2>
          <span className="home-appliance-divider" aria-hidden="true" />
          <div className="home-appliance-brands" aria-label="Thương hiệu đồ gia dụng">
            {homeApplianceBrands.map((brand) => (
              <a href="#" key={brand}>{brand}</a>
            ))}
          </div>
          <a className="home-appliance-view-all" href="#">
            Xem tất cả
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        </div>

        <div className="home-appliance-panels">
          {homeApplianceShowcases.map((panel) => (
            <AppliancePanel panel={panel} key={panel.id} />
          ))}
        </div>
      </div>
    </section>
  );
}
