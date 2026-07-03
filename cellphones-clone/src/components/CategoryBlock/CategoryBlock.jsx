import { useMemo, useState } from 'react';
import './CategoryBlock.css';
import ProductCard, { ProductCardSkeleton } from '../ProductCard/ProductCard';
import { useApiProducts } from '../../hooks/useApiProducts';

const getSkeletonCount = (query, campaignBanner) => {
  const displayLimit = Number(query?.displayLimit || query?.limit || 8);
  const minimumVisible = campaignBanner ? 5 : 6;
  return Math.max(minimumVisible, Math.min(displayLimit, 12));
};

export default function CategoryBlock({ 
  title, 
  tabs, 
  filters, 
  subCategories, // for image-based category pills
  productQuery,
  tabQueries,
  subCategoryTabIndex = 0,
  products, 
  campaignBanner 
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeSubCategory, setActiveSubCategory] = useState('');
  const fallbackProducts = Array.isArray(products) ? products : [];
  const selectedSubCategory = subCategories?.find((subcat) => subcat.id === activeSubCategory);
  const shouldShowSubCategories = Boolean(subCategories?.length) && activeTab === subCategoryTabIndex;
  const effectiveQuery = useMemo(() => {
    if (!productQuery) return null;

    const nextQuery = {
      ...productQuery,
      ...(tabQueries?.[activeTab] || (tabs?.[activeTab] ? { category: tabs[activeTab] } : {})),
      ...(selectedSubCategory?.query || {}),
    };

    if (selectedSubCategory?.segment || selectedSubCategory?.id) {
      nextQuery.segment = selectedSubCategory.segment || selectedSubCategory.id;
    }

    if (activeFilter && activeFilter !== 'all') {
      nextQuery.brand = activeFilter;
    } else {
      delete nextQuery.brand;
    }

    return nextQuery;
  }, [activeFilter, activeTab, productQuery, selectedSubCategory, tabQueries, tabs]);
  const apiState = useApiProducts(effectiveQuery, fallbackProducts);
  const productItems = productQuery ? apiState.products : fallbackProducts;
  const shouldShowProductSkeletons = Boolean(productQuery && apiState.loading);
  const skeletonCount = getSkeletonCount(effectiveQuery || productQuery, campaignBanner);
  const visibleProducts = productQuery ? productItems : productItems.filter((product) => {
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
  const handleTabClick = (idx) => {
    setActiveTab(idx);
    setActiveFilter('all');
    setActiveSubCategory('');
  };
  const handleSubCategoryClick = (subcatId) => {
    setActiveSubCategory((current) => (current === subcatId ? '' : subcatId));
    setActiveFilter('all');
  };

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
                    onClick={() => handleTabClick(idx)}
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
            {shouldShowSubCategories && (
              <div className="cb-subcats">
                {subCategories.map((subcat) => (
                  <button
                    key={subcat.id}
                    type="button"
                    className={`cb-subcat-item ${activeSubCategory === subcat.id ? 'active' : ''}`}
                    onClick={() => handleSubCategoryClick(subcat.id)}
                    aria-pressed={activeSubCategory === subcat.id}
                  >
                    <img src={subcat.image} alt={subcat.name} className="cb-subcat-img" />
                    <span className="cb-subcat-name">{subcat.name}</span>
                  </button>
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
            <div className="cb-products" aria-busy={shouldShowProductSkeletons}>
              {shouldShowProductSkeletons ? (
                Array.from({ length: skeletonCount }).map((_, index) => (
                  <div key={`skeleton-${index}`} className="cb-product-wrapper">
                    <ProductCardSkeleton />
                  </div>
                ))
              ) : (
                <>
                  {visibleProducts.length === 0 && (
                    <div className="cb-loading-card">Chưa có sản phẩm phù hợp</div>
                  )}
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
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
