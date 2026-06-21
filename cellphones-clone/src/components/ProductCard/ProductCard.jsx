import './ProductCard.css';
import { formatPrice } from '../../data/mockData';

export default function ProductCard({ product }) {
  if (!product) return null;

  return (
    <a href="#" className="product-card">
      {/* Badges */}
      {product.discount > 0 && (
        <div className="badge-discount">Giảm {product.discount}%</div>
      )}
      {product.installment && (
        <div className="badge-installment">Trả góp 0%</div>
      )}

      {/* Image */}
      <div className="product-image-container">
        <img src={product.image} alt={product.name} className="product-image" />
      </div>

      {/* Content */}
      <div className="product-info">
        <h3 className="product-name" title={product.name}>{product.name}</h3>
        
        <div className="product-price">
          <span className="current-price">{formatPrice(product.currentPrice)}</span>
          {product.originalPrice > product.currentPrice && (
            <span className="original-price">{formatPrice(product.originalPrice)}</span>
          )}
        </div>

        {/* Tags */}
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

        {/* Footer info: Rating and Delivery */}
        <div className="product-footer">
          {product.rating && (
            <div className="product-rating">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill={i < Math.floor(product.rating) ? "#f59e0b" : "#e5e7eb"}>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              ))}
            </div>
          )}
          
          <div className="product-delivery">
            <span className="delivery-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="3" width="15" height="13"/>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                <circle cx="5.5" cy="18.5" r="2.5"/>
                <circle cx="18.5" cy="18.5" r="2.5"/>
              </svg>
            </span>
            <span className="delivery-text">Giao nhanh {product.city || 'toàn quốc'}</span>
          </div>
        </div>
      </div>
    </a>
  );
}
