import './CartPage.css';
import { formatPrice } from '../../data/mockData';

function CartSkeleton() {
  return (
    <div className="cart-skeleton-list" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="cart-skeleton-item" key={index}>
          <span className="cart-skeleton-image" />
          <div className="cart-skeleton-lines">
            <span />
            <span />
            <span />
          </div>
        </div>
      ))}
    </div>
  );
}

function CartItem({ item, onUpdateItem, onRemoveItem }) {
  const quantity = Number(item.quantity || 1);
  const currentPrice = Number(item.currentPrice || item.price || 0);
  const originalPrice = Number(item.originalPrice || 0);
  const optionText = [
    item.selectedOptions?.variantName,
    item.selectedOptions?.colorName,
  ].filter(Boolean).join(' · ');

  return (
    <article className="cart-item">
      <a className="cart-item-image" href={item.url || `/${item.slug}.html`}>
        {item.image ? (
          <img src={item.image} alt={item.name} loading="lazy" />
        ) : (
          <span>CellphoneS</span>
        )}
      </a>

      <div className="cart-item-info">
        <a className="cart-item-name" href={item.url || `/${item.slug}.html`}>
          {item.name}
        </a>
        {optionText && <p className="cart-item-options">{optionText}</p>}
        <button type="button" className="cart-remove-btn" onClick={() => onRemoveItem(item.id)}>
          Xoá
        </button>
      </div>

      <div className="cart-item-price">
        <strong>{currentPrice ? formatPrice(currentPrice) : 'Liên hệ'}</strong>
        {originalPrice > currentPrice && <span>{formatPrice(originalPrice)}</span>}
      </div>

      <div className="cart-quantity-control" aria-label={`Số lượng ${item.name}`}>
        <button type="button" onClick={() => onUpdateItem(item.id, quantity - 1)} disabled={quantity <= 1}>
          −
        </button>
        <span>{quantity}</span>
        <button type="button" onClick={() => onUpdateItem(item.id, quantity + 1)}>
          +
        </button>
      </div>

      <div className="cart-item-total">
        {currentPrice ? formatPrice(currentPrice * quantity) : 'Liên hệ'}
      </div>
    </article>
  );
}

export default function CartPage({
  cart,
  loading,
  error,
  currentUser,
  onUpdateItem,
  onRemoveItem,
  onClearCart,
  onGoHome,
  onGoLogin,
  onGoCheckout,
}) {
  const items = cart?.items || [];
  const summary = cart?.summary || {};
  const hasItems = items.length > 0;

  return (
    <section className="cart-page">
      <div className="container cart-container">
        <nav className="cart-breadcrumb" aria-label="Breadcrumb">
          <button type="button" onClick={onGoHome}>Trang chủ</button>
          <span>/</span>
          <strong>Giỏ hàng</strong>
        </nav>

        <div className="cart-title-row">
          <div>
            <h1>Giỏ hàng của bạn</h1>
            <p>
              {hasItems
                ? `${summary.totalQuantity || 0} sản phẩm đang chờ thanh toán`
                : 'Chưa có sản phẩm nào trong giỏ.'}
            </p>
          </div>
          {hasItems && (
            <button type="button" className="cart-clear-btn" onClick={onClearCart}>
              Xoá tất cả
            </button>
          )}
        </div>

        {error && <div className="cart-alert">{error}</div>}

        {!currentUser && (
          <div className="cart-login-note">
            <span>Đăng nhập Smember để đồng bộ giỏ hàng giữa các thiết bị.</span>
            <button type="button" onClick={onGoLogin}>Đăng nhập</button>
          </div>
        )}

        <div className="cart-layout">
          <div className="cart-list-card">
            {loading ? (
              <CartSkeleton />
            ) : hasItems ? (
              items.map((item) => (
                <CartItem
                  item={item}
                  key={item.id}
                  onUpdateItem={onUpdateItem}
                  onRemoveItem={onRemoveItem}
                />
              ))
            ) : (
              <div className="cart-empty-state">
                <img
                  src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/chibi2.png"
                  alt=""
                  loading="lazy"
                />
                <h2>Giỏ hàng đang trống</h2>
                <p>Chọn vài món ngon lành ở trang chủ rồi quay lại đây nhé.</p>
                <button type="button" onClick={onGoHome}>Tiếp tục mua sắm</button>
              </div>
            )}
          </div>

          <aside className="cart-summary-card">
            <h2>Thông tin đơn hàng</h2>
            <div className="cart-summary-row">
              <span>Tạm tính</span>
              <strong>{formatPrice(summary.subtotal || 0)}</strong>
            </div>
            <div className="cart-summary-row">
              <span>Giảm giá</span>
              <strong className="cart-discount">{formatPrice(summary.discount || 0)}</strong>
            </div>
            <div className="cart-summary-row">
              <span>Phí vận chuyển</span>
              <strong>Miễn phí</strong>
            </div>
            <div className="cart-summary-total">
              <span>Tổng tiền</span>
              <strong>{formatPrice(summary.subtotal || 0)}</strong>
            </div>
            <button type="button" className="cart-checkout-btn" disabled={!hasItems} onClick={onGoCheckout}>
              Tiến hành đặt hàng
            </button>
            <button type="button" className="cart-continue-btn" onClick={onGoHome}>
              Chọn thêm sản phẩm
            </button>
          </aside>
        </div>
      </div>
    </section>
  );
}
