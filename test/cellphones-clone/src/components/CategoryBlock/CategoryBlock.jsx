import { useState } from 'react';
import './CategoryBlock.css';
import ProductCard from '../ProductCard/ProductCard';

export default function CategoryBlock({ 
  title, 
  tabs, 
  filters, 
  subCategories, // for image-based category pills
  products, 
  campaignBanner 
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [activeFilter, setActiveFilter] = useState('all');
  const productItems = Array.isArray(products) ? products : [];
  const visibleProducts = productItems.filter((product) => {
    const productBrand = product.brandKey || product.brand;
    const productBrandName = String(product.brandName || product.brand || '').toLowerCase();
    const filterKey = String(activeFilter).toLowerCase();

    return (
      activeFilter === 'all' ||
      !productBrand ||
      productBrand === activeFilter ||
      productBrandName.includes(filterKey)
    );
  });

  return (
    <section className={`category-block section-gap ${campaignBanner ? 'has-campaign' : ''}`}>
      <div className="container">
        <div className="category-block-header">
          <div className="cb-title-tabs">
            <h2 className={`cb-title ${tabs && tabs.length > 1 ? 'visually-hidden' : ''}`}>{title}</h2>
            {tabs && tabs.length > 1 && (
              <div className="cb-tabs">
                {tabs.map((tab, idx) => (
                  <button 
                    key={idx}
                    className={`cb-tab-btn ${activeTab === idx ? 'active' : ''}`}
                    onClick={() => setActiveTab(idx)}
                    aria-pressed={activeTab === idx}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}
          </div>
          <a href="#" className="cb-view-all">
            Xem tất cả
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </a>
        </div>

        <div className="cb-content">
          {/* Campaign Banner (Left) */}
          {campaignBanner && (
            <div className="cb-campaign">
              <a href="#">
                <img src={campaignBanner} alt="Campaign" className="cb-campaign-img" />
              </a>
            </div>
          )}

          {/* Right Side Content (SubCats, Filters, Products) */}
          <div className="cb-right-content">
            {/* Sub Categories with Images */}
            {subCategories && (
              <div className="cb-subcats">
                {subCategories.map((subcat) => (
                  <a key={subcat.id} href="#" className="cb-subcat-item">
                    <img src={subcat.image} alt={subcat.name} className="cb-subcat-img" />
                    <span className="cb-subcat-name">{subcat.name}</span>
                  </a>
                ))}
              </div>
            )}

            {/* Text Filters */}
            {filters && (
              <div className="cb-filters">
                {filters.map((filter, idx) => (
                  <button
                    key={filter.id || idx}
                    className={`cb-filter-btn ${activeFilter === (filter.id || idx) ? 'active' : ''}`}
                    onClick={() => setActiveFilter(filter.id || idx)}
                    aria-pressed={activeFilter === (filter.id || idx)}
                  >
                    {filter.name || filter}
                  </button>
                ))}
              </div>
            )}

            {/* Product Grid/List */}
            <div className="cb-products">
              {visibleProducts.map((product) => (
                <div key={product.id} className="cb-product-wrapper">
                  <ProductCard product={product} />
                </div>
              ))}
              <a href="#" className="cb-view-all-card">
                <div className="cb-view-all-circle">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
                <span>Xem tất cả</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
