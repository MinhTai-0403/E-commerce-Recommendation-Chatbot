import { useMemo, useState } from "react";
import "../LoginSmember/LoginSmember.css";
import "./RegisterSmember.css";
import { requestRegisterOtp, verifyRegisterOtp } from "../../services/apiAuth";

function LogoHeader() {
  return (
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
  );
}

function RegisterLeftPanel() {
  return (
    <div className="login-left-content-panel register-left-content-panel">
      <LogoHeader />

      <h2 className="smember-heading-title">
        Trở thành khách hàng thân thiết <span>SMEMBER</span>
      </h2>
      <p className="smember-sub-title">
        Tích điểm, đổi quà và nhận thêm nhiều đặc quyền khi mua sắm tại CellphoneS
      </p>

      <div className="smember-bracket-container">
        <div className="bracket-line left-side-bracket" />
        <div className="bracket-line right-side-bracket" />

        <ul className="benefit-bullets-list">
          <li>
            <img
              src="https://cdn2.cellphones.com.vn/insecure/rs:fill:20:20/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon-gift.png"
              alt=""
            />
            <span>
              Tích điểm khi mua hàng và nhận ưu đãi riêng cho từng hạng thành viên.
            </span>
          </li>
          <li>
            <img
              src="https://cdn2.cellphones.com.vn/insecure/rs:fill:20:20/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon-gift.png"
              alt=""
            />
            <span>
              Nhận voucher sinh nhật, ưu đãi trả góp và miễn phí giao hàng theo chính sách.
            </span>
          </li>
          <li>
            <img
              src="https://cdn2.cellphones.com.vn/insecure/rs:fill:20:20/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon-gift.png"
              alt=""
            />
            <span>
              S-Student/S-Teacher và S-Business có thêm quyền lợi riêng khi xác thực.
            </span>
          </li>
        </ul>

        <a href="/uu-dai-smember" className="policy-link-anchor">
          Xem chi tiết chính sách ưu đãi Smember ›
        </a>
      </div>

      <div className="smember-footer-mascot-wrapper register-footer-mascot-wrapper">
        <img
          src="https://cdn-static.smember.com.vn/_next/static/media/smember-promotion-ant.a7833c47.png"
          alt="CellphoneS Mascot"
        />
      </div>
    </div>
  );
}

