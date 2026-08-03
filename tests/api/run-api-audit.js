#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { MongoClient } = require("mongodb");
const { API_ROUTE_INVENTORY } = require("./api-route-inventory");

require("dotenv").config();

// Never inherit the common local workaround that disables TLS verification.
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;

const ROOT = path.resolve(__dirname, "../..");
const PORT = 5050;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TEST_DB_PREFIX = "cosarii_api_test_";
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const DATABASE_NAME = `${TEST_DB_PREFIX}${RUN_ID}`;
const REPORT_DIR = path.join(ROOT, "reports", "api-audit", RUN_ID);
const TEMP_DIR = path.join(ROOT, ".tmp", "api-audit", RUN_ID);
const MAIL_CAPTURE = path.join(TEMP_DIR, "mock-mail.jsonl");
const SERVER_LOG = path.join(TEMP_DIR, "server.log");
const RESULT_JSON = path.join(REPORT_DIR, "api-test-results.json");
const MATRIX_CSV = path.join(REPORT_DIR, "api-test-matrix.csv");
const REPORT_MD = path.join(REPORT_DIR, "API-TEST-REPORT.md");
const STARTED_AT = new Date();
const AUDIT_MARKER = `api-audit-${RUN_ID}`;

const state = {
  runId: RUN_ID,
  database: DATABASE_NAME,
  port: PORT,
  startedAt: STARTED_AT.toISOString(),
  finishedAt: null,
  startup: { status: "pending", message: "" },
  cleanup: { status: "pending", databaseDropped: false, tempRemoved: false, liveDatabaseClean: null, message: "" },
  integrationMocks: { smtp: true, googleOAuth: true, bank: true, storeProbe: "read-only/non-gating" },
  results: [],
  findings: [],
  routeInventory: API_ROUTE_INVENTORY,
  serverLogSummary: [],
  passwordHashCheck: null,
};

let serverProcess = null;
let mongoClient = null;
let testDb = null;
let adminToken = "";
let userAToken = "";
let userBToken = "";
let userA = null;
let userB = null;
let product = null;
let secondProduct = null;
let order = null;
let supportRequest = null;
let address = null;
let notificationId = "";
let reviewId = "";
let questionId = "";
let coupon = null;
let inventory = null;
let shipment = null;
let returnRequest = null;

function safeString(value, max = 1200) {
  const string = String(value ?? "").replace(/\s+/g, " ").trim();
  return string.length > max ? `${string.slice(0, max)}…` : string;
}

function maskEmail(value) {
  const [local = "", domain = ""] = String(value).split("@");
  if (!domain) return value;
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(value) {
  const clean = String(value).replace(/\D/g, "");
  if (clean.length < 7) return "[REDACTED_PHONE]";
  return `${clean.slice(0, 3)}***${clean.slice(-3)}`;
}

function maskToken(value) {
  const clean = String(value || "");
  if (clean.length < 20) return "[REDACTED]";
  return `${clean.slice(0, 10)}…${clean.slice(-6)}`;
}

function sanitize(value, key = "", depth = 0) {
  if (depth > 7) return "[TRUNCATED]";
  const lowerKey = String(key).toLowerCase();
  if (/(password|passphrase|^otp$|otphash|otpcode|secret|authorization|cookie|credential|passwordhash|tokenhash|trackingtoken|api.?key)/i.test(lowerKey)) {
    return "[REDACTED]";
  }
  if (/^(token|jwt|accessToken|refreshToken)$/i.test(key)) return maskToken(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 5000).map((item) => sanitize(item, key, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([childKey, child]) => [childKey, sanitize(child, childKey, depth + 1)]));
  }
  let text = safeString(value, 1000);
  if (/email/i.test(lowerKey) || /^[^\s@]+@[^\s@]+$/.test(text)) text = maskEmail(text);
  if (/phone|mobile/i.test(lowerKey) && /\d/.test(text)) text = maskPhone(text);
  if (/address/i.test(lowerKey) && text.length > 12) text = `${text.slice(0, 8)}…[MASKED]`;
  if (/^eyJ[A-Za-z0-9_-]+\./.test(text)) text = maskToken(text);
  if (/data:image\//i.test(text)) text = `[BASE64_IMAGE ${text.length} chars]`;
  return text;
}

function summarizePayload(payload) {
  const clean = sanitize(payload);
  const encoded = JSON.stringify(clean);
  return encoded.length > 2500 ? { summary: `${encoded.slice(0, 2500)}…` } : clean;
}

function expectedLabel(expected) {
  return (Array.isArray(expected) ? expected : [expected]).join("|");
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function addFinding({ severity = "P2", title, endpoint, method, request, expected, actual, statusCode, evidence, recommendation, classification = "backend" }) {
  const duplicate = state.findings.some((item) => item.title === title && item.endpoint === endpoint && item.method === method);
  if (duplicate) return;
  state.findings.push({
    id: `F-${String(state.findings.length + 1).padStart(3, "0")}`,
    severity,
    classification,
    title,
    endpoint,
    method,
    request: summarizePayload(request ?? null),
    expected: safeString(expected),
    actual: safeString(actual),
    statusCode: statusCode ?? null,
    evidence: sanitize(evidence),
    recommendation: safeString(recommendation),
  });
}

async function runCase(spec) {
  const started = performance.now();
  const headers = {
    Accept: "application/json",
    "X-API-Audit-Run": RUN_ID,
    ...(spec.headers || {}),
  };
  if (spec.token) headers.Authorization = `Bearer ${spec.token}`;
  let requestBody;
  if (spec.rawBody !== undefined) {
    requestBody = spec.rawBody;
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  } else if (spec.body !== undefined) {
    requestBody = JSON.stringify(spec.body);
    headers["Content-Type"] = "application/json";
  }

  let status = 0;
  let responseBody = null;
  let responseHeaders = {};
  let errorMessage = "";
  let response = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), spec.timeoutMs || 15_000);
  try {
    response = await fetch(`${BASE_URL}${spec.path}`, {
      method: spec.method || "GET",
      headers,
      body: requestBody,
      signal: controller.signal,
    });
    status = response.status;
    responseHeaders = {
      "content-type": response.headers.get("content-type") || "",
      "access-control-allow-origin": response.headers.get("access-control-allow-origin") || "",
      "retry-after": response.headers.get("retry-after") || "",
    };
    const raw = await response.text();
    if ((responseHeaders["content-type"] || "").includes("json")) {
      try { responseBody = raw ? JSON.parse(raw) : null; } catch { responseBody = { invalidJson: safeString(raw) }; }
    } else {
      responseBody = { text: safeString(raw, 1800) };
    }
  } catch (error) {
    errorMessage = error.name === "AbortError" ? "request timeout" : safeString(error.message);
  } finally {
    clearTimeout(timeout);
  }

  const expected = Array.isArray(spec.expected) ? spec.expected : [spec.expected];
  let assertionPassed = typeof spec.assert === "function" ? Boolean(spec.assert({ status, body: responseBody, headers: responseHeaders })) : true;
  const statusPassed = expected.includes(status);
  const externalBlocked = Boolean(spec.nonGating && (errorMessage || status >= 500 || status === 0));
  const passed = externalBlocked || (statusPassed && assertionPassed);
  const outcome = externalBlocked ? "external-blocked" : passed ? "pass" : "fail";
  const durationMs = Math.round((performance.now() - started) * 100) / 100;
  const result = {
    id: `T-${String(state.results.length + 1).padStart(4, "0")}`,
    routeKey: spec.routeKey,
    family: spec.family || API_ROUTE_INVENTORY.find((route) => route.key === spec.routeKey)?.family || "other",
    case: spec.case,
    method: spec.method || "GET",
    path: spec.path,
    expectedStatus: expectedLabel(spec.expected),
    actualStatus: status || null,
    outcome,
    durationMs,
    request: summarizePayload(spec.body ?? spec.rawBody ?? null),
    response: summarizePayload(responseBody ?? { error: errorMessage }),
    responseHeaders: sanitize(responseHeaders),
    note: safeString(spec.note || errorMessage),
  };
  state.results.push(result);

  if (!passed) {
    addFinding({
      severity: spec.severity || "P2",
      title: spec.findingTitle || `${result.method} ${result.path}: ${result.case}`,
      endpoint: result.path,
      method: result.method,
      request: spec.body ?? spec.rawBody ?? null,
      expected: `HTTP ${result.expectedStatus}${spec.expectedBehavior ? `; ${spec.expectedBehavior}` : ""}`,
      actual: errorMessage || `HTTP ${status}${assertionPassed ? "" : "; assertion không đạt"}`,
      statusCode: status || null,
      evidence: responseBody || errorMessage,
      recommendation: spec.recommendation || "Chuẩn hóa validation/authorization và bổ sung contract test hồi quy cho trường hợp này.",
    });
  }
  return { status, body: responseBody, headers: responseHeaders, outcome, result, response };
}

