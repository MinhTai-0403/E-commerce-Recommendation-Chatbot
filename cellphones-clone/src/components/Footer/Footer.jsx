import { useState } from 'react';
import './Footer.css';
import {
  footerLinks,
  footerMemberSites,
  footerSocials,
  paymentPartners,
} from '../../data/mockData';
import { buildCategoryPath, externalLinks, getRouteForLabel } from '../../utils/linkRoutes';
import { buildApiUrl } from '../../services/apiProducts';

const footerPopularRoutes = {
  'Điện thoại': () => buildCategoryPath('Điện thoại'),
  'Điện thoại iPhone': () => buildCategoryPath('Điện thoại', { brand: 'apple', title: 'Điện thoại iPhone' }),
  Xiaomi: () => buildCategoryPath('Điện thoại', { brand: 'xiaomi', title: 'Xiaomi' }),
  'Điện thoại Samsung Galaxy': () => buildCategoryPath('Điện thoại', { brand: 'samsung', title: 'Điện thoại Samsung Galaxy' }),
  'Điện thoại OPPO': () => buildCategoryPath('Điện thoại', { brand: 'oppo', title: 'Điện thoại OPPO' }),
  Laptop: () => buildCategoryPath('Laptop'),
  'Laptop Acer': () => buildCategoryPath('Laptop', { brand: 'acer', title: 'Laptop Acer' }),
  'Laptop Dell': () => buildCategoryPath('Laptop', { brand: 'dell', title: 'Laptop Dell' }),
  'Laptop HP': () => buildCategoryPath('Laptop', { brand: 'hp', title: 'Laptop HP' }),
  Tivi: () => buildCategoryPath('Tivi'),
  'Tivi Samsung': () => buildCategoryPath('Tivi', { brand: 'samsung', title: 'Tivi Samsung' }),
  'Tivi Sony': () => buildCategoryPath('Tivi', { brand: 'sony', title: 'Tivi Sony' }),
  'Tivi LG': () => buildCategoryPath('Tivi', { brand: 'lg', title: 'Tivi LG' }),
  'Đồ gia dụng': () => buildCategoryPath('Đồ gia dụng'),
  'Máy hút bụi gia đình': () => buildCategoryPath('Đồ gia dụng', { q: 'Máy hút bụi', title: 'Máy hút bụi gia đình' }),
  'Build PC': () => buildCategoryPath('PC', { q: 'Build PC', segment: 'pc-gaming', title: 'Build PC' }),
  Camera: () => buildCategoryPath('Camera', { segment: 'camera' }),
  'iPhone cũ': () => buildCategoryPath('Hàng cũ', { q: 'iPhone', segment: 'used-phone', title: 'iPhone cũ' }),
  'Macbook Neo': () => buildCategoryPath('Laptop', { brand: 'macbook', q: 'Macbook Neo', title: 'Macbook Neo' }),
};

const getFooterPopularRoute = (label) => {
  const explicitRoute = footerPopularRoutes[label];
  if (explicitRoute) return explicitRoute();

  if (/^iPhone\b/i.test(label) || /^OPPO Find/i.test(label) || /^Xiaomi 17T/i.test(label)) {
    const brand = /^OPPO/i.test(label) ? 'oppo' : (/^Xiaomi/i.test(label) ? 'xiaomi' : 'apple');
    return buildCategoryPath('Điện thoại', { brand, q: label, title: label });
  }

  return getRouteForLabel(label, 'category');
};

