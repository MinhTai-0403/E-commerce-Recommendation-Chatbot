import './PromoBanners.css';
import { getRouteForLabel } from '../../utils/linkRoutes';

export default function PromoBanners() {
  const promos = [
    { id: 1, title: 'Ưu đãi thanh toán', desc: 'Giảm đến 1 triệu khi thanh toán qua VNPay, MoMo, ZaloPay', bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { id: 2, title: 'Mở thẻ tín dụng', desc: 'Hoàn tiền đến 2 triệu khi mở thẻ tín dụng tại CellphoneS', bgColor: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
    { id: 3, title: 'Trả góp 0% lãi suất', desc: 'Áp dụng cho tất cả sản phẩm, duyệt nhanh 15 phút', bgColor: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  ];

  return (
    <section className="promo-banners section-gap" id="promo-banners-section">
      <div className="container">
        <div className="promo-banners-grid">
          {promos.map(promo => (
            <a key={promo.id} href={getRouteForLabel(promo.title, 'promo')} className="promo-banner-item" style={{ background: promo.bgColor }}>
              <div className="promo-banner-content">
                <h3 className="promo-banner-title">{promo.title}</h3>
                <p className="promo-banner-desc">{promo.desc}</p>
              </div>
              <div className="promo-banner-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                  <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