function addSkip(route, reason) {
  state.results.push({
    id: `T-${String(state.results.length + 1).padStart(4, "0")}`,
    routeKey: route.key,
    family: route.family,
    case: "Route được kiểm kê nhưng không thể thực thi",
    method: route.method,
    path: route.path,
    expectedStatus: "n/a",
    actualStatus: null,
    outcome: "skip",
    durationMs: 0,
    request: null,
    response: null,
    responseHeaders: {},
    note: safeString(reason),
  });
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

function sanitizeServerLine(line) {
  return safeString(String(line)
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[REDACTED_MONGODB_URI]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]"), 1000);
}

async function startServer() {
  if (!(await isPortAvailable(PORT))) throw new Error(`Cổng ${PORT} đang được sử dụng; audit không tự đổi cổng.`);
  if (!process.env.MONGODB_URI) throw new Error("Thiếu MONGODB_URI; không thể tạo database audit tạm.");
  if (!DATABASE_NAME.startsWith(TEST_DB_PREFIX) || DATABASE_NAME === "cosarii") throw new Error("Tên database audit không an toàn.");

  const preload = path.join(ROOT, "tests", "api", "mock-external.preload.js");
  const entry = path.join(ROOT, "src", "server", "api-server.js");
  const childEnv = {
    ...process.env,
    NODE_ENV: "test",
    API_PORT: String(PORT),
    MONGODB_DB: DATABASE_NAME,
    JWT_SECRET: `audit-jwt-${RUN_ID}-local-only`,
    SMTP_USER: "api-audit@example.test",
    SMTP_APP_PASSWORD: "mock-only-no-network",
    GOOGLE_CLIENT_ID: "api-audit-google-client.apps.test",
    ADMIN_USERNAME: "api_audit_admin",
    ADMIN_PASSWORD: `Admin-${RUN_ID}-9`,
    ADMIN_EMAIL: "admin.api.audit@example.test",
    ADMIN_API_KEY: `admin-api-audit-${RUN_ID}`,
    ALLOW_DEV_ADMIN_FALLBACK: "false",
    BANK_QR_BANK_ID: "970422",
    BANK_QR_ACCOUNT_NUMBER: "0000000000",
    BANK_QR_ACCOUNT_NAME: "API AUDIT MOCK",
    BANK_QR_WEBHOOK_SECRET: `bank-audit-${RUN_ID}`,
    RATE_LIMIT_WINDOW_MS: "60000",
    RATE_LIMIT_AUTH_MAX: "40",
    RATE_LIMIT_ORDER_MAX: "30",
    API_AUDIT_MAIL_CAPTURE: MAIL_CAPTURE,
  };

  serverProcess = spawn(process.execPath, ["-r", preload, entry], {
    cwd: ROOT,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const logStream = fs.createWriteStream(SERVER_LOG, { flags: "a" });
  const capture = (chunk) => {
    for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
      const safe = sanitizeServerLine(line);
      logStream.write(`${safe}\n`);
      state.serverLogSummary.push(safe);
      state.serverLogSummary = state.serverLogSummary.slice(-30);
    }
  };
  serverProcess.stdout.on("data", capture);
  serverProcess.stderr.on("data", capture);

  const deadline = Date.now() + 45_000;
  let lastError = "";
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`Backend kết thúc sớm với exit code ${serverProcess.exitCode}.`);
    try {
      const response = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.status === 200) {
        state.startup = { status: "passed", message: `Server chạy tại cổng ${PORT}; database tạm đã kết nối.` };
        return;
      }
      lastError = `health HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Backend không sẵn sàng sau 45 giây: ${safeString(lastError)}`);
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => serverProcess.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
}