export default function Footer() {
  const [newsletterForm, setNewsletterForm] = useState({
    email: '',
    phone: '',
    accepted: true,
  });
  const [newsletterStatus, setNewsletterStatus] = useState({
    type: '',
    message: '',
  });
  const [isNewsletterSubmitting, setIsNewsletterSubmitting] = useState(false);

  const updateNewsletterForm = (field, value) => {
    setNewsletterForm((previous) => ({ ...previous, [field]: value }));
    setNewsletterStatus({ type: '', message: '' });
  };

  const handleNewsletterSubmit = async (event) => {
    event.preventDefault();

    setIsNewsletterSubmitting(true);
    setNewsletterStatus({ type: '', message: '' });

    try {
      const response = await fetch(buildApiUrl('/api/newsletter/subscribe'), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newsletterForm),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || payload.error || 'Không thể đăng ký nhận khuyến mãi.');
      }

      setNewsletterStatus({
        type: 'success',
        message: payload.message || 'Đăng ký thành công. Mã giảm giá đã được gửi về email của bạn.',
      });
      setNewsletterForm({ email: '', phone: '', accepted: true });
    } catch (error) {
      setNewsletterStatus({
        type: 'error',
        message: error.message || 'Không thể đăng ký nhận khuyến mãi.',
      });
    } finally {
      setIsNewsletterSubmitting(false);
    }
  };

  return (
    <footer className="footer" id="footer">
      <div className="footer-primary">
        <div className="container footer-primary-grid">
          <div className="footer-column footer-support-column">
            <section>
              <h2 className="footer-heading">Tổng đài hỗ trợ miễn phí</h2>
              <p>Mua hàng - bảo hành <a className="footer-hotline" href="tel:18002097">1800.2097</a> (7h30 - 22h00)</p>
              <p>Khiếu nại <a className="footer-hotline" href="tel:18002063">1800.2063</a> (8h00 - 21h30)</p>
            </section>

            <section>
              <h2 className="footer-heading">Phương thức thanh toán</h2>
              <div className="footer-payments">
                {paymentPartners.map((partner) => (
                  <a href={getRouteForLabel(partner.name, 'payment')} aria-label={partner.name} key={partner.id}>
                    <img src={partner.image} alt={partner.name} width="46" height="30" loading="lazy" />
                  </a>
                ))}
              </div>
            </section>

            <form className="footer-newsletter" onSubmit={handleNewsletterSubmit}>
              <h2 className="footer-heading footer-newsletter-heading">Đăng ký nhận tin khuyến mãi</h2>
              <div className="footer-voucher">
                <strong>Nhận ngay voucher 10%</strong>
                <span>Mã khuyenmai10 sẽ được gửi về email sau khi đăng ký thành công</span>
              </div>
              <label htmlFor="footer-email">Email</label>
              <input
                id="footer-email"
                type="email"
                placeholder="Nhập email của bạn"
                value={newsletterForm.email}
                onChange={(event) => updateNewsletterForm('email', event.target.value)}
                required
              />
              <label htmlFor="footer-phone">Số điện thoại</label>
              <input
                id="footer-phone"
                type="tel"
                placeholder="Nhập số điện thoại của bạn"
                value={newsletterForm.phone}
                onChange={(event) => updateNewsletterForm('phone', event.target.value)}
                maxLength={10}
              />
              <label className="footer-consent">
                <input
                  type="checkbox"
                  checked={newsletterForm.accepted}
                  onChange={(event) => updateNewsletterForm('accepted', event.target.checked)}
                />
                <span>Tôi đồng ý với điều khoản của CellphoneS</span>
              </label>
              {newsletterStatus.message && (
                <p className={`footer-newsletter-status ${newsletterStatus.type}`}>
                  {newsletterStatus.message}
                </p>
              )}
              <button type="submit" disabled={isNewsletterSubmitting}>
                {isNewsletterSubmitting ? 'Đang gửi...' : 'Đăng ký ngay'}
              </button>
            </form>
          </div>

          <nav className="footer-column" aria-label="Thông tin về chính sách">
            <h2 className="footer-heading">Thông tin về chính sách</h2>
            <ul className="footer-link-list">
              {footerLinks.policies.map((link) => (
                <li key={link}><a href={getRouteForLabel(link, 'policy')}>{link}</a></li>
              ))}
            </ul>
          </nav>

          <div className="footer-column">
            <nav aria-label="Dịch vụ và thông tin khác">
              <h2 className="footer-heading">Dịch vụ và thông tin khác</h2>
              <ul className="footer-link-list">
                {footerLinks.services.map((link) => (
                  <li key={link}><a href={getRouteForLabel(link, 'service')}>{link}</a></li>
                ))}
              </ul>
            </nav>

            <section className="footer-app-download">
              <h2 className="footer-heading">Mua sắm dễ dàng – Ưu đãi ngập tràn cùng app CellphoneS</h2>
              <div className="footer-app-assets">
                <img
                  className="footer-app-qr"
                  src="https://cdn2.cellphones.com.vn/200x,webp/media/wysiwyg/Web/Logo/QR_appGeneral-v2.png"
                  alt="QR tải app CellphoneS"
                  width="113"
                  height="113"
                  loading="lazy"
                />
                <div>
                  <a href="/download-app"><img src="https://cdn2.cellphones.com.vn/200x,webp/media/wysiwyg/downloadANDROID.png" alt="Tải app từ Google Play" width="161" height="48" loading="lazy" /></a>
                  <a href="/download-app"><img src="https://cdn2.cellphones.com.vn/200x,webp/media/wysiwyg/downloadiOS.png" alt="Tải app từ App Store" width="161" height="54" loading="lazy" /></a>
                </div>
              </div>
            </section>
          </div>

          <div className="footer-column footer-connect-column">
            <section>
              <h2 className="footer-heading">Kết nối với CellphoneS</h2>
              <div className="footer-socials">
                {footerSocials.map((social) => (
                  <a href={`/ket-noi/${social.id}`} aria-label={social.name} key={social.id}>
                    <img src={social.image} alt={social.name} width="40" height="28" loading="lazy" />
                  </a>
                ))}
              </div>
            </section>

            <section>
              <h2 className="footer-heading">Website thành viên</h2>
              <div className="footer-member-sites">
                {footerMemberSites.map((site) => (
                  <a href={`/thanh-vien/${site.id}`} key={site.id}>
                    <span>{site.description}</span>
                    <img src={site.image} alt={site.description} height="30" loading="lazy" />
                  </a>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container">
          <div className="footer-popular-grid">
            {footerLinks.popular.map((group, index) => (
              <nav aria-label={`Liên kết sản phẩm ${index + 1}`} className="footer-popular-group" key={group[0]}>
                {group.map((link) => <a href={getFooterPopularRoute(link)} key={link}>{link}</a>)}
              </nav>
            ))}
          </div>

          <p className="footer-company-info">
            Công ty Cổ phần Thương Mại và Dịch Vụ Kỹ Thuật DIỆU PHÚC - GPDKKD: 0316172372 cấp tại Sở KH &amp; ĐT TP. HCM. Địa chỉ văn phòng: 350-352 Võ Văn Kiệt, Phường Cầu Ông Lãnh, Thành phố Hồ Chí Minh, Việt Nam. Điện thoại: 028.7108.9666.
          </p>

          <div className="footer-certificates">
            <a href={externalLinks.saleNotification} target="_blank" rel="noreferrer"><img src="https://cdn2.cellphones.com.vn/80x,webp/media/logo/logoSaleNoti.png" alt="Đã thông báo Bộ Công Thương" width="80" height="30" loading="lazy" /></a>
            <a href={externalLinks.dmca} target="_blank" rel="noreferrer"><img src="https://images.dmca.com/Badges/dmca_copyright_protected150c.png?ID=158f5667-cce3-4a18-b2d1-826225e6b022" alt="DMCA.com Protection Status" width="112" height="30" loading="lazy" /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
