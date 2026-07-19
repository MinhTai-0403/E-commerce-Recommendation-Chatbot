import { useEffect, useMemo, useState } from "react";
import GoogleAuthButton from "../GoogleAuthButton/GoogleAuthButton";
import {
  findInstitutionByEmail,
  findInstitutionByName,
  getInstitutionMeta,
  getEmailDomain,
  loadHcmcEducationInstitutions,
  searchEducationInstitutions,
} from "../../data/educationInstitutions";
import "../LoginSmember/LoginSmember.css";
import "./RegisterSmember.css";
import {
  requestEducationVerificationOtp,
  requestRegisterOtp,
  verifyEducationVerificationOtp,
  verifyRegisterOtp,
} from "../../services/apiAuth";

const EDUCATION_DETAIL = {
  title: "Ưu đãi S-Student / S-Teacher",
  description:
    "Dành cho học sinh, sinh viên, giáo viên và giảng viên có email trường hợp lệ để nhận thêm quyền lợi thành viên.",
  benefits: [
    "Nhận mã ưu đãi riêng cho nhóm S-Student/S-Teacher.",
    "Ưu đãi áp dụng khi mua điện thoại, laptop, phụ kiện theo chương trình.",
    "Tài khoản được gắn thẻ S-Student hoặc S-Teacher sau khi xác minh thành công.",
  ],
  steps: [
    "Áp dụng cho học sinh, sinh viên, giáo viên và giảng viên.",
    "Nhận quyền lợi riêng theo chương trình S-Student/S-Teacher.",
    "Ưu đãi được hiển thị trong tài khoản sau khi xác minh thành công.",
  ],
};

const BUSINESS_DETAIL = {
  title: "Ưu đãi S-Business",
  description:
    "Dành cho khách hàng doanh nghiệp cần mua số lượng lớn, xuất hóa đơn và nhận tư vấn riêng theo nhu cầu nội bộ.",
  benefits: [
    "Có thể ghi nhận thông tin công ty ngay khi đăng ký.",
    "Phù hợp mua hàng cho nhân sự, văn phòng, dự án hoặc chi nhánh.",
    "Thông tin doanh nghiệp được lưu để bộ phận kinh doanh liên hệ lại.",
  ],
  steps: [
    "Phù hợp cho khách hàng mua sắm theo nhu cầu công ty.",
    "Hỗ trợ ghi nhận thông tin doanh nghiệp khi đăng ký.",
    "Dễ dàng theo dõi quyền lợi và ưu đãi trong tài khoản.",
  ],
};

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