async function readLatestOtp(email, afterMs = 0) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const lines = (await fsp.readFile(MAIL_CAPTURE, "utf8")).trim().split(/\r?\n/).filter(Boolean);
      const entries = lines.map((line) => JSON.parse(line));
      const match = [...entries].reverse().find((entry) => String(entry.to).toLowerCase().includes(String(email).toLowerCase()) && entry.otp && new Date(entry.at).getTime() >= afterMs);
      if (match) return match.otp;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Không đọc được OTP mock cho ${maskEmail(email)}.`);
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function registerUser(label, email, phone, password, fullName = `API Audit ${label}`) {
  const requestedAt = Date.now() - 1000;
  const request = await runCase({
    routeKey: "auth.register.request", family: "auth", case: `Gửi OTP đăng ký ${label}`,
    method: "POST", path: "/api/auth/request-register-otp", expected: 200,
    body: { fullName, email, phone, birthday: "2001-01-15", password, customerType: "normal" },
    severity: "P1",
  });
  if (request.status !== 200) throw new Error(`Không thể gửi OTP đăng ký ${label}.`);
  const otp = await readLatestOtp(email, requestedAt);
  const verify = await runCase({
    routeKey: "auth.register.verify", family: "auth", case: `Xác minh OTP và tạo ${label}`,
    method: "POST", path: "/api/auth/verify-register-otp", expected: 201,
    body: { email, otp }, severity: "P1",
    assert: ({ body }) => Boolean(body?.data?.token && body?.data?.user?.id),
  });
  if (verify.status !== 201) throw new Error(`Không thể xác minh OTP đăng ký ${label}.`);
  return { token: verify.body?.data?.token || verify.body?.token, user: verify.body?.data?.user };
}

async function runSystemAndPublicTests() {
  await runCase({ routeKey: "system.index", family: "system", case: "API index", method: "GET", path: "/api", expected: 200, assert: ({ body }) => body?.ok === true });
  await runCase({ routeKey: "system.health", family: "system", case: "Health dùng đúng database tạm", method: "GET", path: "/api/health", expected: 200, severity: "P0", assert: ({ body }) => body?.database === DATABASE_NAME });
  await runCase({ routeKey: "system.options", family: "system", case: "CORS preflight", method: "OPTIONS", path: "/api/health", expected: 204, headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET" } });
  await runCase({ routeKey: "system.notFound", family: "system", case: "Route API không tồn tại", method: "GET", path: "/api/__not-found__", expected: 404 });
  await runCase({ routeKey: "system.methodNotAllowed", family: "system", case: "Method không hỗ trợ", method: "POST", path: "/api/stores", expected: 405 });
  await runCase({ routeKey: "chatbot.message", family: "system", case: "JSON sai định dạng phải là lỗi client", method: "POST", path: "/api/chatbot/message", rawBody: "{invalid-json", expected: 400, severity: "P1", findingTitle: "JSON sai định dạng đang không được chuẩn hóa thành 400", expectedBehavior: "body JSON hỏng phải trả lỗi client có kiểm soát", recommendation: "Bắt SyntaxError của JSON parser và trả 400 INVALID_JSON." });
  await runCase({ routeKey: "chatbot.message", family: "system", case: "Body vượt 2 MB", method: "POST", path: "/api/chatbot/message", body: { message: "x".repeat(2_100_000) }, expected: [400, 413], timeoutMs: 25_000, severity: "P1", findingTitle: "Body quá lớn không trả 413/400 ổn định", recommendation: "Trả 413 Payload Too Large và đóng request có kiểm soát." });

  await runCase({ routeKey: "content.routes", family: "public", case: "Route manifest", method: "GET", path: "/api/content/routes", expected: 200, assert: ({ body }) => Boolean(body?.ok) });
  await runCase({ routeKey: "content.page", family: "public", case: "Content page hợp lệ", method: "GET", path: "/api/content/page?path=%2Fmobile.html", expected: 200 });
  await runCase({ routeKey: "content.page", family: "public", case: "Content page thiếu path", method: "GET", path: "/api/content/page", expected: 400 });
  await runCase({ routeKey: "search.suggestions", family: "public", case: "Autocomplete và limit", method: "GET", path: "/api/search/suggestions?q=iphone&limit=5&location=HCM", expected: 200 });
  await runCase({ routeKey: "search.suggestions", family: "public", case: "Autocomplete query rỗng bị từ chối", method: "GET", path: "/api/search/suggestions?q=", expected: 400 });
  await runCase({ routeKey: "public.stores", family: "public", case: "Probe cửa hàng live chỉ đọc", method: "GET", path: "/api/stores?city=Ho%20Chi%20Minh&limit=3", expected: 200, timeoutMs: 25_000, nonGating: true, note: "Nguồn CellphoneS bên ngoài; lỗi được phân loại external-blocked." });
}

async function runAuthTests() {
  const unique = RUN_ID.slice(-8);
  const sharedPassword = "AuditPass9!";

  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Mật khẩu dưới 6 ký tự", method: "POST", path: "/api/auth/request-register-otp", expected: 400, body: { fullName: "Short", email: `short.${unique}@example.test`, phone: "0910000001", birthday: "2000-01-01", password: "a1" } });
  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Mật khẩu thiếu số", method: "POST", path: "/api/auth/request-register-otp", expected: 400, body: { fullName: "No digit", email: `nodigit.${unique}@example.test`, phone: "0910000002", birthday: "2000-01-01", password: "abcdef" } });
  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Email sai", method: "POST", path: "/api/auth/request-register-otp", expected: 400, body: { fullName: "Bad Email", email: "not-an-email", phone: "0910000003", birthday: "2000-01-01", password: "abcdef1" } });
  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Phone sai độ dài", method: "POST", path: "/api/auth/request-register-otp", expected: 400, body: { fullName: "Bad Phone", email: `badphone.${unique}@example.test`, phone: "123", birthday: "2000-01-01", password: "abcdef1" } });
  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Birthday rỗng", method: "POST", path: "/api/auth/request-register-otp", expected: 400, body: { fullName: "No Birthday", email: `birthday.${unique}@example.test`, phone: "0910000004", birthday: "", password: "abcdef1" } });

  const long120Email = `name120.${unique}@example.test`;
  const long120Started = Date.now() - 1000;
  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Họ tên đúng 120 ký tự", method: "POST", path: "/api/auth/request-register-otp", expected: 200, body: { fullName: "A".repeat(120), email: long120Email, phone: "0910000005", birthday: "2000-01-01", password: "abcdef1" } });
  await readLatestOtp(long120Email, long120Started).catch(() => "");

  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Họ tên 121 ký tự", method: "POST", path: "/api/auth/request-register-otp", expected: 400, body: { fullName: "B".repeat(121), email: `name121.${unique}@example.test`, phone: "0910000006", birthday: "2000-01-01", password: "abcdef1" }, severity: "P2", findingTitle: "Đăng ký chưa giới hạn họ tên ở 120 ký tự", expectedBehavior: "từ chối giá trị vượt giới hạn model", recommendation: "Khai báo và dùng chung giới hạn fullName=120 ở đăng ký, cập nhật hồ sơ và schema MongoDB." });
  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Họ tên hơn 100 từ", method: "POST", path: "/api/auth/request-register-otp", expected: 400, body: { fullName: Array(101).fill("từ").join(" "), email: `namewords.${unique}@example.test`, phone: "0910000007", birthday: "2000-01-01", password: "abcdef1" }, severity: "P2", findingTitle: "Đăng ký chưa có quy tắc giới hạn số từ họ tên", expectedBehavior: "từ chối chuỗi bất thường hơn 100 từ", recommendation: "Xác định contract độ dài/số từ cho fullName và trả 400 rõ ràng." });
  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Mật khẩu rất dài", method: "POST", path: "/api/auth/request-register-otp", expected: 400, body: { fullName: "Long Password", email: `longpass.${unique}@example.test`, phone: "0910000008", birthday: "2000-01-01", password: `${"A".repeat(10_000)}9` }, severity: "P2", findingTitle: "Đăng ký chưa giới hạn độ dài tối đa mật khẩu", recommendation: "Đặt giới hạn hợp lý trước PBKDF2 để tránh lãng phí CPU/bộ nhớ." });
  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Mật khẩu Unicode hợp lệ", method: "POST", path: "/api/auth/request-register-otp", expected: 200, body: { fullName: "Unicode Password", email: `unicode.${unique}@example.test`, phone: "0910000009", birthday: "2000-01-01", password: "MậtKhẩu9✓" } });
  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Mật khẩu khoảng trắng", method: "POST", path: "/api/auth/request-register-otp", expected: 400, body: { fullName: "Whitespace Password", email: `spacepass.${unique}@example.test`, phone: "0910000010", birthday: "2000-01-01", password: "     1" }, severity: "P2", findingTitle: "Mật khẩu chỉ gồm khoảng trắng và số có thể được chấp nhận", recommendation: "Cấm control/whitespace-only và công bố policy mật khẩu nhất quán." });

  const registeredA = await registerUser("user A", `usera.${unique}@example.test`, "0920000001", sharedPassword);
  const registeredB = await registerUser("user B", `userb.${unique}@example.test`, "0920000002", sharedPassword);
  userAToken = registeredA.token; userA = registeredA.user;
  userBToken = registeredB.token; userB = registeredB.user;

  const users = testDb.collection("smember_users");
  const [storedA, storedB] = await Promise.all([
    users.findOne({ _id: new (require("mongodb").ObjectId)(userA.id) }),
    users.findOne({ _id: new (require("mongodb").ObjectId)(userB.id) }),
  ]);
  const hashesEqual = Boolean(storedA?.passwordHash && storedB?.passwordHash && storedA.passwordHash === storedB.passwordHash);
  state.passwordHashCheck = { algorithm: "PBKDF2-SHA256", iterations: 120000, hashesEqual, hashesRecorded: false };
  state.results.push({ id: `T-${String(state.results.length + 1).padStart(4, "0")}`, routeKey: "auth.register.verify", family: "auth", case: "Hai tài khoản cùng mật khẩu dùng salt riêng", method: "DB ASSERT", path: "smember_users.passwordHash", expectedStatus: "hashesEqual=false", actualStatus: null, outcome: hashesEqual ? "fail" : "pass", durationMs: 0, request: "[REDACTED]", response: state.passwordHashCheck, responseHeaders: {}, note: "Không ghi hash thật vào artifact." });
  if (hashesEqual) addFinding({ severity: "P0", title: "Hai tài khoản cùng mật khẩu có passwordHash giống nhau", endpoint: "smember_users.passwordHash", method: "DB ASSERT", expected: "salt riêng; hashesEqual=false", actual: "hashesEqual=true", evidence: state.passwordHashCheck, recommendation: "Dùng salt ngẫu nhiên riêng cho mỗi password hash." });

  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Đăng ký trùng email", method: "POST", path: "/api/auth/request-register-otp", expected: 409, body: { fullName: "Duplicate", email: storedA.email, phone: "0920000009", birthday: "2000-01-01", password: sharedPassword } });
  await runCase({ routeKey: "auth.register.request", family: "auth", case: "Đăng ký trùng phone", method: "POST", path: "/api/auth/request-register-otp", expected: 409, body: { fullName: "Duplicate", email: `dup.${unique}@example.test`, phone: storedA.phone, birthday: "2000-01-01", password: sharedPassword } });

  await runCase({ routeKey: "auth.register.verify", family: "auth", case: "OTP sai định dạng", method: "POST", path: "/api/auth/verify-register-otp", expected: 400, body: { email: storedA.email, otp: "abc" } });
  await runCase({ routeKey: "auth.register.verify", family: "auth", case: "OTP hết hạn/không tồn tại", method: "POST", path: "/api/auth/verify-register-otp", expected: 400, body: { email: `expired.${unique}@example.test`, otp: "000000" } });

  const loginEmail = await runCase({ routeKey: "auth.login", family: "auth", case: "Login bằng email", method: "POST", path: "/api/auth/login", expected: 200, body: { identifier: storedA.email, password: sharedPassword }, assert: ({ body }) => Boolean(body?.data?.token) });
  userAToken = loginEmail.body?.data?.token || userAToken;
  await runCase({ routeKey: "auth.login", family: "auth", case: "Login bằng phone", method: "POST", path: "/api/auth/login", expected: 200, body: { identifier: storedA.phone, password: sharedPassword } });
  await runCase({ routeKey: "auth.login", family: "auth", case: "Sai mật khẩu", method: "POST", path: "/api/auth/login", expected: 401, body: { identifier: storedA.email, password: "WrongPass9" } });
  await users.updateOne({ _id: storedB._id }, { $set: { status: "locked" } });
  await runCase({ routeKey: "auth.login", family: "auth", case: "Tài khoản khóa", method: "POST", path: "/api/auth/login", expected: 403, body: { identifier: storedB.email, password: sharedPassword } });
  await users.updateOne({ _id: storedB._id }, { $set: { status: "active" } });

  const adminLogin = await runCase({ routeKey: "auth.login", family: "auth", case: "Login bằng username admin", method: "POST", path: "/api/auth/login", expected: 200, body: { identifier: "api_audit_admin", password: `Admin-${RUN_ID}-9` }, severity: "P0", assert: ({ body }) => body?.data?.user?.role === "admin" });
  adminToken = adminLogin.body?.data?.token || "";
  await runCase({ routeKey: "auth.google", family: "auth", case: "Google OAuth mock hợp lệ", method: "POST", path: "/api/auth/google", expected: 200, body: { credential: "api-audit-google-valid" } });
  await runCase({ routeKey: "auth.google", family: "auth", case: "Google OAuth mock không hợp lệ", method: "POST", path: "/api/auth/google", expected: 401, body: { credential: "api-audit-google-invalid" } });
  await runCase({ routeKey: "auth.me.get", family: "auth", case: "Me không đăng nhập", method: "GET", path: "/api/auth/me", expected: 401 });
  await runCase({ routeKey: "auth.me.get", family: "auth", case: "Me đăng nhập", method: "GET", path: "/api/auth/me", expected: 200, token: userAToken, assert: ({ body }) => !JSON.stringify(body).includes("passwordHash") });
  await runCase({ routeKey: "auth.me.update", family: "auth", case: "Cập nhật hồ sơ", method: "PATCH", path: "/api/auth/me", expected: 200, token: userAToken, body: { fullName: "API Audit User A Updated" } });
  await runCase({ routeKey: "auth.password.change", family: "auth", case: "Đổi mật khẩu sai mật khẩu hiện tại", method: "PATCH", path: "/api/auth/change-password", expected: 401, token: userAToken, body: { currentPassword: "Wrong9", newPassword: "ChangedPass9" } });
  await runCase({ routeKey: "auth.education.request", family: "auth", case: "Education OTP không đăng nhập", method: "POST", path: "/api/auth/education/request-otp", expected: 401, body: { email: "student@university.edu.vn", schoolName: "Test University", verificationType: "student" } });
  await runCase({ routeKey: "auth.education.verify", family: "auth", case: "Education OTP sai", method: "POST", path: "/api/auth/education/verify-otp", expected: [400, 401], token: userAToken, body: { email: storedA.email, otp: "000000" } });
  await runCase({ routeKey: "auth.business.submit", family: "auth", case: "Business verification không đăng nhập", method: "POST", path: "/api/auth/business/submit", expected: 401, body: {} });
  await runCase({ routeKey: "auth.business.submit", family: "auth", case: "Business verification payload sai", method: "POST", path: "/api/auth/business/submit", expected: 400, token: userAToken, body: {} });

  const forgotAt = Date.now() - 1000;
  const forgot = await runCase({ routeKey: "auth.forgot.request", family: "auth", case: "Quên mật khẩu gửi OTP mock", method: "POST", path: "/api/auth/forgot-password/request-otp", expected: 200, body: { identifier: storedB.email } });
  if (forgot.status === 200) {
    const otp = await readLatestOtp(storedB.email, forgotAt);
    const reset = await runCase({ routeKey: "auth.forgot.reset", family: "auth", case: "Reset mật khẩu bằng OTP mock", method: "POST", path: "/api/auth/forgot-password/reset", expected: 200, body: { email: storedB.email, otp, newPassword: "ResetPass9" } });
    if (reset.status === 200) {
      const relogin = await runCase({ routeKey: "auth.login", family: "auth", case: "Login sau reset mật khẩu", method: "POST", path: "/api/auth/login", expected: 200, body: { identifier: storedB.email, password: "ResetPass9" } });
      userBToken = relogin.body?.data?.token || userBToken;
    }
  }
  await runCase({ routeKey: "auth.forgot.reset", family: "auth", case: "Reset với OTP sai", method: "POST", path: "/api/auth/forgot-password/reset", expected: 400, body: { email: storedB.email, otp: "000000", newPassword: "Another9" } });
  await runCase({ routeKey: "auth.logout", family: "auth", case: "Logout", method: "POST", path: "/api/auth/logout", expected: 200, token: userAToken, body: {} });

  // Dedicated rate-limit key, isolated from real user identities.
  let rateStatus = 0;
  for (let index = 0; index < 42; index += 1) {
    const response = await runCase({ routeKey: "auth.login", family: "auth", case: `Rate-limit login ${index + 1}/42`, method: "POST", path: "/api/auth/login", expected: index < 40 ? 401 : 429, body: { identifier: `ratelimit.${unique}@example.test`, password: "WrongPass9" }, severity: "P2" });
    rateStatus = response.status;
    if (rateStatus === 429) break;
  }
}

async function runProductTests() {
  await runCase({ routeKey: "products.list", family: "products", case: "Danh sách/filter/sort/pagination", method: "GET", path: "/api/products?q=audit&category=Phone&brand=AuditBrand&minPrice=1000000&maxPrice=9000000&sort=price-asc&page=1&limit=5", expected: 200 });
  await runCase({ routeKey: "products.create", family: "products", case: "Customer không được tạo sản phẩm", method: "POST", path: "/api/products", expected: 401, token: userAToken, body: { name: "Forbidden product" } });
  const created = await runCase({ routeKey: "products.create", family: "products", case: "Admin tạo sản phẩm fixture", method: "POST", path: "/api/products", expected: 201, token: adminToken, severity: "P1", body: { name: `Audit Phone ${RUN_ID}`, slug: `audit-phone-${RUN_ID}`, sku: `AUDIT-${RUN_ID}`, brand: "AuditBrand", category: "Phone", categories: ["Phone", "Smartphone"], currentPrice: 4990000, originalPrice: 5990000, primaryImage: "https://example.test/audit-phone.png", url: `https://example.test/audit-phone-${RUN_ID}.html`, availability: "in_stock", specifications: { ram: "8 GB", storage: "256 GB" }, auditMarker: AUDIT_MARKER }, assert: ({ body }) => Boolean(body?.data?.slug) });
  product = created.body?.data;
  const createdSecond = await runCase({ routeKey: "products.create", family: "products", case: "Admin tạo sản phẩm liên quan", method: "POST", path: "/api/products", expected: 201, token: adminToken, body: { name: `Audit Phone Related ${RUN_ID}`, slug: `audit-phone-related-${RUN_ID}`, sku: `AUDIT-R-${RUN_ID}`, brand: "AuditBrand", category: "Phone", categories: ["Phone"], currentPrice: 5190000, originalPrice: 6190000, primaryImage: "https://example.test/audit-phone-2.png", url: `https://example.test/audit-phone-related-${RUN_ID}.html`, availability: "in_stock", auditMarker: AUDIT_MARKER } });
  secondProduct = createdSecond.body?.data;
  if (!product?.slug) throw new Error("Không tạo được product fixture.");

  await runCase({ routeKey: "products.detail", family: "products", case: "Chi tiết sản phẩm", method: "GET", path: `/api/products/${product.slug}`, expected: 200 });
  await runCase({ routeKey: "products.detail", family: "products", case: "Sản phẩm không tồn tại", method: "GET", path: "/api/products/no-such-product-api-audit", expected: 404 });
  await runCase({ routeKey: "products.details", family: "products", case: "Chi tiết mở rộng", method: "GET", path: `/api/products/${product.slug}/details`, expected: 200, timeoutMs: 20_000 });
  await runCase({ routeKey: "products.related", family: "products", case: "Sản phẩm liên quan", method: "GET", path: `/api/products/${product.slug}/related?limit=4`, expected: 200 });
  await runCase({ routeKey: "recommendations.related", family: "engagement", case: "Recommendation related", method: "GET", path: `/api/recommendations/related/${product.slug}?limit=4`, expected: 200, severity: "P1", findingTitle: "Xung đột tên index user_events làm recommendation related trả 500" });

  const review = await runCase({ routeKey: "products.reviews.create", family: "products", case: "Tạo review hợp lệ", method: "POST", path: `/api/products/${product.slug}/reviews`, expected: 201, token: userAToken, body: { rating: 5, content: "Sản phẩm audit hoạt động tốt." } });
  reviewId = review.body?.data?.id || review.body?.data?._id || "";
  await runCase({ routeKey: "products.reviews.create", family: "products", case: "Review không đăng nhập", method: "POST", path: `/api/products/${product.slug}/reviews`, expected: 401, body: { rating: 5, content: "Review không đăng nhập." } });
  await runCase({ routeKey: "products.reviews.create", family: "products", case: "Review vượt 4000 ký tự", method: "POST", path: `/api/products/${product.slug}/reviews`, expected: 400, token: userAToken, body: { rating: 5, content: "R".repeat(4001) } });
  await runCase({ routeKey: "products.reviews.list", family: "products", case: "Danh sách review", method: "GET", path: `/api/products/${product.slug}/reviews`, expected: 200 });

  const question = await runCase({ routeKey: "products.questions.create", family: "products", case: "Tạo câu hỏi hợp lệ", method: "POST", path: `/api/products/${product.slug}/questions`, expected: 201, token: userAToken, body: { question: "Sản phẩm này bảo hành bao lâu?" } });
  questionId = question.body?.data?.id || question.body?.data?._id || "";
  await runCase({ routeKey: "products.questions.create", family: "products", case: "Câu hỏi không đăng nhập", method: "POST", path: `/api/products/${product.slug}/questions`, expected: 401, body: { question: "Câu hỏi không đăng nhập?" } });
  await runCase({ routeKey: "products.questions.create", family: "products", case: "Câu hỏi vượt 4000 ký tự", method: "POST", path: `/api/products/${product.slug}/questions`, expected: 400, token: userAToken, body: { question: "Q".repeat(4001) } });
  await runCase({ routeKey: "products.questions.list", family: "products", case: "Danh sách câu hỏi", method: "GET", path: `/api/products/${product.slug}/questions`, expected: 200 });
  await runCase({ routeKey: "products.update", family: "products", case: "Customer không được sửa sản phẩm", method: "PATCH", path: `/api/products/${product.slug}`, expected: 401, token: userAToken, body: { name: "Forbidden" } });
  await runCase({ routeKey: "products.update", family: "products", case: "Admin sửa sản phẩm", method: "PATCH", path: `/api/products/${product.slug}`, expected: 200, token: adminToken, body: { currentPrice: 4890000 } });
  await runCase({ routeKey: "products.update", family: "products", case: "Sửa ID không tồn tại", method: "PATCH", path: "/api/products/no-such-product-api-audit", expected: 404, token: adminToken, body: { name: "None" } });
  await runCase({ routeKey: "products.delete", family: "products", case: "Customer không được xóa sản phẩm", method: "DELETE", path: `/api/products/${product.slug}`, expected: 401, token: userAToken });
  await runCase({ routeKey: "products.delete", family: "products", case: "Xóa ID không tồn tại", method: "DELETE", path: "/api/products/no-such-product-api-audit", expected: 404, token: adminToken });
}

