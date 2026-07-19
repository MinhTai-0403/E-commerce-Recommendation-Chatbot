const crypto = require("crypto");
const dns = require("dns").promises;
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");
const { ObjectId } = require("mongodb");
const { rateLimitOrSend } = require("../middlewares/rate-limit");

const OTP_PURPOSE_REGISTER = "register";
const OTP_PURPOSE_FORGOT_PASSWORD = "forgot_password";
const OTP_PURPOSE_EDUCATION = "education_verification";
const MAX_OTP_ATTEMPTS = 5;
const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";

let indexesReady = false;
let mailTransporter;
let googleOAuthClient;

function getAuthConfig() {
  const smtpUser = process.env.SMTP_USER || process.env.gmail || "";
  const smtpAppPassword = process.env.SMTP_APP_PASSWORD || process.env.key || "";

  return {
    usersCollection: process.env.USERS_COLLECTION || "smember_users",
    otpCollection: process.env.AUTH_OTP_COLLECTION || "smember_auth_otps",
    jwtSecret: process.env.JWT_SECRET || "",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    tokenIssuer: process.env.AUTH_TOKEN_ISSUER || "cellphones-clone",
    otpExpiresMinutes: Number(process.env.OTP_EXPIRES_MINUTES || 10),
    otpResendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60),
    authCookieName: process.env.AUTH_COOKIE_NAME || "cellphones_auth",
    authCookieSecure: String(process.env.AUTH_COOKIE_SECURE || "false").toLowerCase() === "true",
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    smtpUser,
    smtpAppPassword,
    mailFrom:
      process.env.MAIL_FROM ||
      `${process.env.MAIL_FROM_NAME || "CellphoneS Clone"} <${smtpUser}>`,
  };
}

function getGoogleOAuthClient() {
  const clientId = getAuthConfig().googleClientId;
  if (!clientId) {
    throw new Error("Missing auth environment variable: GOOGLE_CLIENT_ID");
  }
  if (!googleOAuthClient) googleOAuthClient = new OAuth2Client(clientId);
  return { client: googleOAuthClient, clientId };
}

function requireAuthSecrets() {
  const config = getAuthConfig();
  const missing = [];

  if (!config.jwtSecret) missing.push("JWT_SECRET");
  if (!config.smtpUser) missing.push("SMTP_USER");
  if (!config.smtpAppPassword) missing.push("SMTP_APP_PASSWORD");

  if (missing.length > 0) {
    throw new Error(`Missing auth environment variables: ${missing.join(", ")}`);
  }

  return config;
}

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizePhone(value = "") {
  return String(value).replace(/[^\d]/g, "");
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isEducationEmail(email = "") {
  if (!validateEmail(email)) return false;
  const domain = normalizeEmail(email).split("@")[1] || "";
  return domain.includes("edu") || domain.includes("uni");
}

async function hasMailExchange(email = "") {
  const domain = normalizeEmail(email).split("@")[1] || "";
  if (!domain) return false;

  try {
    const records = await dns.resolveMx(domain);
    return records.some((record) => cleanText(record.exchange, 255));
  } catch {
    return false;
  }
}

function sanitizeCustomerType(value = "normal") {
  return ["normal", "student", "teacher", "business"].includes(value) ? value : "normal";
}

function cleanText(value = "", maxLength = 255) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeBusinessDocument(value = "") {
  const dataUrl = String(value || "").trim();
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=]+)$/i);
  if (!match) return "";
  const estimatedBytes = Math.floor((match[2].length * 3) / 4);
  return estimatedBytes <= 2_000_000 ? dataUrl : "";
}

function validatePasswordInput(password = "") {
  if (String(password).length < 6 || !/\d/.test(String(password))) {
    return "Mật khẩu tối thiểu 6 ký tự và có ít nhất 1 chữ số.";
  }
  return "";
}

function sanitizeProfileUpdatePayload(body = {}) {
  const update = {};

  if (Object.prototype.hasOwnProperty.call(body, "fullName")) {
    const fullName = cleanText(body.fullName, 120);
    if (!fullName) return { error: "Vui lòng nhập họ và tên." };
    update.fullName = fullName;
  }

  if (Object.prototype.hasOwnProperty.call(body, "birthday")) {
    const birthday = cleanText(body.birthday, 30);
    update.birthday = birthday;
  }

  if (Object.prototype.hasOwnProperty.call(body, "gender")) {
    const gender = cleanText(body.gender, 30).toLowerCase();
    update.gender = ["male", "female", "other", ""].includes(gender) ? gender : "other";
  }

  if (Object.prototype.hasOwnProperty.call(body, "avatar")) {
    update.avatar = cleanText(body.avatar, 1_200_000);
  }

  if (Object.prototype.hasOwnProperty.call(body, "email")) {
    const email = normalizeEmail(body.email);
    if (!email || !validateEmail(email)) return { error: "Email không hợp lệ." };
    update.email = email;
    update.emailNormalized = email;
  }

  if (Object.prototype.hasOwnProperty.call(body, "phone")) {
    const phone = normalizePhone(body.phone);
    if (!/^0\d{9}$/.test(phone)) {
      return { error: "Số điện thoại cần gồm 10 chữ số và bắt đầu bằng 0." };
    }
    update.phone = phone;
    update.phoneNormalized = phone;
  }

  return { value: update };
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("base64url");

  return `pbkdf2_${PASSWORD_DIGEST}$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash = "") {
  const [algorithm, iterationsValue, salt, hash] = String(storedHash).split("$");

  if (algorithm !== `pbkdf2_${PASSWORD_DIGEST}` || !iterationsValue || !salt || !hash) {
    return false;
  }

  const iterations = Number(iterationsValue);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  const candidate = crypto
    .pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("base64url");

  const candidateBuffer = Buffer.from(candidate);
  const hashBuffer = Buffer.from(hash);

  if (candidateBuffer.length !== hashBuffer.length) return false;

  return crypto.timingSafeEqual(candidateBuffer, hashBuffer);
}

function createOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(email, otp) {
  const { jwtSecret } = requireAuthSecrets();
  return crypto
    .createHmac("sha256", jwtSecret)
    .update(`${normalizeEmail(email)}:${String(otp).trim()}`)
    .digest("hex");
}

function parseDurationToSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, value);

  const match = String(value || "7d")
    .trim()
    .match(/^(\d+)\s*([smhd])?$/i);

  if (!match) return 7 * 24 * 60 * 60;

  const amount = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  const multipliers = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };

  return amount * multipliers[unit];
}

function base64UrlJson(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signJwt(payload) {
  const config = requireAuthSecrets();
  const now = Math.floor(Date.now() / 1000);
  const expiresInSeconds = parseDurationToSeconds(config.jwtExpiresIn);
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    iss: config.tokenIssuer,
    iat: now,
    exp: now + expiresInSeconds,
    ...payload,
  };

  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(body)}`;
  const signature = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(unsigned)
    .digest("base64url");

  return `${unsigned}.${signature}`;
}

function verifyJwt(token = "") {
  const config = requireAuthSecrets();
  const parts = String(token).split(".");

  if (parts.length !== 3) return null;

  const unsigned = `${parts[0]}.${parts[1]}`;
  const expectedSignature = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(unsigned)
    .digest("base64url");

  if (
    expectedSignature.length !== parts[2].length ||
    !crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(parts[2]))
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.iss !== config.tokenIssuer) return null;
    return payload;
  } catch {
    return null;
  }
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
}

function parseCookies(header = "") {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) return cookies;
      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function getCookieToken(req) {
  const { authCookieName } = getAuthConfig();
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[authCookieName] || "";
}

