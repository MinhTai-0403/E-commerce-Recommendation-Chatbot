import './Footer.css';
import {
  footerLinks,
  footerMemberSites,
  footerSocials,
  paymentPartners,
} from '../../data/mockData';

export default function Footer() {
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
                  <a href="#" aria-label={partner.name} key={partner.id}>
                    <img src={partner.image} alt={partner.name} width="46" height="30" loading="lazy" />
                  </a>
                ))}
              </div>
            </section>

            <section className="footer-newsletter">
              <h2 className="footer-heading footer-newsletter-heading">Đăng ký nhận tin khuyến mãi</h2>
              <div className="footer-voucher">
                <strong>Nhận ngay voucher 10%</strong>
                <span>Voucher sẽ được gửi sau 24h, chỉ áp dụng cho khách hàng mới</span>
              </div>
              <label htmlFor="footer-email">Email</label>
              <input id="footer-email" type="email" placeholder="Nhập email của bạn" />
              <label htmlFor="footer-phone">Số điện thoại</label>
              <input id="footer-phone" type="tel" placeholder="Nhập số điện thoại của bạn" />
              <label className="footer-consent">
                <input type="checkbox" defaultChecked />
                <span>Tôi đồng ý với điều khoản của CellphoneS</span>
              </label>
              <button type="button">Đăng ký ngay</button>
            </section>
          </div>

          <nav className="footer-column" aria-label="Thông tin về chính sách">
            <h2 className="footer-heading">Thông tin về chính sách</h2>
            <ul className="footer-link-list">
              {footerLinks.policies.map((link) => (
                <li key={link}><a href="#">{link}</a></li>
              ))}
            </ul>
          </nav>

          <div className="footer-column">
            <nav aria-label="Dịch vụ và thông tin khác">
              <h2 className="footer-heading">Dịch vụ và thông tin khác</h2>
              <ul className="footer-link-list">
                {footerLinks.services.map((link) => (
                  <li key={link}><a href="#">{link}</a></li>
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
                  <a href="#"><img src="https://cdn2.cellphones.com.vn/200x,webp/media/wysiwyg/downloadANDROID.png" alt="Tải app từ Google Play" width="161" height="48" loading="lazy" /></a>
                  <a href="#"><img src="https://cdn2.cellphones.com.vn/200x,webp/media/wysiwyg/downloadiOS.png" alt="Tải app từ App Store" width="161" height="54" loading="lazy" /></a>
                </div>
              </div>
            </section>
          </div>

          <div className="footer-column footer-connect-column">
            <section>
              <h2 className="footer-heading">Kết nối với CellphoneS</h2>
              <div className="footer-socials">
                {footerSocials.map((social) => (
                  <a href="#" aria-label={social.name} key={social.id}>
                    <img src={social.image} alt={social.name} width="40" height="28" loading="lazy" />
                  </a>
                ))}
              </div>
            </section>

            <section>
              <h2 className="footer-heading">Website thành viên</h2>
              <div className="footer-member-sites">
                {footerMemberSites.map((site) => (
                  <a href="#" key={site.id}>
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
                {group.map((link) => <a href="#" key={link}>{link}</a>)}
              </nav>
            ))}
          </div>

          <p className="footer-company-info">
            Công ty Cổ phần Thương Mại và Dịch Vụ Kỹ Thuật DIỆU PHÚC - GPDKKD: 0316172372 cấp tại Sở KH &amp; ĐT TP. HCM. Địa chỉ văn phòng: 350-352 Võ Văn Kiệt, Phường Cầu Ông Lãnh, Thành phố Hồ Chí Minh, Việt Nam. Điện thoại: 028.7108.9666.
          </p>

          <div className="footer-certificates">
            <a href="#"><img src="https://cdn2.cellphones.com.vn/80x,webp/media/logo/logoSaleNoti.png" alt="Đã thông báo Bộ Công Thương" width="80" height="30" loading="lazy" /></a>
            <a href="#"><img src="https://images.dmca.com/Badges/dmca_copyright_protected150c.png?ID=158f5667-cce3-4a18-b2d1-826225e6b022" alt="DMCA.com Protection Status" width="112" height="30" loading="lazy" /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