function cartItem() {
  return { id: product?.id || product?.slug, productId: product?.id || "", slug: product?.slug, sku: product?.sku, name: product?.name, quantity: 1, currentPrice: 4890000, originalPrice: 5990000, image: product?.image || "https://example.test/audit.png" };
}

async function runCustomerTests() {
  await runCase({ routeKey: "cart.get", family: "customer", case: "Giỏ hàng không đăng nhập", method: "GET", path: "/api/cart", expected: 401 });
  await runCase({ routeKey: "cart.get", family: "customer", case: "Đọc giỏ hàng", method: "GET", path: "/api/cart", expected: 200, token: userAToken });
  await runCase({ routeKey: "cart.replace", family: "customer", case: "Replace giỏ hàng", method: "PUT", path: "/api/cart", expected: 200, token: userAToken, body: { mode: "replace", items: [cartItem()] } });
  await runCase({ routeKey: "cart.replace", family: "customer", case: "Merge giỏ hàng", method: "PUT", path: "/api/cart", expected: 200, token: userAToken, body: { mode: "merge", items: [{ ...cartItem(), quantity: 1 }] } });
  await runCase({ routeKey: "cart.item.create", family: "customer", case: "Thêm item giỏ", method: "POST", path: "/api/cart/items", expected: 201, token: userAToken, body: cartItem() });
  await runCase({ routeKey: "cart.item.update", family: "customer", case: "Sửa quantity item", method: "PATCH", path: `/api/cart/items/${encodeURIComponent(cartItem().id)}`, expected: 200, token: userAToken, body: { quantity: 2 } });
  await runCase({ routeKey: "cart.item.delete", family: "customer", case: "Xóa item giỏ", method: "DELETE", path: `/api/cart/items/${encodeURIComponent(cartItem().id)}`, expected: 200, token: userAToken });
  await runCase({ routeKey: "cart.clear", family: "customer", case: "Xóa giỏ", method: "DELETE", path: "/api/cart", expected: 200, token: userAToken });

  const addressCreated = await runCase({ routeKey: "addresses.create", family: "customer", case: "Tạo địa chỉ", method: "POST", path: "/api/addresses", expected: 201, token: userAToken, body: { fullName: "API Audit Receiver", phone: "0930000001", province: "Hồ Chí Minh", district: "Quận 1", ward: "Bến Nghé", addressLine: "1 Đường Test", isDefault: true } });
  address = addressCreated.body?.data;
  await runCase({ routeKey: "addresses.create", family: "customer", case: "Địa chỉ payload sai", method: "POST", path: "/api/addresses", expected: 400, token: userAToken, body: { fullName: "X" } });
  await runCase({ routeKey: "addresses.list", family: "customer", case: "Danh sách địa chỉ", method: "GET", path: "/api/addresses", expected: 200, token: userAToken });
  if (address?.id) {
    await runCase({ routeKey: "addresses.update", family: "customer", case: "User B không sửa địa chỉ user A", method: "PATCH", path: `/api/addresses/${address.id}`, expected: 404, token: userBToken, body: { addressLine: "Forbidden address" }, severity: "P0" });
    await runCase({ routeKey: "addresses.update", family: "customer", case: "Sửa địa chỉ", method: "PATCH", path: `/api/addresses/${address.id}`, expected: 200, token: userAToken, body: { addressLine: "2 Đường Test" } });
    await runCase({ routeKey: "addresses.default", family: "customer", case: "Đặt địa chỉ mặc định", method: "PATCH", path: `/api/addresses/${address.id}/default`, expected: 200, token: userAToken });
  }
  await runCase({ routeKey: "addresses.update", family: "customer", case: "Address ID không tồn tại", method: "PATCH", path: "/api/addresses/507f1f77bcf86cd799439011", expected: 404, token: userAToken, body: { addressLine: "No record" } });

  await runCase({ routeKey: "wishlist.list", family: "customer", case: "Wishlist không đăng nhập", method: "GET", path: "/api/wishlist", expected: 401 });
  await runCase({ routeKey: "wishlist.create", family: "customer", case: "Thêm wishlist", method: "POST", path: "/api/wishlist", expected: 200, token: userAToken, body: { productId: product.id, slug: product.slug, sku: product.sku } });
  await Promise.all(Array.from({ length: 3 }, () => runCase({ routeKey: "wishlist.create", family: "customer", case: "Duplicate/race nhẹ wishlist", method: "POST", path: "/api/wishlist", expected: 200, token: userAToken, body: { productId: product.id, slug: product.slug, sku: product.sku } })));
  await runCase({ routeKey: "wishlist.list", family: "customer", case: "Danh sách wishlist", method: "GET", path: "/api/wishlist", expected: 200, token: userAToken });
  await runCase({ routeKey: "wishlist.delete", family: "customer", case: "User B không xóa wishlist user A", method: "DELETE", path: `/api/wishlist/${product.slug}`, expected: 404, token: userBToken, severity: "P0" });

  await testDb.collection("notifications").insertOne({ userId: userA.id, type: "audit", title: "API Audit", message: AUDIT_MARKER, readAt: null, createdAt: new Date(), updatedAt: new Date() });
  const seededNotification = await testDb.collection("notifications").findOne({ userId: userA.id, message: AUDIT_MARKER });
  notificationId = String(seededNotification._id);
  await runCase({ routeKey: "notifications.list", family: "customer", case: "Danh sách notification", method: "GET", path: "/api/notifications?unread=true", expected: 200, token: userAToken });
  await runCase({ routeKey: "notifications.read", family: "customer", case: "User B không đọc notification user A", method: "PATCH", path: `/api/notifications/${notificationId}/read`, expected: 404, token: userBToken, severity: "P0" });
  await runCase({ routeKey: "notifications.read", family: "customer", case: "Đánh dấu notification đã đọc", method: "PATCH", path: `/api/notifications/${notificationId}/read`, expected: 200, token: userAToken });
  await runCase({ routeKey: "notifications.readAll", family: "customer", case: "Đọc tất cả notification", method: "PATCH", path: "/api/notifications/read-all", expected: 200, token: userAToken });

  await runCase({ routeKey: "me.warranties", family: "customer", case: "Danh sách bảo hành", method: "GET", path: "/api/me/warranties", expected: 200, token: userAToken });
  await runCase({ routeKey: "me.invoices", family: "customer", case: "Danh sách hóa đơn", method: "GET", path: "/api/me/invoices", expected: 200, token: userAToken });
  await runCase({ routeKey: "me.vouchers", family: "customer", case: "Danh sách voucher", method: "GET", path: "/api/me/vouchers", expected: 200, token: userAToken });
  await runCase({ routeKey: "smember.profile", family: "customer", case: "Smember profile", method: "GET", path: "/api/smember/profile", expected: 200, token: userAToken });
  await runCase({ routeKey: "events.viewProduct", family: "engagement", case: "Track product view", method: "POST", path: "/api/user-events/view-product", expected: 201, token: userAToken, body: { productId: product.id, slug: product.slug }, severity: "P1", findingTitle: "Xung đột tên index user_events làm track product view trả 500" });
  await runCase({ routeKey: "products.recent", family: "customer", case: "Recently viewed", method: "GET", path: "/api/products/recently-viewed?limit=5", expected: 200, token: userAToken, severity: "P1", findingTitle: "Xung đột tên index user_events làm recently-viewed trả 500" });
}

