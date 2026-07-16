import './ProductCard.css';
import { formatPrice } from '../../data/mockData';
import { getProductDomId, getProductId, getProductPath, getProductSlug } from '../../data/productCatalog';
import { CART_ADD_EVENT } from '../../hooks/useCart';

export function ProductCardSkeleton() {
  return (
    <article className="product-card product-card-skeleton" aria-hidden="true">
      <div className="skeleton-badge-row">
        <span className="skeleton-pill skeleton-pill-red" />
        <span className="skeleton-pill" />
      </div>
      <div className="skeleton-image-box" />
      <div className="skeleton-info">
        <span className="skeleton-line skeleton-title-line" />
        <span className="skeleton-line skeleton-title-line short" />
        <span className="skeleton-line skeleton-price-line" />
        <span className="skeleton-line skeleton-tag-line" />
        <span className="skeleton-line skeleton-meta-line" />
      </div>
    </article>
  );
}

export default function ProductCard({ product }) {
  if (!product) return null;

  const productId = getProductId(product);
  const productSlug = getProductSlug(product);
  const productPath = getProductPath(product);

  const handleQuickAdd = (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent(CART_ADD_EVENT, {
      detail: {
        product: {
          ...product,
          id: productId,
          slug: productSlug,
          url: productPath,
        },
        quantity: 1,
      },
    }));
  };

  return (
    <article
      id={getProductDomId(product)}
      className="product-card"
      data-product-id={productId}
      data-product-slug={productSlug}
      data-product-sku={product.sku || productSlug}
    >
      <a href={productPath} className="product-card-main">
        {product.discount > 0 && (
          <div className="badge-discount">Giảm {product.discount}%</div>
        )}
        {product.installment && (
          <div className="badge-installment">Trả góp 0%</div>
        )}

        <div className="product-image-container">
          <img src={product.image} alt={product.name} className="product-image" loading="lazy" />
        </div>

        <div className="product-info">
          <h3 className="product-name" title={product.name}>{product.name}</h3>

          <div className="product-price">
            <span className="current-price">{formatPrice(product.currentPrice)}</span>
            {product.originalPrice > product.currentPrice && (
              <span className="original-price">{formatPrice(product.originalPrice)}</span>
            )}
          </div>

          <div className="product-tags">
            {product.smember && (
              <div className="tag smember">
                <span className="tag-text">{product.smember}</span>
              </div>
            )}
            {product.sstudent && (
              <div className="tag sstudent">
                <span className="tag-text">{product.sstudent}</span>
              </div>
            )}
            <div className="extra-info">
              Trợ giá lên đời đến 3 triệu
            </div>
          </div>

          <div className="product-footer">
            {product.rating && (
              <div className="product-rating">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill={i < Math.floor(product.rating) ? '#f59e0b' : '#e5e7eb'}>
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                ))}
                {product.ratingCount && <span className="rating-count">({product.ratingCount})</span>}
              </div>
            )}

            <div className="product-delivery">
              <span className="delivery-icon">
                <svg width="14" height="14" viewBox="0 0 17 16" fill="none" aria-hidden="true">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3.833 11.333a1.333 1.333 0 1 0 2.667 0 1.333 1.333 0 0 0-2.667 0ZM10.5 11.333a1.333 1.333 0 1 0 2.667 0 1.333 1.333 0 0 0-2.667 0Z" />
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3.833 11.333H2.5V8.667m-.667-5.334h7.334v8m-2.667 0h4m2.667 0H14.5v-4m0 0H9.167m5.333 0L12.5 4H9.167M2.5 6h2.667" />
                </svg>
              </span>
              <span className="delivery-text">Giao nhanh {product.city || 'toàn quốc'}</span>
            </div>
          </div>
        </div>
      </a>

      <button
        type="button"
        className="product-card-cart-action"
        onClick={handleQuickAdd}
        aria-label={`Thêm ${product.name} vào giỏ hàng`}
      >
        +
      </button>
    </article>
  );
}