function BenefitDetailPanel({ type, onSelect, onClose }) {
  if (!type) return null;

  const detail = type === "business" ? BUSINESS_DETAIL : EDUCATION_DETAIL;
  const badge = type === "business" ? "S-Business" : "S-Student / S-Teacher";

  return (
    <section className="register-benefit-detail-panel">
      <div className="register-benefit-detail-head">
        <div>
          <span>{badge}</span>
          <h4>{detail.title}</h4>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng chi tiết ưu đãi">
          ×
        </button>
      </div>
      <p>{detail.description}</p>
      <div className="register-benefit-detail-grid">
        <div>
          <strong>Quyền lợi</strong>
          <ul>
            {detail.benefits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <strong>Thông tin</strong>
          <ol>
            {detail.steps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </div>
      <button type="button" className="register-benefit-select-btn" onClick={onSelect}>
        {type === "business" ? "Chọn đăng ký doanh nghiệp" : "Chọn và xác minh S-Student/S-Teacher"}
      </button>
    </section>
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
  const [educationForm, setEducationForm] = useState({
    type: "student",
    schoolName: "",
    email: "",
    studentCode: "",
  });
  const [businessForm, setBusinessForm] = useState({
    companyName: "",
    taxCode: "",
    companyEmail: "",
    contactRole: "",
  });
  const [activeDetailType, setActiveDetailType] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [registerStep, setRegisterStep] = useState("form");
  const [otp, setOtp] = useState("");
  const [educationOtp, setEducationOtp] = useState("");
  const [otpMeta, setOtpMeta] = useState(null);
  const [, setEducationOtpMeta] = useState(null);
  const [educationDirectory, setEducationDirectory] = useState([]);
  const [educationDirectoryLoading, setEducationDirectoryLoading] = useState(true);

  const isEducationCustomer = ["student", "teacher"].includes(form.customerType);
  const isBusinessCustomer = form.customerType === "business";
  const educationEmailInstitution = useMemo(
    () => findInstitutionByEmail(educationForm.email),
    [educationForm.email],
  );
  const educationNameInstitution = useMemo(
    () => findInstitutionByName(educationForm.schoolName, educationDirectory),
    [educationDirectory, educationForm.schoolName],
  );
  const educationSuggestions = useMemo(
    () => searchEducationInstitutions(educationDirectory, educationForm.schoolName),
    [educationDirectory, educationForm.schoolName],
  );

  useEffect(() => {
    let active = true;
    loadHcmcEducationInstitutions()
      .then((institutions) => {
        if (active) setEducationDirectory(institutions);
      })
      .catch(() => {
        if (active) setEducationDirectory([]);
      })
      .finally(() => {
        if (active) setEducationDirectoryLoading(false);
      });
    return () => { active = false; };
  }, []);

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

  const updateEducationForm = (field, value) => {
    setEducationForm((previous) => {
      const matchedInstitution = field === "email" ? findInstitutionByEmail(value) : null;
      return {
        ...previous,
        [field]: value,
        ...(matchedInstitution ? { schoolName: matchedInstitution.name } : {}),
      };
    });
    setErrorMessage("");
    setSuccessMessage("");
  };

  const updateBusinessForm = (field, value) => {
    setBusinessForm((previous) => ({ ...previous, [field]: value }));
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleGoogleSuccess = (payload) => {
    setErrorMessage("");
    const user = payload.data?.user || payload.user || null;
    if (onAuthSuccess) onAuthSuccess(user);
    else onBackToHome();
  };

  const selectCustomerType = (type) => {
    updateForm("customerType", form.customerType === type ? "normal" : type);
    setActiveDetailType(type);
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

    if (isEducationCustomer) {
      if (!educationForm.schoolName.trim()) return "Vui lòng nhập tên trường/cơ sở giáo dục để xác minh S-Student/S-Teacher.";
      if (!educationForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(educationForm.email.trim())) {
        return "Vui lòng nhập email trường hợp lệ để xác minh S-Student/S-Teacher.";
      }
    }

    if (isBusinessCustomer) {
      if (!businessForm.companyName.trim()) return "Vui lòng nhập tên công ty/doanh nghiệp.";
      if (!businessForm.taxCode.trim()) return "Vui lòng nhập mã số thuế hoặc mã doanh nghiệp.";
    }

    return "";
  };

  const buildRegisterPayload = () => ({
    fullName: form.fullName.trim(),
    birthday: form.birthday,
    phone: form.phone.trim(),
    email: form.email.trim(),
    password: form.password,
    customerType: form.customerType,
    educationVerification: isEducationCustomer
      ? {
          type: educationForm.type,
          schoolName: educationForm.schoolName.trim(),
          email: educationForm.email.trim(),
          studentCode: educationForm.studentCode.trim(),
          status: "pending",
        }
      : null,
    businessProfile: isBusinessCustomer
      ? {
          companyName: businessForm.companyName.trim(),
          taxCode: businessForm.taxCode.trim(),
          companyEmail: businessForm.companyEmail.trim(),
          contactRole: businessForm.contactRole.trim(),
          status: "pending",
        }
      : null,
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
      setSuccessMessage("Mã OTP đăng ký đã được gửi về email của bạn. Vui lòng kiểm tra hộp thư.");
    } catch (error) {
      console.error("Lỗi đăng ký Smember:", error);
      setErrorMessage(
        error.message || "Không thể kết nối tới hệ thống đăng ký.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const requestEducationOtpAfterRegister = async () => {
    const payload = await requestEducationVerificationOtp({
      email: educationForm.email.trim(),
      type: educationForm.type,
      schoolName: educationForm.schoolName.trim(),
    });
    setEducationOtpMeta(payload || null);
    setRegisterStep("educationOtp");
    setSuccessMessage("Tài khoản đã tạo. Tiếp tục nhập OTP đã gửi về email trường để kích hoạt S-Student/S-Teacher.");
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
      if (isEducationCustomer) {
        await requestEducationOtpAfterRegister();
        return;
      }

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

  const handleVerifyEducationOtpSubmit = async (event) => {
    event.preventDefault();

    if (!/^\d{6}$/.test(educationOtp.trim())) {
      setErrorMessage("Mã OTP email trường cần gồm 6 chữ số.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const user = await verifyEducationVerificationOtp({
        email: educationForm.email.trim(),
        otp: educationOtp.trim(),
      });
      setRegisterStep("verified");
      setSuccessMessage("Xác minh S-Student/S-Teacher thành công. Tài khoản đã được kích hoạt quyền lợi.");
      if (onAuthSuccess) {
        window.setTimeout(() => {
          onAuthSuccess(user || null);
        }, 700);
      }
    } catch (error) {
      console.error("Lỗi xác minh email trường:", error);
      setErrorMessage(error.message || "Không thể xác minh email trường.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditRegisterInfo = () => {
    setRegisterStep("form");
    setOtp("");
    setEducationOtp("");
    setOtpMeta(null);
    setEducationOtpMeta(null);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleResendEducationOtp = async () => {
    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await requestEducationOtpAfterRegister();
    } catch (error) {
      setErrorMessage(error.message || "Không thể gửi lại OTP email trường.");
    } finally {
      setIsLoading(false);
    }
  };

  const submitHandler = registerStep === "educationOtp"
    ? handleVerifyEducationOtpSubmit
    : registerStep === "otp"
      ? handleVerifyOtpSubmit
      : handleRegisterSubmit;

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
            <GoogleAuthButton
              mode="register"
              onSuccess={handleGoogleSuccess}
              onError={setErrorMessage}
              onLoadingChange={setIsLoading}
            />
            <button
              type="button"
              className="social-login-btn btn-zalo"
              onClick={() => setErrorMessage("Vui lòng đăng ký bằng email để tiếp tục.")}
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

          <form onSubmit={submitHandler} className="smember-form-element register-form-element">
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
                <label>Email nhận OTP đăng ký</label>
                <input
                  type="email"
                  placeholder="Nhập email cá nhân của bạn"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  disabled={registerStep !== "form"}
                />
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
              <article className={`register-customer-card ${isEducationCustomer ? "active" : ""}`}>
                <button
                  type="button"
                  className="register-customer-pick"
                  onClick={() => selectCustomerType("student")}
                  disabled={registerStep !== "form"}
                >
                  <strong>Tôi là Học sinh - sinh viên / Giáo viên - giảng viên</strong>
                  <span>Nhận thêm ưu đãi tới 700k/sản phẩm</span>
                </button>
                <button
                  type="button"
                  className="register-customer-detail-btn"
                  onClick={() => setActiveDetailType("education")}
                >
                  Xem chi tiết
                </button>
              </article>
              <article className={`register-customer-card ${isBusinessCustomer ? "active" : ""}`}>
                <button
                  type="button"
                  className="register-customer-pick"
                  onClick={() => selectCustomerType("business")}
                  disabled={registerStep !== "form"}
                >
                  <strong>Tôi là Khách hàng Doanh nghiệp</strong>
                  <span>Nhận quyền lợi hấp dẫn lên đến 1 triệu/đơn hàng</span>
                </button>
                <button
                  type="button"
                  className="register-customer-detail-btn"
                  onClick={() => setActiveDetailType("business")}
                >
                  Xem chi tiết
                </button>
              </article>
            </div>

            <BenefitDetailPanel
              type={activeDetailType}
              onClose={() => setActiveDetailType(null)}
              onSelect={() => {
                if (activeDetailType === "business") {
                  updateForm("customerType", "business");
                } else {
                  updateForm("customerType", educationForm.type);
                }
              }}
            />

            {isEducationCustomer && (
              <section className="register-form-section register-verification-section">
                <div className="register-section-title-row">
                  <h4>Xác minh S-Student / S-Teacher</h4>
                  <span>Bắt buộc</span>
                </div>
                <div className="register-two-column">
                  <div className="form-group-item">
                    <label>Đối tượng</label>
                    <select
                      value={educationForm.type}
                      onChange={(event) => {
                        updateEducationForm("type", event.target.value);
                        updateForm("customerType", event.target.value);
                      }}
                      disabled={registerStep !== "form"}
                    >
                      <option value="student">Học sinh / Sinh viên</option>
                      <option value="teacher">Giáo viên / Giảng viên</option>
                    </select>
                  </div>
                  <div className="form-group-item">
                    <label>Mã sinh viên/giáo viên <span className="optional-label">(nếu có)</span></label>
                    <input
                      type="text"
                      placeholder="VD: 237480201045"
                      value={educationForm.studentCode}
                      onChange={(event) => updateEducationForm("studentCode", event.target.value)}
                      disabled={registerStep !== "form"}
                    />
                  </div>
                </div>
                <div className="form-group-item">
                  <label>Tên trường / cơ sở giáo dục</label>
                  <input
                    type="text"
                    list="register-education-institutions"
                    placeholder="VD: Trường Đại học Văn Lang"
                    value={educationForm.schoolName}
                    onChange={(event) => updateEducationForm("schoolName", event.target.value)}
                    disabled={registerStep !== "form"}
                  />
                  <datalist id="register-education-institutions">
                    {educationSuggestions.map((institution) => (
                      <option
                        key={institution.id}
                        value={institution.name}
                        label={getInstitutionMeta(institution)}
                      />
                    ))}
                  </datalist>
                  <small className={educationNameInstitution ? "education-school-hint recognized" : "education-school-hint"}>
                    {educationNameInstitution
                      ? `Đã chọn ${educationNameInstitution.name}${getInstitutionMeta(educationNameInstitution) ? ` · ${getInstitutionMeta(educationNameInstitution)}` : ""}.`
                      : educationForm.schoolName.trim()
                        ? "Chưa có trường này trong danh sách; email trường vẫn sẽ được xác minh bằng OTP."
                        : educationDirectoryLoading
                          ? "Đang tải danh sách trường tại TP.HCM..."
                          : "Gõ tên, tên viết tắt hoặc chọn trường trong danh sách gợi ý."}
                  </small>
                </div>
                <div className="form-group-item">
                  <label>Email trường để nhận OTP</label>
                  <input
                    type="email"
                    placeholder="Nhập email trường của bạn"
                    value={educationForm.email}
                    onChange={(event) => updateEducationForm("email", event.target.value)}
                    disabled={registerStep !== "form"}
                  />
                  <small className={educationEmailInstitution ? "education-school-hint recognized" : "education-school-hint"}>
                    {educationEmailInstitution
                      ? `Đã nhận diện ${educationEmailInstitution.name} từ tên miền email.`
                      : educationForm.email.includes("@")
                        ? `Chưa nhận diện tên miền ${getEmailDomain(educationForm.email) || "này"}; hệ thống sẽ kiểm tra khả năng nhận OTP.`
                        : "Tên trường sẽ tự điền nếu tên miền email đã được nhận diện."}
                  </small>
                </div>
              </section>
            )}

            {isBusinessCustomer && (
              <section className="register-form-section register-verification-section business-register-section">
                <div className="register-section-title-row">
                  <h4>Thông tin khách hàng doanh nghiệp</h4>
                  <span>Ghi nhận</span>
                </div>
                <div className="form-group-item">
                  <label>Tên công ty / doanh nghiệp</label>
                  <input
                    type="text"
                    placeholder="Nhập tên công ty"
                    value={businessForm.companyName}
                    onChange={(event) => updateBusinessForm("companyName", event.target.value)}
                    disabled={registerStep !== "form"}
                  />
                </div>
                <div className="register-two-column">
                  <div className="form-group-item">
                    <label>Mã số thuế / mã doanh nghiệp</label>
                    <input
                      type="text"
                      placeholder="Nhập mã số thuế"
                      value={businessForm.taxCode}
                      onChange={(event) => updateBusinessForm("taxCode", event.target.value)}
                      disabled={registerStep !== "form"}
                    />
                  </div>
                  <div className="form-group-item">
                    <label>Chức vụ / bộ phận <span className="optional-label">(nếu có)</span></label>
                    <input
                      type="text"
                      placeholder="VD: Hành chính, IT, Mua hàng"
                      value={businessForm.contactRole}
                      onChange={(event) => updateBusinessForm("contactRole", event.target.value)}
                      disabled={registerStep !== "form"}
                    />
                  </div>
                </div>
                <div className="form-group-item">
                  <label>Email công ty <span className="optional-label">(nếu có)</span></label>
                  <input
                    type="email"
                    placeholder="Nhập email công ty"
                    value={businessForm.companyEmail}
                    onChange={(event) => updateBusinessForm("companyEmail", event.target.value)}
                    disabled={registerStep !== "form"}
                  />
                </div>
              </section>
            )}

            {registerStep === "otp" && (
              <section className="register-form-section register-otp-section">
                <h4>Xác thực email đăng ký</h4>
                <p>
                  Nhập mã OTP 6 chữ số đã gửi tới <strong>{form.email.trim()}</strong>.
                  {otpMeta?.otpExpiresMinutes ? ` Mã có hiệu lực trong ${otpMeta.otpExpiresMinutes} phút.` : ""}
                </p>
                <div className="form-group-item">
                  <label>Mã OTP đăng ký</label>
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

            {registerStep === "educationOtp" && (
              <section className="register-form-section register-otp-section education-otp-section">
                <h4>Xác minh email trường</h4>
                <p>
                  Nhập mã OTP đã gửi tới <strong>{educationForm.email.trim()}</strong> để kích hoạt quyền lợi {educationForm.type === "teacher" ? "S-Teacher" : "S-Student"}.
                </p>
                <div className="form-group-item">
                  <label>Mã OTP email trường</label>
                  <input
                    className="register-otp-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="Nhập 6 chữ số"
                    value={educationOtp}
                    onChange={(event) => setEducationOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    autoFocus
                  />
                </div>
                <button type="button" className="register-edit-info-btn" onClick={handleResendEducationOtp} disabled={isLoading}>
                  Gửi lại OTP email trường
                </button>
              </section>
            )}

            {registerStep === "verified" && (
              <section className="register-form-section register-otp-section register-verified-section">
                <h4>Hoàn tất xác thực</h4>
                <p>
                  {isEducationCustomer
                    ? "Tài khoản SMEMBER đã được tạo và quyền lợi S-Student/S-Teacher đã kích hoạt."
                    : "Tài khoản SMEMBER đã được tạo và email đã xác thực thành công."}
                </p>
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
                  : registerStep === "educationOtp"
                    ? (isLoading ? "Đang xác minh email trường..." : "Xác minh email trường")
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