function orderPayload(paymentMethod = "cod", couponCode = "") {
  return {
    items: [{ productId: product.id, slug: product.slug, sku: product.sku, name: product.name, quantity: 1 }],
    customer: { fullName: "API Audit Customer", email: userA?.email, phone: "0930000001" },
    receiver: { fullName: "API Audit Receiver", email: userA?.email, phone: "0930000001" },
    shippingAddress: { province: "Hồ Chí Minh", district: "Quận 1", ward: "Bến Nghé", addressLine: "1 Đường Test", fullAddress: "1 Đường Test, Bến Nghé, Quận 1, Hồ Chí Minh" },
    shippingChoice: { method: "delivery", fee: 0 }, paymentMethod, couponCode,
    note: AUDIT_MARKER, termsAccepted: true, clearCart: false,
  };
}

async function runCommerceTests() {
  const inv = await runCase({ routeKey: "admin.inventory.create", family: "admin", case: "Admin tạo inventory", method: "POST", path: "/api/admin/inventory", expected: 201, token: adminToken, body: { key: `audit-inventory-${RUN_ID}`, productId: product.id, productSlug: product.slug, productSku: product.sku, productName: product.name, stock: 30, reservedStock: 0, status: "in_stock", note: AUDIT_MARKER } });
  inventory = inv.body?.data;
  const couponCreated = await runCase({ routeKey: "admin.coupons.create", family: "admin", case: "Admin tạo coupon", method: "POST", path: "/api/admin/coupons", expected: 201, token: adminToken, body: { code: `AUDIT${RUN_ID.slice(-6)}`, name: "API Audit Coupon", type: "fixed", value: 100000, minSubtotal: 1000000, audiences: ["all"], status: "active", startsAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() } });
  coupon = couponCreated.body?.data;

  await runCase({ routeKey: "checkout.preview", family: "commerce", case: "Checkout preview", method: "POST", path: "/api/checkout/preview", expected: 200, token: userAToken, body: orderPayload("cod"), assert: ({ body }) => Number(body?.data?.total) > 0 });
  await runCase({ routeKey: "checkout.preview", family: "commerce", case: "Checkout không có item", method: "POST", path: "/api/checkout/preview", expected: 400, token: userAToken, body: { items: [] } });
  await runCase({ routeKey: "checkout.preview", family: "commerce", case: "Checkout quá 30 item", method: "POST", path: "/api/checkout/preview", expected: 400, token: userAToken, body: { ...orderPayload(), items: Array(31).fill(orderPayload().items[0]) } });
  await runCase({ routeKey: "checkout.preview", family: "commerce", case: "Quantity vượt 99", method: "POST", path: "/api/checkout/preview", expected: 400, token: userAToken, body: { ...orderPayload(), items: [{ ...orderPayload().items[0], quantity: 100 }] } });
  await runCase({ routeKey: "coupons.apply", family: "commerce", case: "Coupon hợp lệ", method: "POST", path: "/api/coupons/apply", expected: 200, token: userAToken, body: { code: coupon?.code, subtotal: 4890000, shippingFee: 0 } });
  await runCase({ routeKey: "coupons.validate", family: "commerce", case: "Coupon sai", method: "POST", path: "/api/coupons/validate", expected: 400, token: userAToken, body: { code: "NOT-EXIST", items: orderPayload().items } });
  await runCase({ routeKey: "coupons.available", family: "commerce", case: "Coupon có thể dùng", method: "GET", path: "/api/coupons/available?subtotal=5000000", expected: 200, token: userAToken });

  const created = await runCase({ routeKey: "orders.create", family: "commerce", case: "Tạo đơn COD", method: "POST", path: "/api/orders", expected: 201, token: userAToken, body: orderPayload("cod", coupon?.code), severity: "P0", assert: ({ body }) => Boolean(body?.data?.orderCode && body?.data?.totals && body?.data?.payment) });
  order = created.body?.data;
  if (!order?.orderCode) throw new Error("Không tạo được order fixture.");
  await runCase({ routeKey: "orders.create", family: "commerce", case: "Tạo đơn payload sai", method: "POST", path: "/api/orders", expected: 400, token: userAToken, body: { items: [] } });
  await runCase({ routeKey: "orders.list", family: "commerce", case: "List order không đăng nhập", method: "GET", path: "/api/orders", expected: 401 });
  await runCase({ routeKey: "orders.list", family: "commerce", case: "List order user A", method: "GET", path: "/api/orders", expected: 200, token: userAToken });
  await runCase({ routeKey: "orders.detail", family: "commerce", case: "User B không đọc order user A", method: "GET", path: `/api/orders/${order.orderCode}`, expected: 403, token: userBToken, severity: "P0" });
  await runCase({ routeKey: "orders.detail", family: "commerce", case: "Chi tiết order", method: "GET", path: `/api/orders/${order.orderCode}`, expected: 200, token: userAToken });
  await runCase({ routeKey: "orders.tracking", family: "commerce", case: "Tracking order", method: "GET", path: `/api/orders/${order.orderCode}/tracking`, expected: 200, token: userAToken });
  await runCase({ routeKey: "orders.invoice", family: "commerce", case: "Invoice order", method: "GET", path: `/api/orders/${order.orderCode}/invoice`, expected: 200, token: userAToken });
  await runCase({ routeKey: "orders.paymentQr", family: "commerce", case: "Bank QR mock", method: "POST", path: `/api/orders/${order.orderCode}/payment/qr`, expected: 200, token: userAToken, assert: ({ body }) => Boolean(body?.data?.payment) });
  await runCase({ routeKey: "orders.paymentConfirm", family: "commerce", case: "Customer không xác nhận payment", method: "POST", path: `/api/orders/${order.orderCode}/payment/confirm`, expected: 401, token: userAToken, body: { amount: order.totals?.total } });

  const bankHeaders = { "X-Bank-Webhook-Secret": `bank-audit-${RUN_ID}` };
  await Promise.all(Array.from({ length: 2 }, (_, index) => runCase({ routeKey: "payments.webhook", family: "commerce", case: `Webhook idempotency ${index + 1}/2`, method: "POST", path: "/api/payments/bank-transfer-webhook", expected: [200, 404], headers: bankHeaders, body: { orderCode: order.orderCode, amount: order.totals?.total, bankReference: `AUDIT-${RUN_ID}`, status: "paid" } })));

  const shipmentCreated = await runCase({ routeKey: "admin.shipments.create", family: "admin", case: "Admin tạo shipment", method: "POST", path: "/api/admin/shipments", expected: 201, token: adminToken, body: { orderCode: order.orderCode, carrier: "API Audit Carrier", trackingCode: `TRACK-${RUN_ID}`, status: "shipping", receiverName: "API Audit Receiver", receiverPhone: "0930000001", shippingAddress: order.shippingAddress || {}, note: AUDIT_MARKER } });
  shipment = shipmentCreated.body?.data;

  await testDb.collection("smember_orders").updateOne({ orderCode: order.orderCode }, { $set: { status: "completed", statusLabel: "Hoàn tất", updatedAt: new Date() } });
  const returned = await runCase({ routeKey: "returns.create", family: "commerce", case: "Tạo yêu cầu đổi trả", method: "POST", path: "/api/returns", expected: 201, token: userAToken, body: { orderCode: order.orderCode, productId: product.id, productSlug: product.slug, productName: product.name, reason: "Sản phẩm fixture cần kiểm thử đổi trả", customerPhone: "0930000001", images: [], note: AUDIT_MARKER } });
  returnRequest = returned.body?.data;
  await runCase({ routeKey: "returns.list", family: "commerce", case: "Danh sách đổi trả", method: "GET", path: "/api/returns", expected: 200, token: userAToken });
  if (returnRequest?.id || returnRequest?.requestCode) {
    await runCase({ routeKey: "returns.detail", family: "commerce", case: "Chi tiết đổi trả", method: "GET", path: `/api/returns/${returnRequest.id || returnRequest.requestCode}`, expected: 200, token: userAToken });
    await runCase({ routeKey: "returns.detail", family: "commerce", case: "User B không đọc đổi trả user A", method: "GET", path: `/api/returns/${returnRequest.id || returnRequest.requestCode}`, expected: 403, token: userBToken, severity: "P0" });
  }
  await runCase({ routeKey: "warranty.check.get", family: "commerce", case: "Tra bảo hành GET", method: "GET", path: `/api/warranty/check?orderCode=${order.orderCode}`, expected: 200, token: userAToken });
  await runCase({ routeKey: "warranty.check.post", family: "commerce", case: "Tra bảo hành POST", method: "POST", path: "/api/warranty/check", expected: 200, token: userAToken, body: { orderCode: order.orderCode } });
}