function getAuthToken(req) {
  return getCookieToken(req) || getBearerToken(req);
}

function serializeAuthCookie(token = "", options = {}) {
  const config = getAuthConfig();
  const maxAge = options.maxAge ?? parseDurationToSeconds(config.jwtExpiresIn);
  const parts = [
    `${encodeURIComponent(config.authCookieName)}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (config.authCookieSecure) parts.push("Secure");

  return parts.join("; ");
}

function setAuthCookie(res, token) {
  res.setHeader("Set-Cookie", serializeAuthCookie(token));
}

function clearAuthCookie(res) {
  res.setHeader("Set-Cookie", serializeAuthCookie("", { maxAge: 0 }));
}

function getMailTransporter() {
  if (mailTransporter) return mailTransporter;

  const config = requireAuthSecrets();
  mailTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: config.smtpUser,
      pass: String(config.smtpAppPassword).replace(/\s/g, ""),
    },
  });

  return mailTransporter;
}

async function sendRegisterOtpEmail({ email, fullName, otp }) {
  const config = requireAuthSecrets();
  const safeName = fullName || "bạn";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2 style="color:#d70018;margin-bottom:8px">Xác thực đăng ký SMEMBER</h2>
      <p>Xin chào ${safeName},</p>
      <p>Mã OTP đăng ký tài khoản CellphoneS Clone của bạn là:</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:6px;color:#d70018;margin:20px 0">${otp}</div>
      <p>Mã này sẽ hết hạn sau ${config.otpExpiresMinutes} phút. Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.</p>
      <p style="color:#6b7280;font-size:13px">Email được gửi tự động, vui lòng không trả lời.</p>
    </div>
  `;

  await getMailTransporter().sendMail({
    from: config.mailFrom,
    to: email,
    subject: "Mã OTP xác thực đăng ký SMEMBER",
    text: `Mã OTP đăng ký SMEMBER của bạn là ${otp}. Mã hết hạn sau ${config.otpExpiresMinutes} phút.`,
    html,
  });
}

async function sendForgotPasswordOtpEmail({ email, fullName, otp }) {
  const config = requireAuthSecrets();
  const safeName = fullName || "bạn";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2 style="color:#d70018;margin-bottom:8px">Khôi phục mật khẩu SMEMBER</h2>
      <p>Xin chào ${safeName},</p>
      <p>Mã OTP đặt lại mật khẩu CellphoneS Clone của bạn là:</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:6px;color:#d70018;margin:20px 0">${otp}</div>
      <p>Mã này sẽ hết hạn sau ${config.otpExpiresMinutes} phút. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
      <p style="color:#6b7280;font-size:13px">Email được gửi tự động, vui lòng không trả lời.</p>
    </div>
  `;

  await getMailTransporter().sendMail({
    from: config.mailFrom,
    to: email,
    subject: "Mã OTP đặt lại mật khẩu SMEMBER",
    text: `Mã OTP đặt lại mật khẩu SMEMBER của bạn là ${otp}. Mã hết hạn sau ${config.otpExpiresMinutes} phút.`,
    html,
  });
}

async function sendEducationOtpEmail({ email, fullName, otp, verificationType }) {
  const config = requireAuthSecrets();
  const typeLabel = verificationType === "teacher" ? "giáo viên" : "sinh viên";
  const safeName = cleanText(fullName || "bạn", 120);
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2 style="color:#d70018;margin-bottom:8px">Xác minh S-Student/S-Teacher</h2>
      <p>Xin chào ${safeName},</p>
      <p>Mã OTP xác minh email ${typeLabel} của bạn là:</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:6px;color:#d70018;margin:20px 0">${otp}</div>
      <p>Mã hết hạn sau ${config.otpExpiresMinutes} phút.</p>
      <p style="color:#6b7280;font-size:13px">Email được gửi tự động, vui lòng không trả lời.</p>
    </div>
  `;

  const delivery = await getMailTransporter().sendMail({
    from: config.mailFrom,
    to: email,
    subject: `Mã OTP xác minh ${typeLabel} CellphoneS Clone`,
    text: `Mã OTP xác minh ${typeLabel} của bạn là ${otp}. Mã hết hạn sau ${config.otpExpiresMinutes} phút.`,
    html,
  });

  const accepted = Array.isArray(delivery.accepted)
    ? delivery.accepted.map(normalizeEmail)
    : [];
  if (!accepted.includes(normalizeEmail(email))) {
    throw new Error("EDUCATION_EMAIL_NOT_ACCEPTED");
  }

  return delivery;
}

async function sendNewsletterCouponEmail({ email, couponCode = "khuyenmai10" }) {
  const config = requireAuthSecrets();
  const safeCode = cleanText(couponCode, 80) || "khuyenmai10";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto">
      <div style="background:#d70018;color:#fff;padding:18px 22px;border-radius:14px 14px 0 0">
        <h2 style="margin:0;font-size:22px">CellphoneS tặng bạn mã giảm giá 10%</h2>
      </div>
      <div style="border:1px solid #fecdd3;border-top:none;padding:22px;border-radius:0 0 14px 14px;background:#fff">
        <p>Xin chào,</p>
        <p>Cảm ơn bạn đã đăng ký nhận tin khuyến mãi từ CellphoneS.</p>
        <p>Mã giảm giá của bạn là:</p>
        <div style="font-size:30px;font-weight:800;letter-spacing:2px;color:#d70018;background:#fff1f2;border:1px dashed #d70018;border-radius:12px;padding:14px 18px;text-align:center;margin:18px 0;text-transform:uppercase">
          ${safeCode}
        </div>
        <p>Nhập mã này ở bước thanh toán để nhận ưu đãi 10%.</p>
        <p style="color:#6b7280;font-size:13px">Email được gửi tự động, vui lòng không trả lời.</p>
      </div>
    </div>
  `;

  return getMailTransporter().sendMail({
    from: config.mailFrom,
    to: email,
    subject: "Mã giảm giá 10% từ CellphoneS",
    text: `Cảm ơn bạn đã đăng ký nhận tin khuyến mãi. Mã giảm giá 10% của bạn là ${safeCode}.`,
    html,
  });
}

function escapeEmailHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatInvoiceMoney(value) {
  return `${Math.max(0, Number(value || 0)).toLocaleString("vi-VN")} đ`;
}

function buildOrderInvoiceEmailHtml(order = {}) {
  const invoice = order.companyInvoice || {};
  const customer = order.customer || {};
  const receiver = order.receiver || {};
  const shippingAddress = order.shippingAddress || {};
  const totals = order.totals || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
  const createdAtText = Number.isNaN(createdAt.getTime())
    ? ""
    : createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const deliveryAddress = shippingAddress.fullAddress || [
    shippingAddress.addressLine,
    shippingAddress.ward,
    shippingAddress.district,
    shippingAddress.province,
  ].filter(Boolean).join(", ");
  const rows = items.map((item, index) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const price = Math.max(0, Number(item.currentPrice || item.price || 0));
    return `
      <tr>
        <td style="border:1px solid #e5e7eb;padding:10px;text-align:center">${index + 1}</td>
        <td style="border:1px solid #e5e7eb;padding:10px">${escapeEmailHtml(item.name || "Sản phẩm CellphoneS")}</td>
        <td style="border:1px solid #e5e7eb;padding:10px;text-align:center">${quantity}</td>
        <td style="border:1px solid #e5e7eb;padding:10px;text-align:right">${formatInvoiceMoney(price)}</td>
        <td style="border:1px solid #e5e7eb;padding:10px;text-align:right;font-weight:700">${formatInvoiceMoney(price * quantity)}</td>
      </tr>
    `;
  }).join("");

  return `<!doctype html>
  <html lang="vi">
    <head><meta charset="utf-8"><title>Hóa đơn ${escapeEmailHtml(order.orderCode || "")}</title></head>
    <body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827">
      <div style="max-width:760px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
        <div style="background:#d70018;color:#fff;padding:22px 28px">
          <h1 style="margin:0;font-size:25px">CELLPHONES</h1>
          <p style="margin:6px 0 0">Hóa đơn đặt hàng #${escapeEmailHtml(order.orderCode || "")}</p>
        </div>
        <div style="padding:26px 28px">
          <p>Xin chào <strong>${escapeEmailHtml(customer.fullName || receiver.fullName || "Quý khách")}</strong>,</p>
          <p>Bill của đơn hàng đã được tạo theo yêu cầu xuất hóa đơn và gửi đến email này.</p>

          <table style="width:100%;border-collapse:collapse;margin:18px 0">
            <tr><td style="padding:5px 0;color:#6b7280">Ngày đặt hàng</td><td style="padding:5px 0;text-align:right;font-weight:700">${escapeEmailHtml(createdAtText)}</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280">Công ty</td><td style="padding:5px 0;text-align:right;font-weight:700">${escapeEmailHtml(invoice.companyName || "")}</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280">Mã số thuế</td><td style="padding:5px 0;text-align:right;font-weight:700">${escapeEmailHtml(invoice.taxCode || "")}</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280">Địa chỉ công ty</td><td style="padding:5px 0;text-align:right;font-weight:700">${escapeEmailHtml(invoice.companyAddress || "")}</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280">Người nhận</td><td style="padding:5px 0;text-align:right;font-weight:700">${escapeEmailHtml(receiver.fullName || customer.fullName || "")}</td></tr>
            <tr><td style="padding:5px 0;color:#6b7280">Địa chỉ nhận hàng</td><td style="padding:5px 0;text-align:right;font-weight:700">${escapeEmailHtml(deliveryAddress)}</td></tr>
          </table>

          <table style="width:100%;border-collapse:collapse;margin-top:18px">
            <thead>
              <tr style="background:#f9fafb">
                <th style="border:1px solid #e5e7eb;padding:10px">STT</th>
                <th style="border:1px solid #e5e7eb;padding:10px;text-align:left">Sản phẩm</th>
                <th style="border:1px solid #e5e7eb;padding:10px">SL</th>
                <th style="border:1px solid #e5e7eb;padding:10px;text-align:right">Đơn giá</th>
                <th style="border:1px solid #e5e7eb;padding:10px;text-align:right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div style="margin:20px 0 0 auto;max-width:380px">
            <div style="display:flex;justify-content:space-between;padding:5px 0"><span>Tạm tính</span><strong>${formatInvoiceMoney(totals.subtotal)}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:5px 0"><span>Phí vận chuyển</span><strong>${formatInvoiceMoney(totals.shippingFee)}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:5px 0;color:#d70018"><span>Tổng giảm giá</span><strong>- ${formatInvoiceMoney(totals.totalDiscount)}</strong></div>
            <div style="display:flex;justify-content:space-between;border-top:2px solid #111827;margin-top:8px;padding-top:12px;font-size:20px"><span>Tổng thanh toán</span><strong style="color:#d70018">${formatInvoiceMoney(totals.total || totals.roundedTotal)}</strong></div>
          </div>

          <p style="margin-top:26px;color:#6b7280;font-size:13px">Đây là bill xác nhận thông tin đơn hàng. Hóa đơn điện tử chính thức sẽ được xử lý theo thông tin doanh nghiệp đã cung cấp.</p>
        </div>
      </div>
    </body>
  </html>`;
}

async function sendOrderInvoiceEmail({ order }) {
  const config = requireAuthSecrets();
  const invoice = order?.companyInvoice || {};
  const email = normalizeEmail(invoice.invoiceEmail || invoice.email || order?.customer?.email);
  if (!validateEmail(email)) throw new Error("INVOICE_EMAIL_INVALID");

  const orderCode = cleanText(order?.orderCode, 80) || "DON-HANG";
  const html = buildOrderInvoiceEmailHtml(order);
  const delivery = await getMailTransporter().sendMail({
    from: config.mailFrom,
    to: email,
    subject: `Bill đơn hàng ${orderCode} - CellphoneS`,
    text: `Bill đơn hàng ${orderCode} có tổng thanh toán ${formatInvoiceMoney(order?.totals?.total || order?.totals?.roundedTotal)}.`,
    html,
    attachments: [
      {
        filename: `hoa-don-${orderCode}.html`,
        content: Buffer.from(html, "utf8"),
        contentType: "text/html; charset=utf-8",
      },
    ],
  });

  const accepted = Array.isArray(delivery.accepted) ? delivery.accepted.map(normalizeEmail) : [];
  if (accepted.length && !accepted.includes(email)) throw new Error("INVOICE_EMAIL_NOT_ACCEPTED");
  return delivery;
}

async function ensureAuthIndexes(db) {
  if (indexesReady) return;

  const config = getAuthConfig();
  const users = db.collection(config.usersCollection);
  const otps = db.collection(config.otpCollection);

  await Promise.all([
    users.createIndex(
      { usernameNormalized: 1 },
      { unique: true, sparse: true, name: "unique_user_username" }
    ),
    users.createIndex(
      { emailNormalized: 1 },
      { unique: true, sparse: true, name: "unique_user_email" }
    ),
    users.createIndex(
      { phoneNormalized: 1 },
      { unique: true, sparse: true, name: "unique_user_phone" }
    ),
    users.createIndex(
      { googleSub: 1 },
      { unique: true, sparse: true, name: "unique_user_google_sub" }
    ),
    users.createIndex(
      { "educationVerification.emailNormalized": 1 },
      { unique: true, sparse: true, name: "unique_education_email" }
    ),
    users.createIndex(
      { "businessVerification.taxCode": 1 },
      {
        unique: true,
        name: "unique_business_tax_code",
        partialFilterExpression: { "businessVerification.taxCode": { $type: "string" } },
      }
    ),
    users.createIndex(
      { "businessVerification.emailNormalized": 1 },
      {
        unique: true,
        name: "unique_business_email",
        partialFilterExpression: { "businessVerification.emailNormalized": { $type: "string" } },
      }
    ),
    otps.createIndex({ emailNormalized: 1, purpose: 1 }, { name: "otp_email_purpose" }),
    otps.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "otp_expiry_ttl" }),
  ]);

  indexesReady = true;
}

async function getAuthCollections(getDb) {
  const { db } = await getDb();
  const config = getAuthConfig();
  await ensureAuthIndexes(db);

  return {
    config,
    users: db.collection(config.usersCollection),
    otps: db.collection(config.otpCollection),
  };
}

async function syncDefaultAdminUser(users) {
  const username = String(process.env.ADMIN_USERNAME || "").trim();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const allowDevFallback =
    process.env.NODE_ENV !== "production" &&
    String(process.env.ALLOW_DEV_ADMIN_FALLBACK || "false").toLowerCase() === "true";

  if (!username || !password) {
    if (!allowDevFallback) return null;
  }

  const adminUsername = username || "admin";
  const adminPassword = password || "admin123";
  const usernameNormalized = normalizeEmail(adminUsername);
  const email = process.env.ADMIN_EMAIL || "admin@cellphones.local";
  const emailNormalized = normalizeEmail(email);
  const now = new Date();
  const existing = await users.findOne({
    $or: [
      { usernameNormalized },
      { emailNormalized },
    ],
  });

  const update = {
    username: adminUsername,
    usernameNormalized,
    fullName: "Admin CellphoneS",
    email,
    emailNormalized,
    passwordHash: createPasswordHash(adminPassword),
    role: "admin",
    status: "active",
    customerType: "normal",
    emailVerified: true,
    updatedAt: now,
  };

  if (existing) {
    await users.updateOne({ _id: existing._id }, { $set: update });
    return existing._id;
  }

  const result = await users.insertOne({
    ...update,
    createdAt: now,
    lastLoginAt: null,
  });

  return result.insertedId;
}

function buildMemberRank(totalSpent = 0) {
  if (totalSpent >= 20000000) return "S-VIP";
  if (totalSpent >= 3000000) return "S-MEM";
  return "S-NEW";
}

function isMemberStatsPaymentEligible(order = {}) {
  const paymentStatus = String(order.payment?.status || order.paymentStatus || "").trim().toLowerCase();
  const paymentMethod = String(order.payment?.method || order.paymentMethod || "").trim().toLowerCase();

  if (["failed", "refunded", "cancelled"].includes(paymentStatus)) return false;

  if (["bank_qr", "bank-qr", "vietqr", "qr", "bank_transfer", "bank-transfer"].includes(paymentMethod)) {
    return ["paid", "completed", "success", "succeeded"].includes(paymentStatus);
  }

  return true;
}

async function computeUserMemberStats(getDb, user = {}) {
  const fallback = {
    totalSpent: 0,
    totalOrders: 0,
    points: 0,
    memberRank: "S-NEW",
    nextRankSpent: 3000000,
    remainingToNextRank: 3000000,
  };

  try {
    const { orders } = await getDb();
    if (!orders) return fallback;

    const userId = String(user._id || user.id || "");

    // Chỉ tính đơn của đúng tài khoản đã đăng nhập.
    // Không gom theo email/SĐT để tránh lấy nhầm đơn test/đơn guest.
    if (!userId) return fallback;

    const docs = await orders
      .find({
        userId,
        status: "completed",
      })
      .project({
        totals: 1,
        status: 1,
        payment: 1,
        paymentStatus: 1,
        paymentMethod: 1,
      })
      .toArray();

    const eligibleDocs = docs.filter(isMemberStatsPaymentEligible);

    const totalSpent = eligibleDocs.reduce((sum, order) => {
      const total = Number(order.totals?.total || order.totals?.roundedTotal || 0);
      return sum + Math.max(0, total);
    }, 0);

    const totalOrders = eligibleDocs.length;
    const points = Math.floor(totalSpent / 100000);
    const memberRank = buildMemberRank(totalSpent);
    const nextRankSpent =
      memberRank === "S-NEW"
        ? 3000000
        : memberRank === "S-MEM"
          ? 20000000
          : null;

    return {
      totalSpent,
      totalOrders,
      points,
      memberRank,
      nextRankSpent,
      remainingToNextRank: nextRankSpent ? Math.max(0, nextRankSpent - totalSpent) : 0,
    };
  } catch {
    return fallback;
  }
}

function publicBusinessVerification(value = null) {
  if (!value || typeof value !== "object") return null;
  const { registrationDocument, ...safeValue } = value;
  return safeValue;
}

function publicUser(user, memberStats = null) {
  return {
    id: String(user._id || user.id),
    username: user.username,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    birthday: user.birthday,
    gender: user.gender || "",
    avatar: user.avatar || "",
    customerType: user.customerType || "normal",
    role: user.role || "customer",
    status: user.status || "active",
    emailVerified: Boolean(user.emailVerified),
    educationVerification: user.educationVerification || null,
    businessVerification: publicBusinessVerification(user.businessVerification),
    memberTags: Array.isArray(user.memberTags) ? user.memberTags : [],
    ...(memberStats || {}),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

async function getAuthenticatedUser(req, getDb) {
  const payload = verifyJwt(getAuthToken(req));
  if (!payload?.sub || !ObjectId.isValid(payload.sub)) return null;
  const { users } = await getAuthCollections(getDb);
  return users.findOne({ _id: new ObjectId(payload.sub), status: { $ne: "blocked" } });
}

async function handleRequestEducationOtp({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  requireAuthSecrets();
  const user = await getAuthenticatedUser(req, getDb);
  if (!user) {
    sendError(res, 401, "Vui lòng đăng nhập Smember trước khi xác minh.");
    return;
  }

  const body = await parseJsonBody(req);
  const email = normalizeEmail(body.email);
  const verificationType = body.type === "teacher" ? "teacher" : "student";
  const schoolName = cleanText(body.schoolName, 180);

  if (!isEducationEmail(email)) {
    sendError(res, 400, "Email trường không hợp lệ. Vui lòng kiểm tra lại email trường.");
    return;
  }
  if (!(await hasMailExchange(email))) {
    sendError(res, 400, "Tên miền email trường không tồn tại hoặc không thể nhận email. Vui lòng dùng email trường thật.");
    return;
  }
  if (!schoolName) {
    sendError(res, 400, "Vui lòng nhập tên trường hoặc cơ sở giáo dục.");
    return;
  }
  if (!rateLimitOrSend({
    req,
    res,
    sendError,
    scope: "auth:education-otp",
    identifier: `${user._id}:${email}`,
    message: "Bạn yêu cầu OTP xác minh quá nhanh. Vui lòng thử lại sau ít phút.",
  })) return;

  const { config, users, otps } = await getAuthCollections(getDb);
  const duplicate = await users.findOne({
    _id: { $ne: user._id },
    "educationVerification.emailNormalized": email,
    "educationVerification.status": "verified",
  });
  if (duplicate) {
    sendError(res, 409, "Email trường này đã được xác minh cho tài khoản khác.");
    return;
  }

  const now = new Date();
  const existingOtp = await otps.findOne({
    userId: String(user._id),
    purpose: OTP_PURPOSE_EDUCATION,
    expiresAt: { $gt: now },
  });
  if (existingOtp?.lastSentAt) {
    const elapsed = (Date.now() - new Date(existingOtp.lastSentAt).getTime()) / 1000;
    if (elapsed < config.otpResendCooldownSeconds) {
      sendError(res, 429, `Vui lòng chờ ${Math.ceil(config.otpResendCooldownSeconds - elapsed)} giây trước khi gửi lại OTP.`);
      return;
    }
  }

  const otp = createOtp();
  const expiresAt = new Date(Date.now() + config.otpExpiresMinutes * 60 * 1000);
  await otps.updateOne(
    { userId: String(user._id), purpose: OTP_PURPOSE_EDUCATION },
    {
      $set: {
        userId: String(user._id),
        email,
        emailNormalized: email,
        purpose: OTP_PURPOSE_EDUCATION,
        otpHash: hashOtp(email, otp),
        attempts: 0,
        profile: { verificationType, schoolName },
        expiresAt,
        lastSentAt: now,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  try {
    await sendEducationOtpEmail({
      email,
      fullName: user.fullName,
      otp,
      verificationType,
    });
  } catch (error) {
    await otps.deleteOne({ userId: String(user._id), purpose: OTP_PURPOSE_EDUCATION });
    console.error(`[education-otp] Không thể gửi OTP tới ${email}:`, error?.message || error);
    sendError(res, 502, "Không thể gửi OTP tới email này. Vui lòng kiểm tra lại địa chỉ email hoặc thử lại sau.");
    return;
  }
  authSuccess(res, sendJson, 200, "OTP xác minh đã được gửi về email trường.", {
    data: { email, type: verificationType, schoolName, expiresAt },
  });
}

async function handleVerifyEducationOtp({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  requireAuthSecrets();
  const user = await getAuthenticatedUser(req, getDb);
  if (!user) {
    sendError(res, 401, "Vui lòng đăng nhập Smember trước khi xác minh.");
    return;
  }

  const body = await parseJsonBody(req);
  const email = normalizeEmail(body.email);
  const otp = String(body.otp || "").trim();
  if (!isEducationEmail(email) || !/^\d{6}$/.test(otp)) {
    sendError(res, 400, "Email trường hoặc mã OTP không hợp lệ.");
    return;
  }
  if (!rateLimitOrSend({
    req,
    res,
    sendError,
    scope: "auth:education-verify",
    identifier: `${user._id}:${email}`,
    message: "Bạn xác minh OTP quá nhanh. Vui lòng thử lại sau ít phút.",
  })) return;

  const { users, otps } = await getAuthCollections(getDb);
  const now = new Date();
  const otpDoc = await otps.findOne({
    userId: String(user._id),
    emailNormalized: email,
    purpose: OTP_PURPOSE_EDUCATION,
    expiresAt: { $gt: now },
  });
  if (!otpDoc) {
    sendError(res, 400, "OTP đã hết hạn hoặc không tồn tại.");
    return;
  }
  if (Number(otpDoc.attempts || 0) >= MAX_OTP_ATTEMPTS) {
    sendError(res, 429, "Bạn đã nhập sai OTP quá nhiều lần. Vui lòng gửi mã mới.");
    return;
  }
  if (otpDoc.otpHash !== hashOtp(email, otp)) {
    await otps.updateOne({ _id: otpDoc._id }, { $inc: { attempts: 1 }, $set: { updatedAt: now } });
    sendError(res, 400, "Mã OTP không chính xác.");
    return;
  }

  const verificationType = otpDoc.profile?.verificationType === "teacher" ? "teacher" : "student";
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  const educationVerification = {
    provider: "internal_school_email",
    status: "verified",
    type: verificationType,
    email,
    emailNormalized: email,
    schoolName: cleanText(otpDoc.profile?.schoolName, 180),
    verifiedAt: now,
    expiresAt,
  };
  const memberTag = verificationType === "teacher" ? "S-Teacher" : "S-Student";
  const result = await users.findOneAndUpdate(
    { _id: user._id },
    {
      $set: {
        customerType: verificationType,
        educationVerification,
        updatedAt: now,
      },
      $addToSet: { memberTags: memberTag },
    },
    { returnDocument: "after" }
  );
  await otps.deleteOne({ _id: otpDoc._id });
  const updatedUser = result?.value || result;
  authSuccess(res, sendJson, 200, `Xác minh ${memberTag} thành công.`, {
    data: { user: publicUser(updatedUser, await computeUserMemberStats(getDb, updatedUser)) },
  });
}

async function handleSubmitBusinessVerification({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  const user = await getAuthenticatedUser(req, getDb);
  if (!user) {
    sendError(res, 401, "Vui lòng đăng nhập Smember trước khi gửi hồ sơ doanh nghiệp.");
    return;
  }

  if (user.businessVerification?.status === "verified") {
    sendError(res, 409, "Tài khoản đã được xác minh S-Business.");
    return;
  }

  const body = await parseJsonBody(req);
  const companyName = cleanText(body.companyName, 180);
  const taxCode = cleanText(body.taxCode, 20).replace(/[^\d-]/g, "");
  const companyAddress = cleanText(body.companyAddress, 320);
  const representativeName = cleanText(body.representativeName || user.fullName, 120);
  const position = cleanText(body.position, 120);
  const email = normalizeEmail(body.email || body.businessEmail);
  const phone = normalizePhone(body.phone || body.businessPhone);
  const registrationDocument = sanitizeBusinessDocument(body.registrationDocument);

  if (companyName.length < 2) {
    sendError(res, 400, "Vui lòng nhập tên doanh nghiệp.");
    return;
  }
  if (!/^\d{10}(?:-\d{3})?$/.test(taxCode)) {
    sendError(res, 400, "Mã số thuế cần gồm 10 chữ số hoặc 10 chữ số kèm mã đơn vị 3 chữ số.");
    return;
  }
  if (companyAddress.length < 5) {
    sendError(res, 400, "Vui lòng nhập địa chỉ trụ sở doanh nghiệp.");
    return;
  }
  if (representativeName.length < 2 || position.length < 2) {
    sendError(res, 400, "Vui lòng nhập người đại diện và chức vụ.");
    return;
  }
  if (!validateEmail(email)) {
    sendError(res, 400, "Email doanh nghiệp không hợp lệ.");
    return;
  }
  if (!/^0\d{9}$/.test(phone)) {
    sendError(res, 400, "Số điện thoại doanh nghiệp cần gồm 10 chữ số và bắt đầu bằng 0.");
    return;
  }
  if (!registrationDocument) {
    sendError(res, 400, "Vui lòng tải ảnh Giấy chứng nhận đăng ký doanh nghiệp hợp lệ.");
    return;
  }
  if (!rateLimitOrSend({
    req,
    res,
    sendError,
    scope: "auth:business-submit",
    identifier: `${user._id}:${taxCode}:${email}`,
    message: "Bạn gửi hồ sơ quá nhanh. Vui lòng thử lại sau ít phút.",
  })) return;

  const { users } = await getAuthCollections(getDb);
  const duplicate = await users.findOne({
    _id: { $ne: user._id },
    $or: [
      { "businessVerification.taxCode": taxCode },
      { "businessVerification.emailNormalized": email },
    ],
    "businessVerification.status": { $in: ["pending", "verified"] },
  });
  if (duplicate) {
    sendError(res, 409, "Mã số thuế hoặc email doanh nghiệp đã được sử dụng trong hồ sơ khác.");
    return;
  }

  const now = new Date();
  const businessVerification = {
    provider: "manual_admin_review",
    status: "pending",
    companyName,
    taxCode,
    companyAddress,
    representativeName,
    position,
    email,
    emailNormalized: email,
    phone,
    registrationDocument,
    submittedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: "",
  };

  try {
    const result = await users.findOneAndUpdate(
      { _id: user._id },
      {
        $set: {
          businessVerification,
          updatedAt: now,
        },
        $pull: { memberTags: "S-Business" },
      },
      { returnDocument: "after" }
    );
    const updatedUser = result?.value || result;

    authSuccess(res, sendJson, 200, "Hồ sơ doanh nghiệp đã được gửi và đang chờ admin duyệt.", {
      data: { user: publicUser(updatedUser, await computeUserMemberStats(getDb, updatedUser)) },
    });
  } catch (error) {
    if (error?.code === 11000) {
      sendError(res, 409, "Mã số thuế hoặc email doanh nghiệp đã được sử dụng trong hồ sơ khác.");
      return;
    }
    throw error;
  }
}

function authSuccess(res, sendJson, statusCode, message, data = {}) {
  sendJson(res, statusCode, {
    ok: true,
    message,
    ...data,
  });
}

function validateRegisterPayload(body) {
  const fullName = String(body.fullName || "").trim();
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const birthday = String(body.birthday || "").trim();
  const password = String(body.password || "");
  const customerType = sanitizeCustomerType(body.customerType);

  if (!fullName) return { error: "Vui lòng nhập họ và tên." };
  if (!birthday) return { error: "Vui lòng chọn ngày sinh." };
  if (!/^0\d{9}$/.test(phone)) {
    return { error: "Số điện thoại cần gồm 10 chữ số và bắt đầu bằng 0." };
  }
  if (!email || !validateEmail(email)) {
    return { error: "Vui lòng nhập email hợp lệ để nhận mã OTP." };
  }
  if (password.length < 6 || !/\d/.test(password)) {
    return { error: "Mật khẩu tối thiểu 6 ký tự và có ít nhất 1 chữ số." };
  }

  return {
    value: {
      fullName,
      email,
      emailNormalized: email,
      phone,
      phoneNormalized: phone,
      birthday,
      password,
      customerType,
    },
  };
}

async function handleRequestRegisterOtp({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  requireAuthSecrets();

  const body = await parseJsonBody(req);
  const parsed = validateRegisterPayload(body);

  if (parsed.error) {
    sendError(res, 400, parsed.error);
    return;
  }

  const payload = parsed.value;
  if (
    !rateLimitOrSend({
      req,
      res,
      sendError,
      scope: "auth:request-register-otp",
      identifier: payload.emailNormalized,
      message: "Bạn yêu cầu OTP quá nhanh. Vui lòng thử lại sau ít phút.",
    })
  ) {
    return;
  }

  const { config, users, otps } = await getAuthCollections(getDb);
  const existingUser = await users.findOne({
    $or: [
      { emailNormalized: payload.emailNormalized },
      { phoneNormalized: payload.phoneNormalized },
    ],
  });

  if (existingUser) {
    sendError(res, 409, "Email hoặc số điện thoại đã được đăng ký.");
    return;
  }

  const now = new Date();
  const latestOtp = await otps.findOne({
    emailNormalized: payload.emailNormalized,
    purpose: OTP_PURPOSE_REGISTER,
    expiresAt: { $gt: now },
  });

  if (latestOtp?.lastSentAt) {
    const secondsSinceLastSend = (Date.now() - new Date(latestOtp.lastSentAt).getTime()) / 1000;
    if (secondsSinceLastSend < config.otpResendCooldownSeconds) {
      sendError(
        res,
        429,
        `Vui lòng chờ ${Math.ceil(config.otpResendCooldownSeconds - secondsSinceLastSend)} giây trước khi gửi lại OTP.`
      );
      return;
    }
  }

  const otp = createOtp();
  const expiresAt = new Date(Date.now() + config.otpExpiresMinutes * 60 * 1000);
  const passwordHash = createPasswordHash(payload.password);
  const pendingProfile = {
    fullName: payload.fullName,
    email: payload.email,
    emailNormalized: payload.emailNormalized,
    phone: payload.phone,
    phoneNormalized: payload.phoneNormalized,
    birthday: payload.birthday,
    customerType: payload.customerType,
    passwordHash,
  };

  await otps.updateOne(
    { emailNormalized: payload.emailNormalized, purpose: OTP_PURPOSE_REGISTER },
    {
      $set: {
        email: payload.email,
        emailNormalized: payload.emailNormalized,
        purpose: OTP_PURPOSE_REGISTER,
        otpHash: hashOtp(payload.emailNormalized, otp),
        profile: pendingProfile,
        attempts: 0,
        expiresAt,
        lastSentAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  await sendRegisterOtpEmail({
    email: payload.email,
    fullName: payload.fullName,
    otp,
  });

  authSuccess(res, sendJson, 200, "Mã OTP đã được gửi về email của bạn.", {
    data: {
      email: payload.email,
      expiresAt,
      otpExpiresMinutes: config.otpExpiresMinutes,
    },
  });
}

async function handleVerifyRegisterOtp({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  requireAuthSecrets();

  const body = await parseJsonBody(req);
  const email = normalizeEmail(body.email);
  const otp = String(body.otp || "").trim();

  if (!validateEmail(email)) {
    sendError(res, 400, "Email nhận OTP không hợp lệ.");
    return;
  }

  if (!/^\d{6}$/.test(otp)) {
    sendError(res, 400, "Mã OTP cần gồm 6 chữ số.");
    return;
  }

  if (
    !rateLimitOrSend({
      req,
      res,
      sendError,
      scope: "auth:verify-register-otp",
      identifier: email,
      message: "Bạn xác thực OTP quá nhanh. Vui lòng thử lại sau ít phút.",
    })
  ) {
    return;
  }

  const { users, otps } = await getAuthCollections(getDb);
  const now = new Date();
  const otpDoc = await otps.findOne({
    emailNormalized: email,
    purpose: OTP_PURPOSE_REGISTER,
    expiresAt: { $gt: now },
  });

  if (!otpDoc) {
    sendError(res, 400, "Mã OTP đã hết hạn hoặc không tồn tại.");
    return;
  }

  if (Number(otpDoc.attempts || 0) >= MAX_OTP_ATTEMPTS) {
    sendError(res, 429, "Bạn đã nhập sai OTP quá nhiều lần. Vui lòng gửi lại mã mới.");
    return;
  }

  if (otpDoc.otpHash !== hashOtp(email, otp)) {
    await otps.updateOne({ _id: otpDoc._id }, { $inc: { attempts: 1 }, $set: { updatedAt: now } });
    sendError(res, 400, "Mã OTP không chính xác.");
    return;
  }

  const profile = otpDoc.profile || {};
  const existingUser = await users.findOne({
    $or: [
      { emailNormalized: profile.emailNormalized },
      { phoneNormalized: profile.phoneNormalized },
    ],
  });

  if (existingUser) {
    await otps.deleteOne({ _id: otpDoc._id });
    sendError(res, 409, "Email hoặc số điện thoại đã được đăng ký.");
    return;
  }

  const user = {
    fullName: profile.fullName,
    email: profile.email,
    emailNormalized: profile.emailNormalized,
    phone: profile.phone,
    phoneNormalized: profile.phoneNormalized,
    birthday: profile.birthday,
    customerType: sanitizeCustomerType(profile.customerType),
    passwordHash: profile.passwordHash,
    emailVerified: true,
    role: "customer",
    status: "active",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };

  const result = await users.insertOne(user);
  user._id = result.insertedId;
  await otps.deleteOne({ _id: otpDoc._id });

  const token = signJwt({
    sub: String(user._id),
    role: user.role,
    email: user.email,
    phone: user.phone,
  });

  setAuthCookie(res, token);
  authSuccess(res, sendJson, 201, "Đăng ký và xác thực email thành công.", {
    token,
    data: {
      token,
      user: publicUser(user, await computeUserMemberStats(getDb, user)),
    },
  });
}

async function handleLogin({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  requireAuthSecrets();

  const body = await parseJsonBody(req);
  const identifier = String(body.identifier || body.email || body.phone || "").trim();
  const password = String(body.password || "");

  if (!identifier || !password) {
    sendError(res, 400, "Vui lòng nhập email/số điện thoại và mật khẩu.");
    return;
  }

  if (
    !rateLimitOrSend({
      req,
      res,
      sendError,
      scope: "auth:login",
      identifier,
      message: "Bạn đăng nhập sai hoặc thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
    })
  ) {
    return;
  }

  const { users } = await getAuthCollections(getDb);
  const isEmail = identifier.includes("@");
  const normalizedPhone = normalizePhone(identifier);
  const allowDevAdminFallback =
    process.env.NODE_ENV !== "production" &&
    String(process.env.ALLOW_DEV_ADMIN_FALLBACK || "false").toLowerCase() === "true";
  const adminUsername = normalizeEmail(process.env.ADMIN_USERNAME || (allowDevAdminFallback ? "admin" : ""));
  let query;

  if (isEmail) {
    query = { emailNormalized: normalizeEmail(identifier) };
  } else if (/^0\d{9}$/.test(normalizedPhone)) {
    query = { phoneNormalized: normalizedPhone };
  } else {
    const usernameNormalized = normalizeEmail(identifier);
    if (usernameNormalized === adminUsername) {
      await syncDefaultAdminUser(users);
    }
    query = { usernameNormalized };
  }

  const user = await users.findOne(query);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    sendError(res, 401, "Tài khoản hoặc mật khẩu không chính xác.");
    return;
  }

  if (user.status && user.status !== "active") {
    sendError(res, 403, "Tài khoản đang bị khóa hoặc chưa được kích hoạt.");
    return;
  }

  const now = new Date();
  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now, updatedAt: now } });
  user.lastLoginAt = now;
  user.updatedAt = now;

  const token = signJwt({
    sub: String(user._id),
    role: user.role || "customer",
    username: user.username,
    email: user.email,
    phone: user.phone,
  });

  setAuthCookie(res, token);
  authSuccess(res, sendJson, 200, "Đăng nhập thành công.", {
    token,
    data: {
      token,
      user: publicUser(user, await computeUserMemberStats(getDb, user)),
    },
  });
}

async function handleGoogleLogin({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  requireAuthSecrets();

  const body = await parseJsonBody(req);
  const credential = cleanText(body.credential, 10_000);
  if (!credential) {
    sendError(res, 400, "Thiếu thông tin xác thực từ Google.");
    return;
  }

  if (
    !rateLimitOrSend({
      req,
      res,
      sendError,
      scope: "auth:google",
      identifier: req.socket?.remoteAddress || "google",
      message: "Bạn đăng nhập Google quá nhanh. Vui lòng thử lại sau ít phút.",
    })
  ) {
    return;
  }

  let googleProfile;
  try {
    const { client, clientId } = getGoogleOAuthClient();
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    googleProfile = ticket.getPayload();
  } catch {
    sendError(res, 401, "Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn.");
    return;
  }

  const googleSub = cleanText(googleProfile?.sub, 255);
  const email = normalizeEmail(googleProfile?.email);
  if (!googleSub || !validateEmail(email) || googleProfile?.email_verified !== true) {
    sendError(res, 401, "Google chưa xác minh được địa chỉ email của tài khoản này.");
    return;
  }

  const { users } = await getAuthCollections(getDb);
  const now = new Date();
  let isNewUser = false;
  let user = await users.findOne({
    $or: [{ googleSub }, { emailNormalized: email }],
  });

  if (user?.status && user.status !== "active") {
    sendError(res, 403, "Tài khoản đang bị khóa hoặc chưa được kích hoạt.");
    return;
  }

  if (!user) {
    const newUser = {
      fullName: cleanText(googleProfile.name, 120) || email.split("@")[0],
      email,
      emailNormalized: email,
      avatar: cleanText(googleProfile.picture, 1_500),
      googleSub,
      authProviders: ["google"],
      customerType: "normal",
      emailVerified: true,
      role: "customer",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    try {
      const result = await users.insertOne(newUser);
      newUser._id = result.insertedId;
      user = newUser;
      isNewUser = true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      user = await users.findOne({ $or: [{ googleSub }, { emailNormalized: email }] });
    }
  }

  if (!user) {
    sendError(res, 409, "Không thể liên kết tài khoản Google. Vui lòng thử lại.");
    return;
  }

  const update = {
    googleSub,
    emailVerified: true,
    lastLoginAt: now,
    updatedAt: now,
  };
  if (!user.avatar && googleProfile.picture) update.avatar = cleanText(googleProfile.picture, 1_500);
  if (!user.fullName && googleProfile.name) update.fullName = cleanText(googleProfile.name, 120);

  await users.updateOne(
    { _id: user._id },
    {
      $set: update,
      $addToSet: { authProviders: "google" },
    }
  );
  user = await users.findOne({ _id: user._id });

  const token = signJwt({
    sub: String(user._id),
    role: user.role || "customer",
    email: user.email,
    phone: user.phone,
  });

  setAuthCookie(res, token);
  authSuccess(res, sendJson, 200, "Đăng nhập Google thành công.", {
    token,
    data: {
      token,
      user: publicUser(user, await computeUserMemberStats(getDb, user)),
      isNewUser,
    },
  });
}

async function handleMe({ req, res, sendJson, sendError, getDb }) {
  const token = getAuthToken(req);
  const payload = verifyJwt(token);

  if (!payload?.sub || !ObjectId.isValid(payload.sub)) {
    sendError(res, 401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
    return;
  }

  const { users } = await getAuthCollections(getDb);
  const user = await users.findOne({ _id: new ObjectId(payload.sub) });

  if (!user) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }

  authSuccess(res, sendJson, 200, "Lấy thông tin người dùng thành công.", {
    data: {
      user: publicUser(user, await computeUserMemberStats(getDb, user)),
    },
  });
}

async function handleUpdateMe({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  const token = getAuthToken(req);
  const payload = verifyJwt(token);

  if (!payload?.sub || !ObjectId.isValid(payload.sub)) {
    sendError(res, 401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
    return;
  }

  const parsed = sanitizeProfileUpdatePayload(await parseJsonBody(req));
  if (parsed.error) {
    sendError(res, 400, parsed.error);
    return;
  }

  const update = parsed.value || {};
  if (!Object.keys(update).length) {
    sendError(res, 400, "Không có thông tin nào để cập nhật.");
    return;
  }

  const { users } = await getAuthCollections(getDb);
  const userId = new ObjectId(payload.sub);
  const user = await users.findOne({ _id: userId });
  if (!user) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }

  const duplicateConditions = [];
  if (update.emailNormalized && update.emailNormalized !== user.emailNormalized) {
    duplicateConditions.push({ emailNormalized: update.emailNormalized });
    update.emailVerified = false;
  }
  if (update.phoneNormalized && update.phoneNormalized !== user.phoneNormalized) {
    duplicateConditions.push({ phoneNormalized: update.phoneNormalized });
  }

  if (duplicateConditions.length) {
    const duplicate = await users.findOne({
      _id: { $ne: userId },
      $or: duplicateConditions,
    });
    if (duplicate) {
      sendError(res, 409, "Email hoặc số điện thoại đã được tài khoản khác sử dụng.");
      return;
    }
  }

  update.updatedAt = new Date();
  const result = await users.findOneAndUpdate(
    { _id: userId },
    { $set: update },
    { returnDocument: "after" }
  );
  const updatedUser = result?.value || result;
  authSuccess(res, sendJson, 200, "Cập nhật thông tin tài khoản thành công.", {
    data: {
      user: publicUser(updatedUser, await computeUserMemberStats(getDb, updatedUser)),
    },
  });
}

async function handleChangePassword({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  const token = getAuthToken(req);
  const payload = verifyJwt(token);

  if (!payload?.sub || !ObjectId.isValid(payload.sub)) {
    sendError(res, 401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
    return;
  }

  const body = await parseJsonBody(req);
  const currentPassword = String(body.currentPassword || body.oldPassword || "");
  const newPassword = String(body.newPassword || body.password || "");
  const passwordError = validatePasswordInput(newPassword);

  if (!currentPassword) {
    sendError(res, 400, "Vui lòng nhập mật khẩu hiện tại.");
    return;
  }
  if (passwordError) {
    sendError(res, 400, passwordError);
    return;
  }
  if (currentPassword === newPassword) {
    sendError(res, 400, "Mật khẩu mới cần khác mật khẩu hiện tại.");
    return;
  }

  if (
    !rateLimitOrSend({
      req,
      res,
      sendError,
      scope: "auth:change-password",
      identifier: payload.sub,
      message: "Bạn đổi mật khẩu quá nhanh. Vui lòng thử lại sau ít phút.",
    })
  ) {
    return;
  }

  const { users } = await getAuthCollections(getDb);
  const user = await users.findOne({ _id: new ObjectId(payload.sub) });
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    sendError(res, 401, "Mật khẩu hiện tại không chính xác.");
    return;
  }

  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash: createPasswordHash(newPassword),
        updatedAt: new Date(),
      },
    }
  );

  authSuccess(res, sendJson, 200, "Đổi mật khẩu thành công.", {
    data: { changed: true },
  });
}

async function handleRequestForgotPasswordOtp({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  requireAuthSecrets();
  const body = await parseJsonBody(req);
  const identifier = String(body.identifier || body.email || body.phone || "").trim();

  if (!identifier) {
    sendError(res, 400, "Vui lòng nhập email hoặc số điện thoại.");
    return;
  }

  if (
    !rateLimitOrSend({
      req,
      res,
      sendError,
      scope: "auth:forgot-password-otp",
      identifier,
      message: "Bạn yêu cầu OTP quá nhanh. Vui lòng thử lại sau ít phút.",
    })
  ) {
    return;
  }

  const { config, users, otps } = await getAuthCollections(getDb);
  const query = identifier.includes("@")
    ? { emailNormalized: normalizeEmail(identifier) }
    : { phoneNormalized: normalizePhone(identifier) };
  const user = await users.findOne(query);

  if (!user?.email || !validateEmail(user.email)) {
    sendError(res, 404, "Không tìm thấy tài khoản có email để gửi OTP.");
    return;
  }

  const now = new Date();
  const emailNormalized = normalizeEmail(user.email);
  const latestOtp = await otps.findOne({
    emailNormalized,
    purpose: OTP_PURPOSE_FORGOT_PASSWORD,
    expiresAt: { $gt: now },
  });

  if (latestOtp?.lastSentAt) {
    const secondsSinceLastSend = (Date.now() - new Date(latestOtp.lastSentAt).getTime()) / 1000;
    if (secondsSinceLastSend < config.otpResendCooldownSeconds) {
      sendError(
        res,
        429,
        `Vui lòng chờ ${Math.ceil(config.otpResendCooldownSeconds - secondsSinceLastSend)} giây trước khi gửi lại OTP.`
      );
      return;
    }
  }

  const otp = createOtp();
  const expiresAt = new Date(Date.now() + config.otpExpiresMinutes * 60 * 1000);
  await otps.updateOne(
    { emailNormalized, purpose: OTP_PURPOSE_FORGOT_PASSWORD },
    {
      $set: {
        email: user.email,
        emailNormalized,
        purpose: OTP_PURPOSE_FORGOT_PASSWORD,
        userId: String(user._id),
        otpHash: hashOtp(emailNormalized, otp),
        attempts: 0,
        expiresAt,
        lastSentAt: now,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  await sendForgotPasswordOtpEmail({ email: user.email, fullName: user.fullName, otp });

  authSuccess(res, sendJson, 200, "Mã OTP đặt lại mật khẩu đã được gửi về email của bạn.", {
    data: {
      email: user.email,
      expiresAt,
      otpExpiresMinutes: config.otpExpiresMinutes,
    },
  });
}

async function handleResetForgotPassword({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  requireAuthSecrets();
  const body = await parseJsonBody(req);
  const email = normalizeEmail(body.email || body.identifier);
  const otp = String(body.otp || "").trim();
  const newPassword = String(body.newPassword || body.password || "");
  const passwordError = validatePasswordInput(newPassword);

  if (!validateEmail(email)) {
    sendError(res, 400, "Email nhận OTP không hợp lệ.");
    return;
  }
  if (!/^\d{6}$/.test(otp)) {
    sendError(res, 400, "Mã OTP cần gồm 6 chữ số.");
    return;
  }
  if (passwordError) {
    sendError(res, 400, passwordError);
    return;
  }

  if (
    !rateLimitOrSend({
      req,
      res,
      sendError,
      scope: "auth:forgot-password-reset",
      identifier: email,
      message: "Bạn xác thực OTP quá nhanh. Vui lòng thử lại sau ít phút.",
    })
  ) {
    return;
  }

  const { users, otps } = await getAuthCollections(getDb);
  const now = new Date();
  const otpDoc = await otps.findOne({
    emailNormalized: email,
    purpose: OTP_PURPOSE_FORGOT_PASSWORD,
    expiresAt: { $gt: now },
  });

  if (!otpDoc) {
    sendError(res, 400, "Mã OTP đã hết hạn hoặc không tồn tại.");
    return;
  }
  if (Number(otpDoc.attempts || 0) >= MAX_OTP_ATTEMPTS) {
    sendError(res, 429, "Bạn đã nhập sai OTP quá nhiều lần. Vui lòng gửi lại mã mới.");
    return;
  }
  if (otpDoc.otpHash !== hashOtp(email, otp)) {
    await otps.updateOne({ _id: otpDoc._id }, { $inc: { attempts: 1 }, $set: { updatedAt: now } });
    sendError(res, 400, "Mã OTP không chính xác.");
    return;
  }

  const userId = otpDoc.userId && ObjectId.isValid(otpDoc.userId) ? new ObjectId(otpDoc.userId) : null;
  const updateResult = await users.updateOne(
    userId ? { _id: userId } : { emailNormalized: email },
    {
      $set: {
        passwordHash: createPasswordHash(newPassword),
        updatedAt: now,
      },
    }
  );

  await otps.deleteOne({ _id: otpDoc._id });

  if (!updateResult.matchedCount) {
    sendError(res, 404, "Không tìm thấy tài khoản để đặt lại mật khẩu.");
    return;
  }

  authSuccess(res, sendJson, 200, "Đặt lại mật khẩu thành công.", {
    data: { reset: true },
  });
}

async function handleLogout({ res, sendJson }) {
  clearAuthCookie(res);
  authSuccess(res, sendJson, 200, "Đăng xuất thành công.", {
    data: { loggedOut: true },
  });
}

async function handleAuthRequest(context) {
  const { req, res, pathParts, sendError } = context;
  const action = pathParts[2];

  if (req.method === "POST" && action === "request-register-otp") {
    await handleRequestRegisterOtp(context);
    return;
  }

  if (req.method === "POST" && action === "verify-register-otp") {
    await handleVerifyRegisterOtp(context);
    return;
  }

  if (req.method === "POST" && action === "education" && pathParts[3] === "request-otp") {
    await handleRequestEducationOtp(context);
    return;
  }

  if (req.method === "POST" && action === "education" && pathParts[3] === "verify-otp") {
    await handleVerifyEducationOtp(context);
    return;
  }

  if (req.method === "POST" && action === "business" && pathParts[3] === "submit") {
    await handleSubmitBusinessVerification(context);
    return;
  }

  if (req.method === "POST" && action === "forgot-password" && pathParts[3] === "request-otp") {
    await handleRequestForgotPasswordOtp(context);
    return;
  }

  if (req.method === "POST" && action === "forgot-password" && pathParts[3] === "reset") {
    await handleResetForgotPassword(context);
    return;
  }

  if (req.method === "POST" && action === "login") {
    await handleLogin(context);
    return;
  }

  if (req.method === "POST" && action === "google") {
    await handleGoogleLogin(context);
    return;
  }

  if (req.method === "POST" && action === "logout") {
    await handleLogout(context);
    return;
  }

  if (req.method === "GET" && action === "me") {
    await handleMe(context);
    return;
  }

  if (["PATCH", "PUT"].includes(req.method) && action === "me") {
    await handleUpdateMe(context);
    return;
  }

  if (["PATCH", "POST"].includes(req.method) && action === "change-password") {
    await handleChangePassword(context);
    return;
  }

  sendError(res, 404, "Không tìm thấy chức năng xác thực.");
}

module.exports = {
  handleAuthRequest,
  verifyJwt,
  getAuthToken,
  getBearerToken,
  getAuthConfig,
  publicUser,
  createPasswordHash,
  sendNewsletterCouponEmail,
  sendOrderInvoiceEmail,
};
