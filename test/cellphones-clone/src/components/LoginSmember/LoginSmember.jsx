import { useState } from "react";
import { loginSmember } from "../../services/apiAuth";
import "./LoginSmember.css";

export default function LoginSmember({ onBackToHome, onGoRegister, onAuthSuccess }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // XỬ LÝ GỬI DỮ LIỆU ĐĂNG NHẬP ĐỒNG BỘ BACKEND
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!identifier || !password) {
      setErrorMessage("Vui lòng điền email/số điện thoại và mật khẩu!");
      return;
    }

    setIsLoading(true);

    try {
      const payload = await loginSmember({ identifier: identifier.trim(), password });
      alert("Đăng nhập tài khoản Smember thành công!");
      if (onAuthSuccess) onAuthSuccess(payload.data?.user || payload.user || null);
      else onBackToHome();
    } catch (error) {
      console.error("Lỗi kết nối Backend:", error);
      setErrorMessage(error.message || "Không thể kết nối tới máy chủ backend!");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-full-page-wrapper">
      <div className="login-main-row">
        {/* ================= CỘT TRÁI: ĐẶC QUYỀN THÀNH VIÊN ================= */}
        <div className="login-left-content-panel">
          {/* Thanh chứa 2 logo bọc hộp đỏ */}
          <div className="brand-logos-header-row">
            <div className="logo-red-card">
              <img
                src="https://cdn-static.smember.com.vn/_next/static/media/cellphones-long-icon.6a80e2a6.svg"
                alt="CellphoneS"
              />
            </div>
            <div className="logo-red-card">
              <img
                src="https://cdn-static.smember.com.vn/_next/static/media/dtv-long-icon.40a11e1d.svg"
                alt="Điện Thoại Vui"
              />
            </div>
          </div>

          <h2 className="smember-heading-title">
            Nhập hội khách hàng thành viên <span>SMEMBER</span>
          </h2>
          <p className="smember-sub-title">
            Để không bỏ lỡ các ưu đãi hấp dẫn từ CellphoneS
          </p>

          {/* Khung ngoặc đỏ dày góc cạnh đối xứng */}
          <div className="smember-bracket-container">
            <div className="bracket-line left-side-bracket"></div>
            <div className="bracket-line right-side-bracket"></div>

            <ul className="benefit-bullets-list">
              <li>
                <img
                  src="https://cdn2.cellphones.com.vn/insecure/rs:fill:20:20/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon-gift.png"
                  alt="gift"
                />
                <span>
                  Chiết khấu đến <b>5%</b> khi mua các sản phẩm mua tại
                  CellphoneS
                </span>
              </li>
              <li>
                <img
                  src="https://cdn2.cellphones.com.vn/insecure/rs:fill:20:20/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon-gift.png"
                  alt="gift"
                />
                <span>
                  <b>Miễn phí giao hàng</b> cho thành viên SMEM, SVIP và cho đơn
                  hàng từ 300.000đ
                </span>
              </li>
              <li>
                <img
                  src="https://cdn2.cellphones.com.vn/insecure/rs:fill:20:20/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon-gift.png"
                  alt="gift"
                />
                <span>
                  Tặng voucher sinh nhật đến <b>500.000đ</b> cho khách hàng
                  thành viên
                </span>
              </li>
              <li>
                <img
                  src="https://cdn2.cellphones.com.vn/insecure/rs:fill:20:20/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon-gift.png"
                  alt="gift"
                />
                <span>
                  Trợ giá thu cũ lên đời đến <b>1 triệu</b>
                </span>
              </li>
              <li>
                <img
                  src="https://cdn2.cellphones.com.vn/insecure/rs:fill:20:20/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon-gift.png"
                  alt="gift"
                />
                <span>
                  Thăng hạng nhận voucher đến <b>300.000đ</b>
                </span>
              </li>
              <li>
                <img
                  src="https://cdn2.cellphones.com.vn/insecure/rs:fill:20:20/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon-gift.png"
                  alt="gift"
                />
                <span>
                  Đặc quyền S-Student/S-Teacher <b>ưu đãi thêm đến 10%</b>
                </span>
              </li>
              <li>
                <img
                  src="https://cdn2.cellphones.com.vn/insecure/rs:fill:20:20/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon-gift.png"
                  alt="gift"
                />
                <span>
                  <b>S-Business:</b> Chiết khấu đến 8% dành riêng cho khách hàng
                  doanh nghiệp
                </span>
              </li>
            </ul>

            <a href="#policy" className="policy-link-anchor">
              Xem chi tiết chính sách ưu đãi Smember ›
            </a>
          </div>

          {/* Khối hình logo kiến lớn bưng quà dưới đáy */}
          <div className="smember-footer-mascot-wrapper">
            <img
              src="https://cdn-static.smember.com.vn/_next/static/media/smember-promotion-ant.a7833c47.png"
              alt="CellphoneS Mascot"
            />
          </div>
        </div>

        {/* ================= CỘT PHẢI: KHUNG ĐĂNG NHẬP PANEL ================= */}
        <div className="login-right-form-panel">
          <h3 className="form-page-title">Đăng nhập SMEMBER</h3>

          <form onSubmit={handleLoginSubmit} className="smember-form-element">
            {errorMessage && (
              <div className="error-alert-text">⚠️ {errorMessage}</div>
            )}

            <div className="form-group-item">
              <label>Email hoặc số điện thoại</label>
              <input
                type="text"
                placeholder="Nhập email hoặc số điện thoại của bạn"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>

            <div className="form-group-item password-field-row">
              <label>Mật khẩu</label>
              <div className="password-input-container">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Nhập mật khẩu của bạn"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-eye"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#a1a1aa"
                      strokeWidth="2"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.4 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#a1a1aa"
                      strokeWidth="2"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="smember-submit-btn"
              disabled={isLoading}
            >
              {isLoading ? "Đang xử lý đăng nhập..." : "Đăng nhập"}
            </button>
          </form>

          <div className="forgot-pass-link-center">
            <a href="#forgot">Quên mật khẩu?</a>
          </div>

          <div className="or-social-divider">
            <span>Hoặc đăng nhập bằng</span>
          </div>

          <div className="social-login-grid">
            <button type="button" className="social-login-btn btn-google">
              <img
                src="https://developers.google.com/identity/images/g-logo.png"
                alt="Google"
              />
              <span>Google</span>
            </button>
            <button type="button" className="social-login-btn btn-zalo">
              <img
                src="https://cdn-static.smember.com.vn/_next/static/media/logo-zalo.120d889f.svg"
                alt="Zalo"
              />
              <span>Zalo</span>
            </button>
          </div>

          <div className="signup-hint-text">
            Bạn chưa có tài khoản?{" "}
            <button type="button" className="inline-auth-link" onClick={onGoRegister}>
              Đăng ký ngay
            </button>
          </div>

          <div className="footer-copyright-text">
            Mua sắm, sửa chữa tại <br />
            <a
              href="https://cellphones.com.vn"
              target="_blank"
              rel="noreferrer"
            >
              cellphones.com.vn
            </a>{" "}
            và{" "}
            <a
              href="https://dienthoaivui.com.vn"
              target="_blank"
              rel="noreferrer"
            >
              dienthoaivui.com.vn
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