async function runEngagementTests() {
  await runCase({ routeKey: "newsletter.subscribe", family: "engagement", case: "Newsletter chưa đồng ý điều khoản", method: "POST", path: "/api/newsletter/subscribe", expected: 400, body: { email: `newsletter.${RUN_ID}@example.test`, accepted: false } });
  await runCase({ routeKey: "newsletter.subscribe", family: "engagement", case: "Newsletter dùng SMTP mock", method: "POST", path: "/api/newsletter/subscribe", expected: 200, body: { email: `newsletter.${RUN_ID}@example.test`, phone: "0940000001", accepted: true } });
  const support = await runCase({ routeKey: "support.create", family: "engagement", case: "Tạo support request", method: "POST", path: "/api/support-requests", expected: 201, token: userAToken, body: { issueType: "order", fullName: "API Audit User", email: userA.email, phone: "0930000001", orderCode: order?.orderCode, content: "Nội dung hỗ trợ dùng riêng cho API audit.", preferredContact: "email" } });
  supportRequest = support.body?.data;
  await runCase({ routeKey: "support.create", family: "engagement", case: "Support payload sai", method: "POST", path: "/api/support-requests", expected: 400, body: {} });
  await runCase({ routeKey: "support.mine", family: "engagement", case: "Support mine", method: "GET", path: "/api/support-requests/mine", expected: 200, token: userAToken });
  if (supportRequest?.requestCode) {
    await runCase({ routeKey: "support.detail", family: "engagement", case: "User B không đọc support user A", method: "GET", path: `/api/support-requests/${supportRequest.requestCode}`, expected: 403, token: userBToken, severity: "P0" });
    await runCase({ routeKey: "support.detail", family: "engagement", case: "Chi tiết support", method: "GET", path: `/api/support-requests/${supportRequest.requestCode}`, expected: 200, token: userAToken });
    await runCase({ routeKey: "support.message", family: "engagement", case: "Gửi support message", method: "POST", path: `/api/support-requests/${supportRequest.requestCode}/messages`, expected: 201, token: userAToken, body: { content: "Phản hồi audit." } });
  }
  await runCase({ routeKey: "events.create", family: "engagement", case: "Event search", method: "POST", path: "/api/events", expected: 201, token: userAToken, body: { type: "search", keyword: "audit phone" }, severity: "P1", findingTitle: "Xung đột tên index user_events làm event API trả 500" });
  await runCase({ routeKey: "events.create", family: "engagement", case: "Event type sai", method: "POST", path: "/api/events", expected: 400, body: { type: "invalid-event" }, severity: "P1", findingTitle: "Xung đột tên index user_events chặn validation event type" });
  await runCase({ routeKey: "recommendations.trending", family: "engagement", case: "Recommendation trending", method: "GET", path: "/api/recommendations/trending?limit=5", expected: 200, severity: "P1", findingTitle: "Xung đột tên index user_events làm recommendation trending trả 500" });
  await runCase({ routeKey: "recommendations.forYou", family: "engagement", case: "Recommendation for-you", method: "GET", path: "/api/recommendations/for-you?limit=5", expected: 200, token: userAToken, severity: "P1", findingTitle: "Xung đột tên index user_events làm recommendation for-you trả 500" });
  await runCase({ routeKey: "chatbot.message", family: "engagement", case: "Chatbot message", method: "POST", path: "/api/chatbot/message", expected: 200, token: userAToken, body: { message: "AuditBrand" } });
  await runCase({ routeKey: "chatbot.message", family: "engagement", case: "Chatbot message rỗng", method: "POST", path: "/api/chatbot/message", expected: 400, body: { message: "" } });
}

