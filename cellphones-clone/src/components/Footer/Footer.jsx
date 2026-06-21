import './Footer.css';
import { footerLinks, paymentPartners } from '../../data/mockData';

export default function Footer() {
  return (
    <footer className="footer section-gap" id="footer">
      {/* Top Strip */}
      <div className="footer-top">
        <div className="container footer-top-inner">
          <div className="footer-hotline">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <div>
              <span className="hotline-label">Gọi mua hàng (miễn phí)</span>
              <strong className="hotline-number">1800.2097</strong>
            </div>
          </div>
          <div className="footer-hotline">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <div>
              <span className="hotline-label">Khiếu nại, góp ý</span>
              <strong className="hotline-number">1800.2063</strong>
            </div>
          </div>
          <div className="footer-hotline">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
            <div>
              <span className="hotline-label">Doanh nghiệp (B2B)</span>
              <strong className="hotline-number">1800.2098</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="footer-main">
        <div className="container footer-main-inner">
          {/* Column 1: About */}
          <div className="footer-col">
            <h3 className="footer-col-title">Về CellphoneS</h3>
            <ul className="footer-links">
              {footerLinks.about.map((link, i) => (
                <li key={i}><a href="#">{link}</a></li>
              ))}
            </ul>
          </div>

          {/* Column 2: Policy */}
          <div className="footer-col">
            <h3 className="footer-col-title">Chính sách</h3>
            <ul className="footer-links">
              {footerLinks.policy.map((link, i) => (
                <li key={i}><a href="#">{link}</a></li>
              ))}
            </ul>
          </div>

          {/* Column 3: Member Sites */}
          <div className="footer-col">
            <h3 className="footer-col-title">Thành viên</h3>
            <ul className="footer-links">
              {footerLinks.memberSites.map((site, i) => (
                <li key={i}><a href={site.url}>{site.name}</a></li>
              ))}
            </ul>
          </div>

          {/* Column 4: Connect */}
          <div className="footer-col">
            <h3 className="footer-col-title">Kết nối với chúng tôi</h3>
            <div className="footer-social">
              <a href="#" className="social-icon" aria-label="Facebook">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                </svg>
              </a>
              <a href="#" className="social-icon" aria-label="YouTube">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z"/>
                  <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="white"/>
                </svg>
              </a>
              <a href="#" className="social-icon" aria-label="TikTok">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1 0-5.78 2.92 2.92 0 0 1 .88.13V9.04a6.37 6.37 0 0 0-.88-.07 6.26 6.26 0 0 0 0 12.52 6.26 6.26 0 0 0 6.26-6.26V8.76a8.26 8.26 0 0 0 3.84.96V6.69z"/>
                </svg>
              </a>
              <a href="#" className="social-icon" aria-label="Zalo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="10"/>
                  <text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">Z</text>
                </svg>
              </a>
            </div>

            <h3 className="footer-col-title" style={{ marginTop: 16 }}>Thanh toán</h3>
            <div className="footer-payments">
              {paymentPartners.map(p => (
                <span key={p.id} className="payment-badge">{p.name}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <div className="footer-company">
            <p className="company-name">Công ty TNHH Thương Mại và Dịch Vụ Kỹ Thuật Số CellphoneS</p>
            <p className="company-info">Địa chỉ: 33 Trần Quang Khải, P. Tân Định, Quận 1, TP. Hồ Chí Minh</p>
            <p className="company-info">GPKD số 0316689045 do sở KH và ĐT TP.HCM cấp ngày 01/03/2021</p>
          </div>
          <div className="footer-badges">
            <div className="govt-badge">
              <svg width="60" height="24" viewBox="0 0 60 24" fill="none">
                <rect width="60" height="24" rx="4" fill="#c4161c"/>
                <text x="30" y="16" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">ĐÃ ĐĂNG KÝ</text>
              </svg>
            </div>
            <div className="govt-badge">
              <svg width="60" height="24" viewBox="0 0 60 24" fill="none">
                <rect width="60" height="24" rx="4" fill="#0066b3"/>
                <text x="30" y="16" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">BỘ CÔNG THƯƠNG</text>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
