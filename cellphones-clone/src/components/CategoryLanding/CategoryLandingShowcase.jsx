import { useEffect, useMemo, useState } from 'react';
import { useApiProducts } from '../../hooks/useApiProducts';
import ProductCard, { ProductCardSkeleton } from '../ProductCard/ProductCard';
import '../CategoryShowcase/CategoryShowcase.css';
import './CategoryLandingShowcase.css';

const wrapBannerIndex = (value, length) => {
  if (!length) return 0;
  return ((value % length) + length) % length;
};

function CatalogPromoPanel({ promoPanel, fallbackPath }) {
  if (!promoPanel) return null;

  return (
    <a
      href={promoPanel.href || fallbackPath}
      className={`catalog-promo-panel ${promoPanel.tone || 'red'} ${promoPanel.image ? 'has-image' : ''}`}
    >
      {promoPanel.image ? (
        <picture>
          {promoPanel.mobileImage && (
            <source media="(max-width: 640px)" srcSet={promoPanel.mobileImage} />
          )}
          <img src={promoPanel.image} alt={promoPanel.title} loading="lazy" />
        </picture>
      ) : (
        <>
          <strong>{promoPanel.title}</strong>
          <span>{promoPanel.subtitle}</span>
        </>
      )}
    </a>
  );
}