async function runAdminTests() {
  const listRoutes = [
    ["admin.root", "/api/admin"], ["admin.summary", "/api/admin/summary"], ["admin.business.list", "/api/admin/business-verifications"],
    ["admin.users.list", "/api/admin/users"], ["admin.orders.list", "/api/admin/orders"], ["admin.inventory.list", "/api/admin/inventory"],
    ["admin.payments.list", "/api/admin/payments"], ["admin.shipments.list", "/api/admin/shipments"], ["admin.revenue", "/api/admin/revenue"],
    ["admin.reviews.list", "/api/admin/reviews"], ["admin.questions.list", "/api/admin/questions"], ["admin.returns.list", "/api/admin/returns"],
    ["admin.coupons.list", "/api/admin/coupons"], ["admin.support.list", "/api/admin/support-requests"], ["admin.auditLogs", "/api/admin/audit-logs"],
  ];
  for (const [routeKey, endpoint] of listRoutes) {
    await runCase({ routeKey, family: "admin", case: "Customer bị chặn khỏi admin", method: "GET", path: endpoint, expected: 401, token: userAToken, severity: "P0" });
    await runCase({ routeKey, family: "admin", case: "Admin đọc resource", method: "GET", path: endpoint, expected: 200, token: adminToken, severity: "P1" });
  }
  await runCase({ routeKey: "admin.export", family: "admin", case: "Customer bị chặn export", method: "GET", path: "/api/admin/export/orders.csv", expected: 401, token: userAToken, severity: "P0" });
  await runCase({ routeKey: "admin.export", family: "admin", case: "Admin export CSV", method: "GET", path: "/api/admin/export/orders.csv", expected: 200, token: adminToken });

  const userId = userB?.id || "507f1f77bcf86cd799439011";
  await runCase({ routeKey: "admin.users.update", family: "admin", case: "Admin cập nhật user", method: "PATCH", path: `/api/admin/users/${userId}`, expected: 200, token: adminToken, body: { customerType: "normal", status: "active" } });
  await runCase({ routeKey: "admin.users.delete", family: "admin", case: "Customer không xóa user", method: "DELETE", path: `/api/admin/users/${userId}`, expected: 401, token: userAToken, severity: "P0" });
  await runCase({ routeKey: "admin.business.update", family: "admin", case: "Business verification ID không tồn tại", method: "PATCH", path: "/api/admin/business-verifications/507f1f77bcf86cd799439011", expected: 404, token: adminToken, body: { status: "verified" } });

  if (order?.id || order?.orderCode) {
    const orderId = order.id || order.orderCode;
    await runCase({ routeKey: "admin.orders.update", family: "admin", case: "Admin cập nhật order", method: "PATCH", path: `/api/admin/orders/${orderId}`, expected: 200, token: adminToken, body: { status: "completed", note: AUDIT_MARKER } });
    await runCase({ routeKey: "admin.orders.invoice", family: "admin", case: "Admin cập nhật invoice", method: "PATCH", path: `/api/admin/orders/${orderId}/invoice`, expected: 200, token: adminToken, body: { requested: true, companyName: "API Audit Co", taxCode: "0000000000", companyAddress: "Test", invoiceEmail: "invoice@example.test", invoiceStatus: "pending" } });
  }
  if (inventory?.id || inventory?.key) {
    const inventoryId = inventory.id || inventory.key;
    await runCase({ routeKey: "admin.inventory.update", family: "admin", case: "Admin cập nhật inventory", method: "PATCH", path: `/api/admin/inventory/${inventoryId}`, expected: 200, token: adminToken, body: { stock: 25 } });
  }
  await runCase({ routeKey: "admin.inventory.create", family: "admin", case: "Customer không tạo inventory", method: "POST", path: "/api/admin/inventory", expected: 401, token: userAToken, body: { key: "forbidden", productId: product.id } });
  await runCase({ routeKey: "admin.inventory.delete", family: "admin", case: "Inventory ID không tồn tại", method: "DELETE", path: "/api/admin/inventory/not-found-audit", expected: 404, token: adminToken });
  await runCase({ routeKey: "admin.payments.update", family: "admin", case: "Payment ID không tồn tại", method: "PATCH", path: "/api/admin/payments/507f1f77bcf86cd799439011", expected: 404, token: adminToken, body: { status: "failed", note: AUDIT_MARKER } });
  if (shipment?.id || shipment?.trackingCode) {
    const shipmentId = shipment.id || shipment.trackingCode;
    await runCase({ routeKey: "admin.shipments.update", family: "admin", case: "Admin cập nhật shipment", method: "PATCH", path: `/api/admin/shipments/${shipmentId}`, expected: 200, token: adminToken, body: { status: "delivered" } });
  }
  await runCase({ routeKey: "admin.shipments.delete", family: "admin", case: "Shipment ID không tồn tại", method: "DELETE", path: "/api/admin/shipments/not-found-audit", expected: 404, token: adminToken });
  if (reviewId) await runCase({ routeKey: "admin.reviews.update", family: "admin", case: "Admin duyệt review", method: "PATCH", path: `/api/admin/reviews/${reviewId}`, expected: 200, token: adminToken, body: { status: "approved" } });
  else await runCase({ routeKey: "admin.reviews.update", family: "admin", case: "Review ID không tồn tại", method: "PATCH", path: "/api/admin/reviews/507f1f77bcf86cd799439011", expected: 404, token: adminToken, body: { status: "approved" } });
  await runCase({ routeKey: "admin.reviews.delete", family: "admin", case: "Customer không xóa review", method: "DELETE", path: `/api/admin/reviews/${reviewId || "507f1f77bcf86cd799439011"}`, expected: 401, token: userAToken });
  if (questionId) await runCase({ routeKey: "admin.questions.update", family: "admin", case: "Admin trả lời câu hỏi", method: "PATCH", path: `/api/admin/questions/${questionId}`, expected: 200, token: adminToken, body: { status: "answered", answer: "Bảo hành theo chính sách audit." } });
  else await runCase({ routeKey: "admin.questions.update", family: "admin", case: "Question ID không tồn tại", method: "PATCH", path: "/api/admin/questions/507f1f77bcf86cd799439011", expected: 404, token: adminToken, body: { status: "answered" } });
  await runCase({ routeKey: "admin.questions.delete", family: "admin", case: "Customer không xóa question", method: "DELETE", path: `/api/admin/questions/${questionId || "507f1f77bcf86cd799439011"}`, expected: 401, token: userAToken });
  if (returnRequest?.id) await runCase({ routeKey: "admin.returns.update", family: "admin", case: "Admin cập nhật return", method: "PATCH", path: `/api/admin/returns/${returnRequest.id}`, expected: 200, token: adminToken, body: { status: "approved", adminNote: AUDIT_MARKER } });
  else await runCase({ routeKey: "admin.returns.update", family: "admin", case: "Return ID không tồn tại", method: "PATCH", path: "/api/admin/returns/507f1f77bcf86cd799439011", expected: 404, token: adminToken, body: { status: "approved" } });
  await runCase({ routeKey: "admin.returns.delete", family: "admin", case: "Customer không xóa return", method: "DELETE", path: `/api/admin/returns/${returnRequest?.id || "507f1f77bcf86cd799439011"}`, expected: 401, token: userAToken });
  if (coupon?.id) await runCase({ routeKey: "admin.coupons.update", family: "admin", case: "Admin cập nhật coupon", method: "PATCH", path: `/api/admin/coupons/${coupon.id}`, expected: 200, token: adminToken, body: { description: AUDIT_MARKER } });
  else await runCase({ routeKey: "admin.coupons.update", family: "admin", case: "Coupon ID không tồn tại", method: "PATCH", path: "/api/admin/coupons/507f1f77bcf86cd799439011", expected: 404, token: adminToken, body: { status: "inactive" } });
  await runCase({ routeKey: "admin.coupons.delete", family: "admin", case: "Customer không xóa coupon", method: "DELETE", path: `/api/admin/coupons/${coupon?.id || "507f1f77bcf86cd799439011"}`, expected: 401, token: userAToken });
  if (supportRequest?.id) await runCase({ routeKey: "admin.support.update", family: "admin", case: "Admin cập nhật support", method: "PATCH", path: `/api/admin/support-requests/${supportRequest.id}`, expected: 200, token: adminToken, body: { status: "in_progress", response: "Đang xử lý audit." } });
  else await runCase({ routeKey: "admin.support.update", family: "admin", case: "Support ID không tồn tại", method: "PATCH", path: "/api/admin/support-requests/507f1f77bcf86cd799439011", expected: 404, token: adminToken, body: { status: "closed" } });
  await runCase({ routeKey: "admin.support.delete", family: "admin", case: "Customer không xóa support", method: "DELETE", path: `/api/admin/support-requests/${supportRequest?.id || "507f1f77bcf86cd799439011"}`, expected: 401, token: userAToken });

  // Destructive happy paths are last and affect only the isolated test database.
  if (address?.id) await runCase({ routeKey: "addresses.delete", family: "customer", case: "Xóa địa chỉ test", method: "DELETE", path: `/api/addresses/${address.id}`, expected: 200, token: userAToken });
  if (notificationId) await runCase({ routeKey: "notifications.delete", family: "customer", case: "Xóa notification test", method: "DELETE", path: `/api/notifications/${notificationId}`, expected: 200, token: userAToken });
  await runCase({ routeKey: "wishlist.delete", family: "customer", case: "Xóa wishlist test", method: "DELETE", path: `/api/wishlist/${product.slug}`, expected: 200, token: userAToken });
  if (shipment?.id || shipment?.trackingCode) await runCase({ routeKey: "admin.shipments.delete", family: "admin", case: "Admin xóa shipment test", method: "DELETE", path: `/api/admin/shipments/${shipment.id || shipment.trackingCode}`, expected: 200, token: adminToken });
  if (inventory?.id || inventory?.key) await runCase({ routeKey: "admin.inventory.delete", family: "admin", case: "Admin xóa inventory test", method: "DELETE", path: `/api/admin/inventory/${inventory.id || inventory.key}`, expected: 200, token: adminToken });
  if (coupon?.id) await runCase({ routeKey: "admin.coupons.delete", family: "admin", case: "Admin xóa coupon test", method: "DELETE", path: `/api/admin/coupons/${coupon.id}`, expected: 200, token: adminToken });
  if (secondProduct?.slug) await runCase({ routeKey: "products.delete", family: "products", case: "Admin xóa product test", method: "DELETE", path: `/api/products/${secondProduct.slug}`, expected: 200, token: adminToken });
}

function accountForUncoveredRoutes(reason = "Không đạt được fixture tiên quyết trong lần chạy này.") {
  const covered = new Set(state.results.map((result) => result.routeKey));
  for (const route of API_ROUTE_INVENTORY) if (!covered.has(route.key)) addSkip(route, reason);
}

