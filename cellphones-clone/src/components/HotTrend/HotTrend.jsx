import { useState } from 'react';
import './HotTrend.css';
import { hotTrendCategoryFilters, hotTrendSubFilters, hotTrendProducts } from '../../data/mockData';
import ProductCard from '../ProductCard/ProductCard';

export default function HotTrend() {
  const [activeCategory, setActiveCategory] = useState('phu-kien');
  const [activeSubFilter, setActiveSubFilter] = useState('all');

  return (
    <section className="hot-trend section-gap" id="hot-trend-section">
      <div className="container">
        <div className="hot-trend-wrapper">
          {/* Top Banner & Tabs */}
          <div className="hot-trend-header">
            <div className="hot-trend-title-banner">
              <img src="https://dashboard.cellphones.com.vn/storage/deal-soc-moi-ngay-cate-home.gif" alt="Deal sốc mỗi ngày" className="hot-trend-gif" />
            </div>
            
            <div className="hot-trend-tabs-wrapper">
              <div className="hot-trend-tabs">
                <button className="hot-trend-tab-btn active">
                  SẢN PHẨM HOT TREND
                </button>
                <button className="hot-trend-tab-btn">
                  HÀNG MỚI VỀ
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
                  >
                    {filter.icon && <span className="ht-sub-filter-icon">{filter.icon}</span>}
                    {filter.name}
                  </button>
                ))}
              </div>
              <button className="ht-sub-filter-next">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>

            {/* Products */}
            <div className="hot-trend-products">
              {hotTrendProducts.map((product) => (
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