export default function CategoryLandingShowcase({ profile }) {
  const banners = useMemo(() => profile?.banners || [], [profile]);
  const quickLinks = profile?.quickLinks || [];
  const brandLinks = profile?.brandLinks || [];
  const featureSection = profile?.featureSection;
  const topNavigation = profile?.topNavigation || [];
  const promoPanel = profile?.promoPanel;
  const [activeBanner, setActiveBanner] = useState(0);
  const pairCount = Math.max(1, Math.ceil(banners.length / 2));
  const activePair = Math.floor(activeBanner / 2);
  const visibleBanners = banners.length > 1
    ? [
      banners[wrapBannerIndex(activeBanner, banners.length)],
      banners[wrapBannerIndex(activeBanner + 1, banners.length)],
    ]
    : banners;
  const featuredQuery = useMemo(() => (
    profile?.featuredTitle
      ? {
        category: profile.category,
        ...(profile.queryPreset || {}),
        sort: 'hot_deal',
        displayLimit: 5,
        fetchLimit: 30,
      }
      : null
  ), [profile]);
  const {
    products: featuredProducts,
    loading: featuredLoading,
  } = useApiProducts(featuredQuery, []);

  useEffect(() => {
    if (banners.length <= 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveBanner((current) => wrapBannerIndex(current + 2, banners.length));
    }, 7000);
    return () => window.clearInterval(timer);
  }, [banners]);

  if (!profile) return null;

  return (
    <section
      className="category-landing-showcase"
      aria-label={`Khám phá ${profile.title}`}
      data-category-landing={profile.id}
    >
      {topNavigation.length > 0 && (
        <nav className="catalog-cross-navigation" aria-label="Danh mục máy tính và văn phòng">
          {topNavigation.map((item) => {
            const activePath = profile.isRoot ? profile.path : profile.parentPath;
            const isActive = activePath === item.href;
            return (
              <a
                href={item.href}
                className={isActive ? 'active' : ''}
                aria-current={isActive ? 'page' : undefined}
                key={item.href}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      )}

      {banners.length > 0 && (
        <div className={`category-showcase-banners ${banners.length === 1 ? 'single' : ''}`}>
          {visibleBanners.map((item, index) => (
            <a
              href={item.href}
              key={`${item.image}-${index}`}
              className="category-showcase-banner"
              data-fallback-label={item.alt}
            >
              <span className="category-banner-fallback" aria-hidden="true">{item.alt}</span>
              <img
                src={item.image}
                alt={item.alt}
                width="595"
                height="100"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                  event.currentTarget.closest('a')?.classList.add('image-error');
                }}
              />
            </a>
          ))}

          {banners.length > 2 && (
            <>
              <button
                type="button"
                className="category-showcase-arrow previous"
                aria-label="Banner danh mục trước"
                onClick={() => setActiveBanner((current) => wrapBannerIndex(current - 2, banners.length))}
              >
                ‹
              </button>
              <button
                type="button"
                className="category-showcase-arrow next"
                aria-label="Banner danh mục tiếp theo"
                onClick={() => setActiveBanner((current) => wrapBannerIndex(current + 2, banners.length))}
              >
                ›
              </button>
              <div className="category-showcase-dots" aria-label="Chọn nhóm banner">
                {Array.from({ length: pairCount }).map((_, index) => (
                  <button
                    type="button"
                    key={index}
                    aria-label={`Nhóm banner ${index + 1}`}
                    aria-pressed={activePair === index}
                    onClick={() => setActiveBanner(index * 2)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <h1>{profile.title}</h1>

      {brandLinks.length > 0 && (
        <nav
          className={`catalog-brand-links ${brandLinks.some((item) => item.image) ? 'has-logos' : 'text-only'}`}
          aria-label={`Thương hiệu ${profile.title}`}
        >
          {brandLinks.map((item) => (
            <a
              href={item.href}
              className={profile.activeQuickLinkPath === item.href ? 'active' : ''}
              aria-current={profile.activeQuickLinkPath === item.href ? 'page' : undefined}
              key={`${item.href}-${item.label}`}
            >
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.label}
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                    event.currentTarget.nextElementSibling?.classList.add('visible');
                  }}
                />
              ) : null}
              <span className={item.image ? 'brand-text-fallback' : ''}>{item.label}</span>
            </a>
          ))}
        </nav>
      )}

      {quickLinks.length > 0 && (
        <nav className="category-series-nav" aria-label={`Dòng sản phẩm ${profile.title}`}>
          {quickLinks.map((item) => (
            <a
              href={item.href}
              className={profile.activeQuickLinkPath === item.href ? 'active' : ''}
              aria-current={profile.activeQuickLinkPath === item.href ? 'page' : undefined}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}

      {promoPanel?.position !== 'after-features' && (
        <CatalogPromoPanel promoPanel={promoPanel} fallbackPath={profile.path} />
      )}

      {featureSection?.items?.length > 0 && (
        <section
          className={`catalog-feature-section ${featureSection.variant || ''}`}
          aria-labelledby={`${profile.id}-feature-title`}
        >
          <h2 id={`${profile.id}-feature-title`}>{featureSection.title}</h2>
          {featureSection.tabs?.length > 0 && (
            <div className="catalog-feature-tabs" aria-label={`${featureSection.title} nổi bật`}>
              {featureSection.tabs.map((tab, index) => (
                <span className={index === 0 ? 'active' : ''} key={tab}>{tab}</span>
              ))}
            </div>
          )}
          <div className="catalog-feature-list">
            {featureSection.items.map((item) => (
              <a href={item.href} key={`${item.href}-${item.label}`}>
                {item.image ? (
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                      event.currentTarget.nextElementSibling?.classList.add('visible');
                    }}
                  />
                ) : (
                  <span className="catalog-feature-icon" aria-hidden="true">{item.icon || '◉'}</span>
                )}
                {item.image && (
                  <span className="catalog-feature-icon image-fallback" aria-hidden="true">
                    {item.icon || '◉'}
                  </span>
                )}
                <strong>{item.label}</strong>
              </a>
            ))}
          </div>
        </section>
      )}

      {promoPanel?.position === 'after-features' && (
        <CatalogPromoPanel promoPanel={promoPanel} fallbackPath={profile.path} />
      )}

      {profile.featuredTitle && (featuredLoading || featuredProducts.length > 0) && (
        <section className="catalog-featured-products" aria-labelledby={`${profile.id}-featured-title`}>
          <div className="catalog-featured-heading">
            <h2 id={`${profile.id}-featured-title`}>{profile.featuredTitle}</h2>
            <span>Giá tốt · Trả góp 0%</span>
          </div>
          <div className="catalog-featured-grid" aria-busy={featuredLoading}>
            {featuredLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <ProductCardSkeleton key={`${profile.id}-featured-${index}`} />
              ))
            ) : (
              featuredProducts.map((product) => (
                <ProductCard product={product} key={product.id || product.slug || product.name} />
              ))
            )}
          </div>
        </section>
      )}
    </section>
  );
}