export default function RegisterSmember({ onBackToHome, onGoLogin, onAuthSuccess }) {
  const [form, setForm] = useState({
    fullName: "",
    birthday: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    customerType: "normal",
    acceptTerms: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [registerStep, setRegisterStep] = useState("form");
  const [otp, setOtp] = useState("");
  const [otpMeta, setOtpMeta] = useState(null);

  const passwordHint = useMemo(() => {
    const hasLength = form.password.length >= 6;
    const hasNumber = /\d/.test(form.password);
    return {
      valid: hasLength && hasNumber,
      text: "Mật khẩu tối thiểu 6 ký tự, có ít nhất 1 chữ số",
    };
  }, [form.password]);

  const updateForm = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrorMessage("");
    setSuccessMessage("");
  };

  const validateForm = () => {
    if (!form.fullName.trim()) return "Vui lòng nhập họ và tên.";
    if (!form.birthday) return "Vui lòng chọn ngày sinh.";
    if (!/^0\d{9}$/.test(form.phone.trim())) {
      return "Số điện thoại cần gồm 10 chữ số và bắt đầu bằng 0.";
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Vui lòng nhập email hợp lệ để nhận mã OTP.";
    }
    if (!passwordHint.valid) return passwordHint.text;
    if (form.password !== form.confirmPassword) return "Mật khẩu nhập lại chưa khớp.";
    if (!form.acceptTerms) return "Bạn cần đồng ý điều khoản sử dụng và chính sách bảo mật.";
    return "";
  };

  const buildRegisterPayload = () => ({
    fullName: form.fullName.trim(),
    birthday: form.birthday,
    phone: form.phone.trim(),
    email: form.email.trim(),
    password: form.password,
    customerType: form.customerType,
  });

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const payload = await requestRegisterOtp(buildRegisterPayload());
      setOtpMeta(payload.data || null);
      setRegisterStep("otp");
      setSuccessMessage("Mã OTP đã được gửi về email của bạn. Vui lòng kiểm tra hộp thư.");
    } catch (error) {
      console.error("Lỗi đăng ký Smember:", error);
      setErrorMessage(
        error.message || "Không thể kết nối tới máy chủ backend đăng ký.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtpSubmit = async (event) => {
    event.preventDefault();

    if (!/^\d{6}$/.test(otp.trim())) {
      setErrorMessage("Mã OTP cần gồm 6 chữ số.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const payload = await verifyRegisterOtp({ email: form.email.trim(), otp: otp.trim() });
      setRegisterStep("verified");
      setSuccessMessage("Đăng ký và xác thực email thành công! Bạn đã được đăng nhập.");
      if (onAuthSuccess) {
        window.setTimeout(() => {
          onAuthSuccess(payload.data?.user || payload.user || null);
        }, 700);
      }
    } catch (error) {
      console.error("Lỗi xác thực OTP:", error);
      setErrorMessage(error.message || "Không thể xác thực OTP.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditRegisterInfo = () => {
    setRegisterStep("form");
    setOtp("");
    setOtpMeta(null);
    setErrorMessage("");
    setSuccessMessage("");
  };

  return (
    <div className="login-full-page-wrapper register-full-page-wrapper">
      <div className="login-main-row register-main-row">
        <RegisterLeftPanel />

        <div className="login-right-form-panel register-right-form-panel">
          <button type="button" className="register-close-home" onClick={onBackToHome}>
            Về trang chủ
          </button>

          <div className="register-ant-avatar">
            <img
              src="https://cellphones.com.vn/media/wysiwyg/ant-smile.png"
              alt="Register Ant"
            />
          </div>

          <h3 className="form-page-title register-page-title">
            Đăng ký trở thành SMEMBER
          </h3>

          <div className="register-social-heading">Đăng ký bằng tài khoản mạng xã hội</div>
          <div className="social-login-grid register-social-grid">
            <button
              type="button"
              className="social-login-btn btn-google"
              onClick={() => setErrorMessage("Đăng ký bằng Google chưa cấu hình OAuth. Vui lòng đăng ký bằng email và OTP trước.")}
            >
              <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" />
              <span>Google</span>
            </button>
            <button
              type="button"
              className="social-login-btn btn-zalo"
              onClick={() => setErrorMessage("Đăng ký bằng Zalo chưa cấu hình OAuth. Vui lòng đăng ký bằng email và OTP trước.")}
            >
              <img
                src="https://cdn-static.smember.com.vn/_next/static/media/logo-zalo.120d889f.svg"
                alt="Zalo"
              />
              <span>Zalo</span>
            </button>
          </div>

          <div className="or-social-divider register-divider">
            <span>Hoặc điền thông tin sau</span>
          </div>

          <form
            onSubmit={registerStep === "otp" ? handleVerifyOtpSubmit : handleRegisterSubmit}
            className="smember-form-element register-form-element"
          >
            {errorMessage && <div className="error-alert-text">⚠️ {errorMessage}</div>}
            {successMessage && <div className="success-alert-text">✓ {successMessage}</div>}

            <section className="register-form-section">
              <h4>Thông tin cá nhân</h4>

              <div className="form-group-item">
                <label>Họ và tên</label>
                <input
                  type="text"
                  placeholder="Nhập họ và tên"
                  value={form.fullName}
                  onChange={(event) => updateForm("fullName", event.target.value)}
                  disabled={registerStep !== "form"}
                />
              </div>

              <div className="register-two-column">
                <div className="form-group-item">
                  <label>Ngày sinh</label>
                  <input
                    type="date"
                    value={form.birthday}
                    onChange={(event) => updateForm("birthday", event.target.value)}
                    disabled={registerStep !== "form"}
                  />
                </div>

                <div className="form-group-item">
                  <label>Số điện thoại</label>
                  <input
                    type="tel"
                    placeholder="Nhập số điện thoại"
                    value={form.phone}
                    onChange={(event) => updateForm("phone", event.target.value)}
                    maxLength={10}
                    disabled={registerStep !== "form"}
                  />
                </div>
              </div>

              <div className="form-group-item">
                <label>Email nhận OTP</label>
                <input
                  type="email"
                  placeholder="Nhập email của bạn"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  disabled={registerStep !== "form"}
                />
                <small>Mã OTP xác thực tài khoản sẽ được gửi qua email này</small>
              </div>
            </section>

            <section className="register-form-section">
              <h4>Tạo mật khẩu</h4>

              <div className="form-group-item password-field-row">
                <label>Mật khẩu</label>
                <div className="password-input-container">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Nhập mật khẩu"
                    value={form.password}
                    onChange={(event) => updateForm("password", event.target.value)}
                    disabled={registerStep !== "form"}
                  />
                  <button
                    type="button"
                    className="password-toggle-eye"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? "Ẩn" : "Hiện"}
                  </button>
                </div>
                <small className={passwordHint.valid ? "valid-hint" : ""}>{passwordHint.text}</small>
              </div>

              <div className="form-group-item password-field-row">
                <label>Nhập lại mật khẩu</label>
                <div className="password-input-container">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Nhập lại mật khẩu"
                    value={form.confirmPassword}
                    onChange={(event) => updateForm("confirmPassword", event.target.value)}
                    disabled={registerStep !== "form"}
                  />
                  <button
                    type="button"
                    className="password-toggle-eye"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showConfirmPassword ? "Ẩn" : "Hiện"}
                  </button>
                </div>
              </div>
            </section>

            <label className="register-terms-row">
              <input
                type="checkbox"
                checked={form.acceptTerms}
                onChange={(event) => updateForm("acceptTerms", event.target.checked)}
                disabled={registerStep !== "form"}
              />
              <span>
                Bằng việc Đăng ký, bạn đã đọc và đồng ý với{" "}
                <a href="https://cellphones.com.vn/dieu-khoan-su-dung" target="_blank" rel="noreferrer">
                  Điều khoản sử dụng
                </a>{" "}
                và{" "}
                <a href="https://cellphones.com.vn/chinh-sach-bao-mat" target="_blank" rel="noreferrer">
                  Chính sách bảo mật của CellphoneS
                </a>.
              </span>
            </label>

            <div className="register-customer-cards">
              <button
                type="button"
                className={`register-customer-card ${form.customerType === "student" ? "active" : ""}`}
                onClick={() => updateForm("customerType", form.customerType === "student" ? "normal" : "student")}
                disabled={registerStep !== "form"}
              >
                <strong>Tôi là Học sinh - sinh viên / Giáo viên - giảng viên</strong>
                <span>Nhận thêm ưu đãi tới 700k/sản phẩm</span>
                <em>Xem chi tiết</em>
              </button>
              <button
                type="button"
                className={`register-customer-card ${form.customerType === "business" ? "active" : ""}`}
                onClick={() => updateForm("customerType", form.customerType === "business" ? "normal" : "business")}
                disabled={registerStep !== "form"}
              >
                <strong>Tôi là Khách hàng Doanh nghiệp</strong>
                <span>Nhận quyền lợi hấp dẫn lên đến 1 triệu/đơn hàng</span>
                <em>Xem chi tiết</em>
              </button>
            </div>

            {registerStep === "otp" && (
              <section className="register-form-section register-otp-section">
                <h4>Xác thực email</h4>
                <p>
                  Nhập mã OTP 6 chữ số đã gửi tới <strong>{form.email.trim()}</strong>.
                  {otpMeta?.otpExpiresMinutes ? ` Mã có hiệu lực trong ${otpMeta.otpExpiresMinutes} phút.` : ""}
                </p>
                <div className="form-group-item">
                  <label>Mã OTP</label>
                  <input
                    className="register-otp-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="Nhập 6 chữ số"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    autoFocus
                  />
                </div>
                <button type="button" className="register-edit-info-btn" onClick={handleEditRegisterInfo}>
                  Sửa thông tin đăng ký
                </button>
              </section>
            )}

            {registerStep === "verified" && (
              <section className="register-form-section register-otp-section register-verified-section">
                <h4>Hoàn tất xác thực</h4>
                <p>Tài khoản SMEMBER đã được tạo và email đã xác thực thành công.</p>
              </section>
            )}

            <div className="register-action-row">
              <button type="button" className="register-back-login-btn" onClick={onGoLogin}>
                Quay lại đăng nhập
              </button>
              <button
                type="submit"
                className="smember-submit-btn register-submit-btn"
                disabled={isLoading || registerStep === "verified"}
              >
                {registerStep === "verified"
                  ? "Đã xác thực"
                  : registerStep === "otp"
                  ? (isLoading ? "Đang xác thực OTP..." : "Xác thực OTP")
                  : (isLoading ? "Đang gửi OTP..." : "Gửi mã OTP")}
              </button>
            </div>
          </form>

          <div className="footer-copyright-text register-copyright-text">
            Mua sắm, sửa chữa tại <br />
            <a href="https://cellphones.com.vn" target="_blank" rel="noreferrer">
              cellphones.com.vn
            </a>{" "}
            và{" "}
            <a href="https://dienthoaivui.com.vn" target="_blank" rel="noreferrer">
              dienthoaivui.com.vn
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