function csvEscape(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${String(text).replace(/"/g, '""')}"`;
}

function buildCsv() {
  const columns = ["id", "routeKey", "family", "method", "path", "case", "expectedStatus", "actualStatus", "outcome", "durationMs", "note"];
  return [columns.join(","), ...state.results.map((result) => columns.map((column) => csvEscape(result[column])).join(","))].join("\n") + "\n";
}

function buildMarkdown() {
  const counts = state.results.reduce((acc, result) => { acc[result.outcome] = (acc[result.outcome] || 0) + 1; return acc; }, {});
  const durations = state.results.filter((r) => r.durationMs > 0).map((r) => r.durationMs);
  const statuses = state.results.reduce((acc, r) => { const key = r.actualStatus ?? "none"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const covered = new Set(state.results.filter((r) => r.outcome !== "skip").map((r) => r.routeKey));
  const routeCoverage = API_ROUTE_INVENTORY.length ? Math.round(covered.size / API_ROUTE_INVENTORY.length * 10_000) / 100 : 0;
  const familyRows = [...new Set(API_ROUTE_INVENTORY.map((route) => route.family))].map((family) => {
    const inventory = API_ROUTE_INVENTORY.filter((route) => route.family === family);
    const familyCovered = inventory.filter((route) => covered.has(route.key)).length;
    return `| ${family} | ${familyCovered}/${inventory.length} | ${Math.round(familyCovered / inventory.length * 100)}% |`;
  }).join("\n");
  const findingRows = state.findings.length ? state.findings.map((finding) => `| ${finding.id} | ${finding.severity} | ${finding.classification} | ${finding.method} ${finding.endpoint} | ${finding.title.replace(/\|/g, "\\|")} |`).join("\n") : "| - | - | - | - | Không phát hiện finding từ expectation đã khai báo. |";
  const findingDetails = state.findings.map((finding) => `### ${finding.id} — ${finding.severity}: ${finding.title}\n\n- Endpoint: \`${finding.method} ${finding.endpoint}\`\n- Phân loại: ${finding.classification}\n- Bước tái hiện: chạy case tương ứng trong \`api-test-matrix.csv\` bằng database tạm của run này.\n- Payload đã che: \`${safeString(JSON.stringify(finding.request), 500).replace(/`/g, "'")}\`\n- Expected: ${finding.expected}\n- Actual: ${finding.actual}; HTTP ${finding.statusCode ?? "không có"}\n- Bằng chứng rút gọn: \`${safeString(JSON.stringify(finding.evidence), 600).replace(/`/g, "'")}\`\n- Đề xuất: ${finding.recommendation}\n`).join("\n");
  return `# Báo cáo kiểm thử toàn bộ API — ${RUN_ID}\n\n## Kết luận nhanh\n\nĐây là báo cáo **trước khi sửa**. Runner dùng database tạm \`${DATABASE_NAME}\`, cổng \`${PORT}\`, SMTP/Google OAuth/ngân hàng được mock; probe cửa hàng chỉ đọc và không làm fail suite. Không có password, OTP, JWT, secret, connection string hoặc hash thật trong artifact.\n\n- Thời gian: ${state.startedAt} → ${state.finishedAt || "đang hoàn tất"}\n- Khởi động: **${state.startup.status}** — ${state.startup.message}\n- Tổng case: **${state.results.length}**; pass **${counts.pass || 0}**; fail **${counts.fail || 0}**; skip **${counts.skip || 0}**; external-blocked **${counts["external-blocked"] || 0}**\n- Độ phủ nhánh route thực thi: **${covered.size}/${API_ROUTE_INVENTORY.length} (${routeCoverage}%)**\n- Thời gian đáp ứng: p50 **${percentile(durations, 0.5)} ms**; p95 **${percentile(durations, 0.95)} ms**\n- Status distribution: \`${JSON.stringify(statuses)}\`\n- Cleanup database: **${state.cleanup.status}**; databaseDropped=${state.cleanup.databaseDropped}; liveDatabaseClean=${state.cleanup.liveDatabaseClean}; tempRemoved=${state.cleanup.tempRemoved}\n\n## Kiểm tra password hash\n\n- Thuật toán: ${state.passwordHashCheck?.algorithm || "chưa chạy"}\n- Iterations: ${state.passwordHashCheck?.iterations || "chưa chạy"}\n- Hai tài khoản cùng mật khẩu có hash giống nhau: **${state.passwordHashCheck?.hashesEqual ?? "chưa chạy"}**\n- Hash thật được ghi vào báo cáo: **false**\n\n## Độ phủ theo nhóm\n\n| Nhóm | Nhánh đã chạy | Tỷ lệ |\n|---|---:|---:|\n${familyRows}\n\n## Findings\n\n| ID | Mức | Phân loại | Endpoint | Mô tả |\n|---|---|---|---|---|\n${findingRows}\n\n${findingDetails || ""}\n## Trạng thái cleanup\n\n${state.cleanup.message || "Cleanup chưa có kết quả."}\n\n## Artifact\n\n- \`api-test-matrix.csv\`: ma trận case/status.\n- \`api-test-results.json\`: kết quả máy đọc đã sanitize.\n- Mock mail và environment tạm nằm trong \`.tmp/api-audit/${RUN_ID}/\` trong lúc chạy và được xóa ở \`finally\`.\n`;
}

async function writeReports() {
  state.finishedAt = new Date().toISOString();
  await fsp.mkdir(REPORT_DIR, { recursive: true });
  const serializable = sanitize(state);
  await Promise.all([
    fsp.writeFile(RESULT_JSON, `${JSON.stringify(serializable, null, 2)}\n`, "utf8"),
    fsp.writeFile(MATRIX_CSV, buildCsv(), "utf8"),
    fsp.writeFile(REPORT_MD, buildMarkdown(), "utf8"),
  ]);
}

async function cleanup() {
  const messages = [];
  try {
    await stopServer();
    messages.push("Backend audit đã dừng.");
  } catch (error) {
    messages.push(`Không dừng backend sạch: ${safeString(error.message)}`);
  }

  try {
    if (!DATABASE_NAME.startsWith(TEST_DB_PREFIX) || !/^cosarii_api_test_\d{14}$/.test(DATABASE_NAME)) throw new Error(`Từ chối drop database không khớp guard: ${DATABASE_NAME}`);
    if (!mongoClient) {
      mongoClient = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
      await mongoClient.connect();
    }
    await mongoClient.db(DATABASE_NAME).dropDatabase();
    const remaining = await mongoClient.db("admin").admin().listDatabases({ nameOnly: true });
    state.cleanup.databaseDropped = !remaining.databases.some((item) => item.name === DATABASE_NAME);
    messages.push(state.cleanup.databaseDropped ? `Đã xóa và xác nhận không còn database ${DATABASE_NAME}.` : `Database ${DATABASE_NAME} vẫn còn sau cleanup.`);

    const liveDbName = process.env.API_AUDIT_LIVE_DB_NAME || "cosarii";
    if (liveDbName === DATABASE_NAME) throw new Error("Tên live database trùng database test.");
    const live = mongoClient.db(liveDbName);
    const collectionNames = [
      "smember_users", "smember_auth_otps", "smember_carts", "smember_orders", "payments", "coupons",
      "inventory", "user_events", "shipments", "wishlists", "notifications", "addresses", "returns",
      "warranties", "admin_audit_logs", "support_requests", "cellphones_product_details",
      "cellphones_product_reviews", "cellphones_product_questions",
    ];
    let leaked = 0;
    for (const collectionName of collectionNames) {
      leaked += await live.collection(collectionName).countDocuments({ $or: [{ auditMarker: AUDIT_MARKER }, { note: AUDIT_MARKER }, { message: AUDIT_MARKER }] }, { limit: 1 }).catch(() => 0);
    }
    state.cleanup.liveDatabaseClean = leaked === 0;
    messages.push(leaked === 0 ? "Không tìm thấy marker audit trong database cosarii." : `Phát hiện ${leaked} marker audit trong database cosarii.`);
  } catch (error) {
    state.cleanup.message = `Cleanup database lỗi: ${safeString(error.message)}`;
    messages.push(state.cleanup.message);
  }

  try {
    const resolvedTemp = path.resolve(TEMP_DIR);
    const safeRoot = path.resolve(ROOT, ".tmp", "api-audit") + path.sep;
    if (!resolvedTemp.startsWith(safeRoot) || path.basename(resolvedTemp) !== RUN_ID) throw new Error("Từ chối xóa temp path ngoài phạm vi audit.");
    await fsp.rm(resolvedTemp, { recursive: true, force: true });
    state.cleanup.tempRemoved = !fs.existsSync(resolvedTemp);
    messages.push(state.cleanup.tempRemoved ? "Đã xóa dữ liệu OTP/mock/temp." : "Temp directory vẫn còn.");
  } catch (error) {
    messages.push(`Cleanup temp lỗi: ${safeString(error.message)}`);
  }

  state.cleanup.status = state.cleanup.databaseDropped && state.cleanup.liveDatabaseClean && state.cleanup.tempRemoved ? "passed" : "failed";
  state.cleanup.message = messages.join(" ");
  if (mongoClient) await mongoClient.close().catch(() => {});
}

async function main() {
  await fsp.mkdir(TEMP_DIR, { recursive: true });
  await fsp.mkdir(REPORT_DIR, { recursive: true });
  let fatal = null;
  try {
    await startServer();
    mongoClient = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
    await mongoClient.connect();
    testDb = mongoClient.db(DATABASE_NAME);
    await testDb.collection("api_audit_runs").insertOne({ runId: RUN_ID, auditMarker: AUDIT_MARKER, startedAt: STARTED_AT });

    await runSystemAndPublicTests();
    await runAuthTests();
    await runProductTests();
    await runCustomerTests();
    await runCommerceTests();
    await runEngagementTests();
    await runAdminTests();
  } catch (error) {
    fatal = error;
    if (state.startup.status === "pending") state.startup = { status: "failed", message: safeString(error.message) };
    addFinding({ severity: "P0", title: "Runner audit không hoàn thành toàn bộ ma trận", endpoint: "audit-runner", method: "INTERNAL", expected: "Hoàn thành mọi nhóm và luôn cleanup", actual: error.message, statusCode: null, evidence: { stack: safeString(error.stack, 1200) }, recommendation: "Xử lý lỗi fixture/khởi động được ghi trong report rồi chạy lại audit." });
  } finally {
    accountForUncoveredRoutes(fatal ? `Bị chặn sau lỗi runner: ${safeString(fatal.message)}` : "Route đã kiểm kê nhưng thiếu case thực thi; cần bổ sung runner.");
    await cleanup();
    await writeReports();
  }

  const failed = state.results.filter((result) => result.outcome === "fail").length;
  const skipped = state.results.filter((result) => result.outcome === "skip").length;
  process.stdout.write(`API audit ${RUN_ID}: ${state.results.length} cases, ${failed} fail, ${skipped} skip.\n`);
  process.stdout.write(`Report: ${path.relative(ROOT, REPORT_MD)}\n`);
  if (fatal || failed || skipped || state.cleanup.status !== "passed") process.exitCode = 1;
}

main().catch(async (error) => {
  state.startup = { status: "failed", message: safeString(error.message) };
  addFinding({ severity: "P0", title: "Runner audit thất bại ngoài finally", endpoint: "audit-runner", method: "INTERNAL", expected: "Có báo cáo và cleanup", actual: error.message, evidence: safeString(error.stack), recommendation: "Kiểm tra hạ tầng Node/MongoDB và chạy lại." });
  accountForUncoveredRoutes(`Runner lỗi: ${safeString(error.message)}`);
  await cleanup().catch(() => {});
  await writeReports().catch(() => {});
  process.stderr.write(`API audit failed: ${safeString(error.message)}\n`);
  process.exitCode = 1;
});
