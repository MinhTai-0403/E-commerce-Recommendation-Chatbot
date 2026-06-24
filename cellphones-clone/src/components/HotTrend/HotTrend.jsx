import { useState } from 'react';
import './HotTrend.css';
import { hotTrendCategoryFilters, hotTrendSubFilters, hotTrendProducts } from '../../data/mockData';
import ProductCard from '../ProductCard/ProductCard';

export default function HotTrend({ products = hotTrendProducts }) {
  const [activeMainTab, setActiveMainTab] = useState('deal');
  const [activeCategory, setActiveCategory] = useState('phu-kien');
  const [activeSubFilter, setActiveSubFilter] = useState('all');

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
                  onClick={() => setActiveCategory(filter.id)}
                  aria-pressed={activeCategory === filter.id}
                >
                  {filter.name}
                </button>
              ))}
            </div>

            {/* Sub Filters (Icons) */}
            <div className="hot-trend-sub-filters-container">
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
              <button className="ht-sub-filter-next" aria-label="Xem thêm bộ lọc">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>

            {/* Products */}
            <div className="hot-trend-products">
              {products.map((product) => (
                <div key={product.id} className="ht-product-wrapper">
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
