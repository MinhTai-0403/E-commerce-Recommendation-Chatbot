import { useState } from "react";
import { loginSmember, requestForgotPasswordOtp, resetForgotPassword } from "../../services/apiAuth";
import GoogleAuthButton from "../GoogleAuthButton/GoogleAuthButton";
import "./LoginSmember.css";

const benefits = [
  ["Chiết khấu đến", "5%", "khi mua các sản phẩm tại CellphoneS"],
  ["Miễn phí giao hàng", "", "cho thành viên SMEM, SVIP và đơn hàng từ 300.000đ"],
  ["Tặng voucher sinh nhật đến", "500.000đ", "cho khách hàng thành viên"],
  ["Trợ giá thu cũ lên đời đến", "1 triệu", ""],
  ["Thăng hạng nhận voucher đến", "300.000đ", ""],
  ["Đặc quyền S-Student/S-Teacher", "ưu đãi thêm đến 10%", ""],
  ["S-Business:", "Chiết khấu đến 8%", "dành riêng cho khách hàng doanh nghiệp"],
];

export default function LoginSmember({ onBackToHome, onGoRegister, onAuthSuccess }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState("request");
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!identifier || !password) {
      setErrorMessage("Vui lòng điền email/số điện thoại và mật khẩu.");
      return;
    }

    setIsLoading(true);
    try {
      const payload = await loginSmember({ identifier: identifier.trim(), password });
      if (onAuthSuccess) onAuthSuccess(payload.data?.user || payload.user || null);
      else onBackToHome();
    } catch (error) {
      setErrorMessage(error.message || "Không thể kết nối tới máy chủ xác thực.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = (payload) => {
    setErrorMessage("");
    const user = payload.data?.user || payload.user || null;
    if (onAuthSuccess) onAuthSuccess(user);
    else onBackToHome();
  };

  const handleForgotOtpSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!forgotIdentifier.trim()) {
      setErrorMessage("Vui lòng nhập email hoặc số điện thoại để nhận OTP.");
      return;
    }

    setIsLoading(true);
    try {
      const payload = await requestForgotPasswordOtp(forgotIdentifier.trim());
      setForgotEmail(payload.data?.email || forgotIdentifier.trim());
      setForgotStep("reset");
      setSuccessMessage("Mã OTP đặt lại mật khẩu đã được gửi về email của bạn.");
    } catch (error) {
      setErrorMessage(error.message || "Không thể gửi OTP đặt lại mật khẩu.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotResetSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!forgotOtp.trim() || !forgotNewPassword) {
      setErrorMessage("Vui lòng nhập OTP và mật khẩu mới.");
      return;
    }

    setIsLoading(true);
    try {
      await resetForgotPassword({
        email: forgotEmail || forgotIdentifier.trim(),
        otp: forgotOtp.trim(),
        newPassword: forgotNewPassword,
      });
      setSuccessMessage("Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.");
      setShowForgotPassword(false);
      setForgotStep("request");
      setPassword("");
    } catch (error) {
      setErrorMessage(error.message || "Không thể đặt lại mật khẩu.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-full-page-wrapper">
      <div className="login-main-row">
        <div className="login-left-content-panel">
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

          <div className="smember-bracket-container">
            <div className="bracket-line left-side-bracket" />
            <div className="bracket-line right-side-bracket" />

            <ul className="benefit-bullets-list">
              {benefits.map(([prefix, strong, suffix]) => (
                <li key={`${prefix}-${strong}`}>
                  <img
                    src="https://cdn2.cellphones.com.vn/insecure/rs:fill:20:20/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon-gift.png"
                    alt="gift"
                  />
                  <span>
                    {prefix} {strong && <b>{strong}</b>} {suffix}
                  </span>
                </li>
              ))}
            </ul>

            <a href="/uu-dai-smember" className="policy-link-anchor">
              Xem chi tiết chính sách ưu đãi Smember ›
            </a>
          </div>

          <div className="smember-footer-mascot-wrapper">
            <img
              src="https://cdn-static.smember.com.vn/_next/static/media/smember-promotion-ant.a7833c47.png"
              alt="CellphoneS Mascot"
            />
          </div>
        </div>

        <div className="login-right-form-panel">
          <h3 className="form-page-title">Đăng nhập SMEMBER</h3>

          <form onSubmit={handleLoginSubmit} className="smember-form-element">
            {errorMessage && <div className="error-alert-text">⚠️ {errorMessage}</div>}
            {successMessage && <div className="success-alert-text">✅ {successMessage}</div>}

            <div className="form-group-item">
              <label>Email hoặc số điện thoại</label>
              <input
                type="text"
                placeholder="Nhập email hoặc số điện thoại của bạn"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            </div>

            <div className="form-group-item password-field-row">
              <label>Mật khẩu</label>
              <div className="password-input-container">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Nhập mật khẩu của bạn"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-eye"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "Ẩn" : "Hiện"}
                </button>
              </div>
            </div>

            <button type="submit" className="smember-submit-btn" disabled={isLoading}>
              {isLoading ? "Đang xử lý..." : "Đăng nhập"}
            </button>
          </form>

          <div className="forgot-pass-link-center">
            <button
              type="button"
              className="inline-auth-link"
              onClick={() => {
                setShowForgotPassword((value) => !value);
                setErrorMessage("");
                setSuccessMessage("");
              }}
            >
              Quên mật khẩu?
            </button>
          </div>

          {showForgotPassword && (
            <div className="forgot-password-panel">
              {forgotStep === "request" ? (
                <form onSubmit={handleForgotOtpSubmit} className="smember-form-element compact">
                  <div className="form-group-item">
                    <label>Email hoặc số điện thoại</label>
                    <input
                      type="text"
                      placeholder="Nhập email/số điện thoại đã đăng ký"
                      value={forgotIdentifier}
                      onChange={(event) => setForgotIdentifier(event.target.value)}
                    />
                  </div>
                  <button type="submit" className="smember-submit-btn" disabled={isLoading}>
                    {isLoading ? "Đang gửi OTP..." : "Gửi OTP"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleForgotResetSubmit} className="smember-form-element compact">
                  <div className="form-group-item">
                    <label>Email nhận OTP</label>
                    <input
                      type="text"
                      value={forgotEmail}
                      onChange={(event) => setForgotEmail(event.target.value)}
                    />
                  </div>
                  <div className="form-group-item">
                    <label>Mã OTP</label>
                    <input
                      type="text"
                      placeholder="Nhập 6 số OTP"
                      value={forgotOtp}
                      onChange={(event) => setForgotOtp(event.target.value)}
                    />
                  </div>
                  <div className="form-group-item">
                    <label>Mật khẩu mới</label>
                    <input
                      type="password"
                      placeholder="Tối thiểu 6 ký tự và có số"
                      value={forgotNewPassword}
                      onChange={(event) => setForgotNewPassword(event.target.value)}
                    />
                  </div>
                  <button type="submit" className="smember-submit-btn" disabled={isLoading}>
                    {isLoading ? "Đang đặt lại..." : "Đặt lại mật khẩu"}
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="or-social-divider">
            <span>Hoặc đăng nhập bằng</span>
          </div>

          <div className="social-login-grid">
            <GoogleAuthButton
              mode="login"
              onSuccess={handleGoogleSuccess}
              onError={setErrorMessage}
              onLoadingChange={setIsLoading}
            />
            <button
              type="button"
              className="social-login-btn btn-zalo"
              onClick={() => setErrorMessage("Đăng nhập Zalo hiện chưa khả dụng.")}
            >
              <img src="https://cdn-static.smember.com.vn/_next/static/media/logo-zalo.120d889f.svg" alt="Zalo" />
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
            <a href="https://cellphones.com.vn" target="_blank" rel="noreferrer">cellphones.com.vn</a>
            {" "}và{" "}
            <a href="https://dienthoaivui.com.vn" target="_blank" rel="noreferrer">dienthoaivui.com.vn</a>
          </div>
        </div>
      </div>
    </div>
  );
}
