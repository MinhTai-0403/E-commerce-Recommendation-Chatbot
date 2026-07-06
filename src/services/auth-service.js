const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { ObjectId } = require("mongodb");

const OTP_PURPOSE_REGISTER = "register";
const MAX_OTP_ATTEMPTS = 5;
const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";

let indexesReady = false;
let mailTransporter;

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
    smtpUser,
    smtpAppPassword,
    mailFrom:
      process.env.MAIL_FROM ||
      `${process.env.MAIL_FROM_NAME || "CellphoneS Clone"} <${smtpUser}>`,
  };
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

function sanitizeCustomerType(value = "normal") {
  return ["normal", "student", "business"].includes(value) ? value : "normal";
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
  const username = String(process.env.ADMIN_USERNAME || "admin").trim();
  const password = String(process.env.ADMIN_PASSWORD || "admin123");

  if (!username || !password) return null;

  const usernameNormalized = normalizeEmail(username);
  const email = "admin@cellphones.local";
  const emailNormalized = normalizeEmail(email);
  const now = new Date();
  const existing = await users.findOne({
    $or: [
      { usernameNormalized },
      { emailNormalized },
    ],
  });

  const update = {
    username,
    usernameNormalized,
    fullName: "Admin CellphoneS",
    email,
    emailNormalized,
    passwordHash: createPasswordHash(password),
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

function publicUser(user) {
  return {
    id: String(user._id || user.id),
    username: user.username,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    birthday: user.birthday,
    customerType: user.customerType || "normal",
    role: user.role || "customer",
    status: user.status || "active",
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
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

  authSuccess(res, sendJson, 201, "Đăng ký và xác thực email thành công.", {
    token,
    data: {
      token,
      user: publicUser(user),
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

  const { users } = await getAuthCollections(getDb);
  const isEmail = identifier.includes("@");
  const normalizedPhone = normalizePhone(identifier);
  const adminUsername = normalizeEmail(process.env.ADMIN_USERNAME || "admin");
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

  authSuccess(res, sendJson, 200, "Đăng nhập thành công.", {
    token,
    data: {
      token,
      user: publicUser(user),
    },
  });
}

async function handleMe({ req, res, sendJson, sendError, getDb }) {
  const token = getBearerToken(req);
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
      user: publicUser(user),
    },
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

  if (req.method === "POST" && action === "login") {
    await handleLogin(context);
    return;
  }

  if (req.method === "GET" && action === "me") {
    await handleMe(context);
    return;
  }

  sendError(res, 404, "Auth route not found.");
}

module.exports = {
  handleAuthRequest,
  verifyJwt,
  getAuthConfig,
  publicUser,
  createPasswordHash,
};
