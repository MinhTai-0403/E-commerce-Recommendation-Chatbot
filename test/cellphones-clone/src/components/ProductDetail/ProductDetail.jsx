import { useState } from 'react';
import './ProductDetail.css';
import { formatPrice } from '../../data/mockData';
import { getProductId, getProductPath } from '../../data/productCatalog';

function Price({ value, className }) {
  if (typeof value !== 'number') return <span className={className}>Liên hệ</span>;
  return <span className={className}>{formatPrice(value)}</span>;
}

function RatingStars({ rating = 0 }) {
  return (
    <span className="pdp-rating-stars" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <svg key={index} width="14" height="14" viewBox="0 0 24 24" fill={index < Math.round(rating) ? '#f59e0b' : '#e5e7eb'}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

function SpecValue({ value }) {
  if (Array.isArray(value)) {
    return (
      <ul className="pdp-spec-list">
        {value.map((item) => <li key={item}>{item}</li>)}
      </ul>
    );
  }

  return <span>{value}</span>;
}

function RelatedProductCard({ product }) {
  return (
    <a className="pdp-related-product" href={getProductPath(product)} data-product-id={getProductId(product)}>
      {product.discount > 0 && <span className="pdp-related-badge">Giảm {product.discount}%</span>}
      {product.installment && <span className="pdp-related-installment">Trả góp 0%</span>}
      <div className="pdp-related-image-wrap">
        <img src={product.image} alt={product.name} loading="lazy" />
      </div>
      <h3>{product.name}</h3>
      <div className="pdp-related-price-row">
        <Price value={product.currentPrice} className="pdp-related-current-price" />
        {product.originalPrice > product.currentPrice && (
          <Price value={product.originalPrice} className="pdp-related-original-price" />
        )}
      </div>
      <div className="pdp-related-meta">
        <RatingStars rating={product.rating} />
        <span>({product.ratingCount || 0})</span>
      </div>
    </a>
  );
}

function ArticleSection({ section }) {
  return (
    <section className="pdp-article-section" id={`article-${section.id}`}>
      <h3>{section.heading}</h3>
      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}

      {section.list?.length > 0 && (
        <ul className="pdp-article-list">
          {section.list.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}

      {section.table && (
        <div className="pdp-article-table-wrap">
          <table className="pdp-article-table">
            <thead>
              <tr>
                {section.table.headers.map((header) => <th key={header}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row, rowIndex) => (
                <tr key={`${section.id}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => <td key={`${section.id}-cell-${rowIndex}-${cellIndex}`}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section.image && (
        <img className="pdp-article-image" src={section.image} alt={section.imageAlt || section.heading} loading="lazy" />
      )}
    </section>
  );
}

function OfferListCard({ title, items = [], className = '' }) {
  if (!items.length) return null;

  return (
    <section className={`pdp-offer-card ${className}`}>
      <h2>{title}</h2>
      <div className="pdp-offer-list">
        {items.map((item, index) => (
          <div className="pdp-offer-item" key={item.id || item.title}>
            <span className="pdp-offer-icon">{index + 1}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NewsListCard({ news = [] }) {
  if (!news.length) return null;

  return (
    <section className="pdp-news-card">
      <h2>Tin tức về sản phẩm</h2>
      <div className="pdp-news-list">
        {news.map((item) => (
          <a href={item.href || '#'} key={item.id} className="pdp-news-item">
            <span>{item.title}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        ))}
      </div>
    </section>
  );
}

function ReviewSummaryCard({ summary, productName }) {
  if (!summary) return null;

  const total = Number(summary.total || 0);

  return (
    <section className="pdp-review-card" id="pdp-reviews">
      <h2>Đánh giá &amp; nhận xét {productName}</h2>
      <div className="pdp-review-overview">
        <div className="pdp-review-score">
          <strong>{summary.rating?.toFixed ? summary.rating.toFixed(1) : summary.rating || 5}</strong>
          <RatingStars rating={summary.rating || 5} />
          <span>{total} đánh giá</span>
        </div>
        <div className="pdp-review-bars">
          {summary.distribution?.map((row) => {
            const percent = total ? Math.round((row.count / total) * 100) : 0;
            return (
              <div className="pdp-review-bar-row" key={row.stars}>
                <span>{row.stars} sao</span>
                <div><i style={{ width: `${percent}%` }} /></div>
                <span>{row.count}</span>
              </div>
            );
          })}
        </div>
      </div>
      <button type="button" className="pdp-review-action">Đánh giá ngay</button>
      {summary.samples?.length > 0 && (
        <div className="pdp-review-samples">
          {summary.samples.map((item) => (
            <article key={item.id} className="pdp-review-sample">
              <div>
                <strong>{item.author}</strong>
                <RatingStars rating={item.rating || 5} />
              </div>
              <p>{item.content}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ProductDetail({ product }) {
  const mediaItems = product.media?.length
    ? product.media
    : [{ id: 'main', type: 'image', src: product.image || product.thumbnail, alt: product.name, label: 'Ảnh chính' }];
  const [activeMediaId, setActiveMediaId] = useState(mediaItems[0]?.id);
  const activeMedia = mediaItems.find((item) => item.id === activeMediaId) || mediaItems[0];
  const productId = getProductId(product);
  const saving = typeof product.originalPrice === 'number' && typeof product.currentPrice === 'number'
    ? product.originalPrice - product.currentPrice
    : 0;

  return (
    <article className="product-detail-page" data-product-id={productId} data-product-sku={product.sku} data-product-slug={product.slug}>
      <div className="container">
        <nav className="pdp-breadcrumb" aria-label="Breadcrumb">
          {product.categoryTrail?.map((item, index) => (
            <span className="pdp-breadcrumb-node" key={item.id}>
              {index > 0 && <span className="pdp-breadcrumb-separator">/</span>}
              <a href={item.href}>{item.name}</a>
            </span>
          ))}
          <span className="pdp-breadcrumb-separator">/</span>
          <span className="pdp-breadcrumb-current">{product.name}</span>
        </nav>

        <section className="pdp-title-card">
          <div>
            <h1>{product.name}</h1>
            <div className="pdp-title-meta">
              <span className="pdp-rating-pill">
                <RatingStars rating={product.rating} />
                <strong>{product.rating || '5.0'}</strong>
                <span>({product.ratingCount || 0} đánh giá)</span>
              </span>
              <a href="#pdp-qa">Hỏi đáp</a>
              <a href="#pdp-specifications">Thông số</a>
              <a href="#pdp-article">So sánh</a>
            </div>
          </div>
          <button type="button" className="pdp-favorite-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
            </svg>
            Yêu thích
          </button>
        </section>

        <div className="pdp-top-layout">
          <div className="pdp-main-column">
            <div className="pdp-primary-row">
          <section className="pdp-gallery-card">
            <div className="pdp-main-media">
              {activeMedia?.type === 'video' ? (
                <div className="pdp-video-preview">
                  <img src={activeMedia.thumbnail} alt={activeMedia.alt || product.name} />
                  <span className="pdp-play-button" aria-hidden="true">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </div>
              ) : (
                <img src={activeMedia?.src || product.thumbnail} alt={activeMedia?.alt || product.name} />
              )}
            </div>

            <div className="pdp-thumb-row" aria-label="Ảnh sản phẩm">
              {mediaItems.map((item) => (
                <button
                  className={`pdp-thumb ${item.id === activeMedia?.id ? 'active' : ''}`}
                  key={item.id}
                  type="button"
                  onClick={() => setActiveMediaId(item.id)}
                  aria-pressed={item.id === activeMedia?.id}
                >
                  <img src={item.thumbnail || item.src} alt={item.label || item.alt || product.name} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div className="pdp-highlight-box">
              <h2>Tính năng nổi bật</h2>
              <ul>
                {product.highlights?.map((highlight) => <li key={highlight}>{highlight}</li>)}
              </ul>
            </div>
          </section>

          <section className="pdp-buy-card">
            <div className="pdp-location-line">
              Xem giá tại <strong>{product.city || 'Hồ Chí Minh'}</strong>
            </div>

            <div className="pdp-price-row">
              <Price value={product.currentPrice} className="pdp-current-price" />
              {product.originalPrice > product.currentPrice && (
                <Price value={product.originalPrice} className="pdp-original-price" />
              )}
            </div>
            {saving > 0 && <p className="pdp-saving">Tiết kiệm {formatPrice(saving)} so với giá niêm yết</p>}

            {product.priceBenefits?.length > 0 && (
              <div className="pdp-member-benefits">
                {product.priceBenefits.map((item) => (
                  <div className="pdp-member-benefit" key={item.id}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            )}

            {product.stockNote && (
              <div className="pdp-stock-note">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>{product.stockNote}</span>
              </div>
            )}

            {product.shortNotice && (
              <div className="pdp-short-notice">{product.shortNotice}</div>
            )}

            {product.variants?.length > 0 && (
              <div className="pdp-option-group">
                <h2>Phiên bản</h2>
                <div className="pdp-option-grid">
                  {product.variants.map((variant) => (
                    <a
                      className={`pdp-option ${variant.active ? 'active' : ''}`}
                      href={variant.active ? getProductPath(product) : `/${variant.slug}.html`}
                      key={variant.id}
                    >
                      <span>{variant.name}</span>
                      <Price value={variant.price} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {product.colors?.length > 0 && (
              <div className="pdp-option-group">
                <h2>Màu sắc</h2>
                <div className="pdp-color-grid">
                  {product.colors.map((color) => (
                    <button className={`pdp-color-option ${color.active ? 'active' : ''}`} key={color.id} type="button">
                      <img src={color.image} alt={color.name} />
                      <span>{color.name}</span>
                      <Price value={color.price} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pdp-promo-card">
              <h2>Khuyến mãi</h2>
              {product.promotions?.map((promotion, index) => (
                <div className="pdp-promo-item" key={promotion.id}>
                  <span>{index + 1}</span>
                  <p><strong>{promotion.title}:</strong> {promotion.description}</p>
                </div>
              ))}
            </div>

            <OfferListCard
              title="Đặc quyền khi mua sản phẩm tại CellphoneS"
              items={product.privileges}
              className="pdp-privilege-card"
            />

            <div className="pdp-action-stack">
              <button type="button" className="pdp-primary-action">
                {product.statusLabel === 'Đặt trước' ? 'ĐẶT TRƯỚC NGAY' : 'MUA NGAY'}
                <span>Thanh toán online hoặc nhận tại cửa hàng</span>
              </button>
              <button type="button" className="pdp-secondary-action">Thêm vào giỏ hàng</button>
            </div>
          </section>
            </div>

          {product.relatedProducts?.length > 0 && (
            <section className="pdp-related-card" aria-labelledby="pdp-related-heading">
              <div className="pdp-related-heading">
                <h2 id="pdp-related-heading">Sản phẩm tương tự</h2>
                <a href="#similar-products">Xem tất cả</a>
              </div>
              <div className="pdp-related-grid">
                {product.relatedProducts.map((item) => (
                  <RelatedProductCard product={item} key={item.id} />
                ))}
              </div>
            </section>
          )}
          </div>

          <aside className="pdp-side-column">
            <section className="pdp-policy-card">
              <h2>Yên tâm mua hàng</h2>
              {product.policies?.map((policy) => (
                <div className="pdp-policy-item" key={policy.id}>
                  <span className="pdp-policy-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <div>
                    <strong>{policy.title}</strong>
                    <p>{policy.description}</p>
                  </div>
                </div>
              ))}
            </section>

            <OfferListCard
              title="Ưu đãi thanh toán"
              items={product.paymentOffers}
              className="pdp-payment-card"
            />

            <section className="pdp-spec-card" id="pdp-specifications">
              <div className="pdp-card-heading">
                <h2>Thông số kỹ thuật</h2>
                <a href="#pdp-spec-full">Xem tất cả</a>
              </div>
              {product.specifications?.map((group) => (
                <div className="pdp-spec-group" key={group.id}>
                  <h3>{group.groupName}</h3>
                  {group.rows.map((row) => (
                    <div className="pdp-spec-row" key={row.id}>
                      <span>{row.label}</span>
                      <SpecValue value={row.value} />
                    </div>
                  ))}
                </div>
              ))}
            </section>

            <NewsListCard news={product.news} />
          </aside>
        </div>

        <div className="pdp-lower-layout">
          <section className="pdp-article-card" id="pdp-article">
            <h2>{product.articleTitle || 'Đặc điểm nổi bật'}</h2>
            {product.articleSections?.map((section) => (
              <ArticleSection key={section.id} section={section} />
            ))}
          </section>

          <aside className="pdp-lower-side">
            <ReviewSummaryCard summary={product.reviewSummary} productName={product.name} />

            <section className="pdp-qa-card" id="pdp-qa">
            <h2>Hỏi và đáp</h2>
            <div className="pdp-question-box">
              <img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:160:0/q:90/plain/https://cellphones.com.vn/media/wysiwyg/ant-hello-2025.png" alt="CellphoneS hỗ trợ" />
              <p>Xin mời để lại câu hỏi, CellphoneS sẽ trả lời trong 1h.</p>
              <button type="button">Gửi câu hỏi</button>
            </div>
            {product.faqs?.map((faq) => (
              <details className="pdp-faq-item" key={faq.id}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
            </section>
          </aside>
        </div>
      </div>
    </article>
  );
}
