const { ObjectId } = require("mongodb");
const { getAuthConfig, publicUser, verifyJwt } = require("./auth-service");

const MAX_ADMIN_LIMIT = 100;

const ORDER_STATUS_LABELS = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  packing: "Đang chuẩn bị hàng",
  ready_for_pickup: "Sẵn sàng nhận tại cửa hàng",
  shipping: "Đang giao hàng",
  completed: "Đã hoàn tất",
  cancelled: "Đã hủy",
};

const ORDER_STATUS_FLOW = Object.keys(ORDER_STATUS_LABELS);
const PAYMENT_STATUS_LABELS = {
  unpaid: "Chưa thanh toán",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
  failed: "Thanh toán lỗi",
};

function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
}

function isAdminAuthorized(req) {
  const expectedKey = process.env.ADMIN_API_KEY;
  const bearerToken = getBearerToken(req);
  const apiKeyHeader = req.headers["x-admin-api-key"];

  if (expectedKey && (bearerToken === expectedKey || apiKeyHeader === expectedKey)) {
    return true;
  }

  if (bearerToken) {
    try {
      const payload = verifyJwt(bearerToken);
      if (payload?.role === "admin") return true;
    } catch {
      // ignore invalid/misconfigured JWT and fall back to API key/local mode
    }
  }

  return false;
}

async function getCollections(getDb) {
  const { db, products, productReviews, productQuestions, orders } = await getDb();
  const { usersCollection, otpCollection } = getAuthConfig();

  return {
    db,
    products,
    reviews: productReviews,
    questions: productQuestions,
    orders,
    users: db.collection(usersCollection),
    otps: db.collection(otpCollection),
  };
}

function sendUnauthorized(res, sendError) {
  sendError(res, 401, "Bạn cần quyền admin để thực hiện thao tác này.");
}

async function handleAdminSummary({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { products, users, otps, reviews, questions, orders } = await getCollections(getDb);
  const now = new Date();

  const [
    totalProducts,
    totalUsers,
    activeUsers,
    blockedUsers,
    pendingOtps,
    totalReviews,
    pendingReviews,
    pendingQuestions,
    totalOrders,
    pendingOrders,
    shippingOrders,
    recentUsers,
    recentProducts,
    recentOrders,
  ] = await Promise.all([
    products.estimatedDocumentCount(),
    users.estimatedDocumentCount(),
    users.countDocuments({ status: { $in: [null, "active"] } }),
    users.countDocuments({ status: "blocked" }),
    otps.countDocuments({ expiresAt: { $gt: now } }),
    reviews.estimatedDocumentCount(),
    reviews.countDocuments({ status: "pending" }),
    questions.countDocuments({ status: "pending" }),
    orders.estimatedDocumentCount(),
    orders.countDocuments({ status: { $in: ["pending", "confirmed", "packing", "ready_for_pickup"] } }),
    orders.countDocuments({ status: "shipping" }),
    users.find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(5).toArray(),
    products
      .find(
        {},
        {
          projection: {
            name: 1,
            sku: 1,
            slug: 1,
            brand: 1,
            price: 1,
            currentPrice: 1,
            primaryImage: 1,
            images: { $slice: 1 },
            updatedAt: 1,
            scrapedAt: 1,
          },
        }
      )
      .sort({ updatedAt: -1, scrapedAt: -1, _id: -1 })
      .limit(6)
      .toArray(),
    orders.find({}).sort({ createdAt: -1, _id: -1 }).limit(6).toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    data: {
      cards: {
        totalProducts,
        totalUsers,
        activeUsers,
        blockedUsers,
        pendingOtps,
        totalReviews,
        pendingReviews,
        pendingQuestions,
        totalOrders,
        pendingOrders,
        shippingOrders,
      },
      recentUsers: recentUsers.map(publicUser),
      recentProducts: recentProducts.map((product) => ({
        id: String(product._id),
        name: product.name,
        sku: product.sku,
        slug: product.slug,
        brand: product.brand,
        price: product.price ?? product.currentPrice ?? null,
        image: product.primaryImage || product.images?.[0] || "",
        updatedAt: product.updatedAt || product.scrapedAt,
      })),
      recentOrders: recentOrders.map(normalizeAdminOrder),
    },
  });
}

function normalizeAdminReview(doc = {}) {
  return {
    id: String(doc._id || doc.id),
    productId: doc.productId || "",
    productSlug: doc.productSlug || "",
    productSku: doc.productSku || "",
    productName: doc.productName || "",
    productUrl: doc.productUrl || "",
    productImage: doc.productImage || "",
    rating: Number(doc.rating || 5),
    authorName: doc.authorName || "Khách hàng CellphoneS",
    email: doc.email || "",
    phone: doc.phone || "",
    content: doc.content || "",
    status: doc.status || "approved",
    adminReply: doc.adminReply || null,
    userId: doc.userId || "",
    userRole: doc.userRole || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function normalizeAdminQuestion(doc = {}) {
  return {
    id: String(doc._id || doc.id),
    productId: doc.productId || "",
    productSlug: doc.productSlug || "",
    productSku: doc.productSku || "",
    productName: doc.productName || "",
    productUrl: doc.productUrl || "",
    productImage: doc.productImage || "",
    authorName: doc.authorName || "Khách hàng CellphoneS",
    email: doc.email || "",
    phone: doc.phone || "",
    question: doc.question || "",
    status: doc.status || "pending",
    answer: doc.answer || null,
    userId: doc.userId || "",
    userRole: doc.userRole || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function normalizeAdminOrder(doc = {}) {
  const status = doc.status || "pending";
  const paymentStatus = doc.payment?.status || "unpaid";

  return {
    id: String(doc._id || doc.id),
    orderCode: doc.orderCode || "",
    userId: doc.userId || "",
    userRole: doc.userRole || "guest",
    source: doc.source || "cellphones-clone",
    status,
    statusLabel: doc.statusLabel || ORDER_STATUS_LABELS[status] || status,
    statusHistory: Array.isArray(doc.statusHistory) ? doc.statusHistory : [],
    adminNote: doc.adminNote || "",
    customer: doc.customer || {},
    receiver: doc.receiver || {},
    shippingAddress: doc.shippingAddress || {},
    shippingChoice: doc.shippingChoice || {},
    items: Array.isArray(doc.items) ? doc.items : [],
    gifts: Array.isArray(doc.gifts) ? doc.gifts : [],
    totals: doc.totals || {},
    payment: {
      ...(doc.payment || {}),
      status: paymentStatus,
      statusLabel: PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus,
    },
    paymentStatus,
    paymentMethod: doc.payment?.method || "cod",
    marketingOptIn: Boolean(doc.marketingOptIn),
    educationOffer: Boolean(doc.educationOffer),
    companyInvoice: doc.companyInvoice || {},
    note: doc.note || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function buildOrderAdminQuery(searchParams) {
  const q = searchParams.get("q");
  const status = searchParams.get("status");
  const paymentStatus = searchParams.get("paymentStatus");
  const query = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { orderCode: regex },
      { "customer.fullName": regex },
      { "customer.email": regex },
      { "customer.phone": regex },
      { "receiver.fullName": regex },
      { "receiver.phone": regex },
      { "shippingAddress.fullAddress": regex },
      { "items.name": regex },
      { "items.slug": regex },
      { "items.sku": regex },
    ];
  }

  if (status && status !== "all") query.status = status;
  if (paymentStatus && paymentStatus !== "all") query["payment.status"] = paymentStatus;

  return query;
}

function sanitizeOrderUpdate(input = {}, req) {
  const update = {};
  const set = {};
  const push = {};
  const status = cleanLimitedText(input.status, 40);
  const paymentStatus = cleanLimitedText(input.paymentStatus || input.payment?.status, 40);
  const now = new Date();

  if (ORDER_STATUS_FLOW.includes(status)) {
    const label = ORDER_STATUS_LABELS[status];
    set.status = status;
    set.statusLabel = label;
    push.statusHistory = {
      status,
      label,
      note: cleanLimitedText(input.statusNote || input.note || input.adminNote, 400),
      changedBy: "admin",
      changedByRole: "admin",
      changedAt: now,
    };
  }

  if (paymentStatus && PAYMENT_STATUS_LABELS[paymentStatus]) {
    set["payment.status"] = paymentStatus;
    set["payment.statusLabel"] = PAYMENT_STATUS_LABELS[paymentStatus];
    if (paymentStatus === "paid") set["payment.paidAt"] = now;
  }

  if (Object.prototype.hasOwnProperty.call(input, "adminNote")) {
    set.adminNote = cleanLimitedText(input.adminNote, 1000);
  }

  if (input.trackingCode !== undefined) {
    set["shippingChoice.trackingCode"] = cleanLimitedText(input.trackingCode, 80);
  }

  if (input.etaText !== undefined) {
    set["shippingChoice.etaText"] = cleanLimitedText(input.etaText, 180);
  }

  set.updatedAt = now;
  update.$set = set;
  if (Object.keys(push).length) update.$push = push;

  return update;
}

async function handleListOrders({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { orders } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 30, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const query = buildOrderAdminQuery(url.searchParams);

  const [total, docs, statusCounts] = await Promise.all([
    orders.countDocuments(query),
    orders
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    orders.aggregate([
      { $match: query },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    statusOptions: ORDER_STATUS_FLOW.map((status) => ({
      value: status,
      label: ORDER_STATUS_LABELS[status],
    })),
    statusCounts: Object.fromEntries(statusCounts.map((item) => [item._id || "pending", item.count])),
    data: docs.map(normalizeAdminOrder),
  });
}

async function handleUpdateOrder({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const orderId = decodeURIComponent(pathParts[3] || "");
  if (!orderId) {
    sendError(res, 400, "Order id không hợp lệ.");
    return;
  }

  const body = await parseJsonBody(req);
  const update = sanitizeOrderUpdate(body, req);
  const query = {
    $or: [
      { orderCode: orderId },
      ...(ObjectId.isValid(orderId) ? [{ _id: new ObjectId(orderId) }] : []),
    ],
  };

  const { orders } = await getCollections(getDb);
  const result = await orders.findOneAndUpdate(
    query,
    update,
    { returnDocument: "after" }
  );

  if (!result?.value) {
    sendError(res, 404, "Không tìm thấy đơn hàng.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    data: normalizeAdminOrder(result.value),
  });

function buildInteractionAdminQuery(searchParams, type = "review") {
  const q = searchParams.get("q");
  const status = searchParams.get("status");
  const product = searchParams.get("product");
  const query = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = type === "question"
      ? [
          { productName: regex },
          { productSlug: regex },
          { productSku: regex },
          { authorName: regex },
          { email: regex },
          { phone: regex },
          { question: regex },
          { "answer.content": regex },
        ]
      : [
          { productName: regex },
          { productSlug: regex },
          { productSku: regex },
          { authorName: regex },
          { email: regex },
          { phone: regex },
          { content: regex },
          { "adminReply.content": regex },
        ];
  }

  if (status && status !== "all") query.status = status;
  if (product) {
    const regex = new RegExp(escapeRegex(product), "i");
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { productName: regex },
          { productSlug: regex },
          { productSku: regex },
          { productId: product },
        ],
      },
    ];
  }

  return query;
}

function cleanLimitedText(value = "", maxLength = 1000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeReviewUpdate(input = {}, req) {
  const update = {};
  const status = cleanLimitedText(input.status, 32);
  const rawReply = typeof input.adminReply === "object"
    ? input.adminReply?.content
    : input.adminReply;
  const replyContent = cleanLimitedText(
    input.reply || rawReply,
    1200
  );

  if (["pending", "approved", "hidden", "rejected"].includes(status)) {
    update.status = status;
  }

  if (replyContent) {
    update.adminReply = {
      content: replyContent,
      repliedAt: new Date(),
      repliedBy: "CellphoneS",
    };
  }

  if (input.clearReply === true) update.adminReply = null;
  update.updatedAt = new Date();
  return update;
}

function sanitizeQuestionUpdate(input = {}, req) {
  const update = {};
  const status = cleanLimitedText(input.status, 32);
  const rawAnswer = typeof input.answer === "object"
    ? input.answer?.content
    : input.answer;
  const answerContent = cleanLimitedText(
    rawAnswer || input.reply || input.content,
    2000
  );

  if (["pending", "answered", "hidden"].includes(status)) {
    update.status = status;
  }

  if (answerContent) {
    update.answer = {
      content: answerContent,
      answeredAt: new Date(),
      answeredBy: "CellphoneS",
    };
    update.status = "answered";
  }

  if (input.clearAnswer === true) {
    update.answer = null;
    update.status = update.status || "pending";
  }

  update.updatedAt = new Date();
  return update;
}

async function handleListReviews({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { reviews } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 30, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const query = buildInteractionAdminQuery(url.searchParams, "review");

  const [total, docs] = await Promise.all([
    reviews.countDocuments(query),
    reviews
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: docs.map(normalizeAdminReview),
  });
}

async function handleUpdateReview({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const reviewId = pathParts[3];
  if (!ObjectId.isValid(reviewId)) {
    sendError(res, 400, "Review id không hợp lệ.");
    return;
  }

  const body = await parseJsonBody(req);
  const update = sanitizeReviewUpdate(body, req);
  const { reviews } = await getCollections(getDb);
  const result = await reviews.findOneAndUpdate(
    { _id: new ObjectId(reviewId) },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result) {
    sendError(res, 404, "Không tìm thấy đánh giá.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    data: normalizeAdminReview(result),
  });
}

async function handleDeleteReview({ req, res, pathParts, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const reviewId = pathParts[3];
  if (!ObjectId.isValid(reviewId)) {
    sendError(res, 400, "Review id không hợp lệ.");
    return;
  }

  const { reviews } = await getCollections(getDb);
  const result = await reviews.findOneAndDelete({ _id: new ObjectId(reviewId) });

  if (!result) {
    sendError(res, 404, "Không tìm thấy đánh giá.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    deleted: normalizeAdminReview(result),
  });
}

async function handleListQuestions({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { questions } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 30, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const query = buildInteractionAdminQuery(url.searchParams, "question");

  const [total, docs] = await Promise.all([
    questions.countDocuments(query),
    questions
      .find(query)
      .sort({ status: 1, createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: docs.map(normalizeAdminQuestion),
  });
}

async function handleUpdateQuestion({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const questionId = pathParts[3];
  if (!ObjectId.isValid(questionId)) {
    sendError(res, 400, "Question id không hợp lệ.");
    return;
  }

  const body = await parseJsonBody(req);
  const update = sanitizeQuestionUpdate(body, req);
  const { questions } = await getCollections(getDb);
  const result = await questions.findOneAndUpdate(
    { _id: new ObjectId(questionId) },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result) {
    sendError(res, 404, "Không tìm thấy câu hỏi.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    data: normalizeAdminQuestion(result),
  });
}

async function handleDeleteQuestion({ req, res, pathParts, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const questionId = pathParts[3];
  if (!ObjectId.isValid(questionId)) {
    sendError(res, 400, "Question id không hợp lệ.");
    return;
  }

  const { questions } = await getCollections(getDb);
  const result = await questions.findOneAndDelete({ _id: new ObjectId(questionId) });

  if (!result?.value) {
    sendError(res, 404, "Không tìm thấy câu hỏi.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    deleted: normalizeAdminQuestion(result.value),
  });

function buildUserQuery(searchParams) {
  const q = searchParams.get("q");
  const role = searchParams.get("role");
  const status = searchParams.get("status");
  const customerType = searchParams.get("customerType");
  const query = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { fullName: regex },
      { email: regex },
      { phone: regex },
      { role: regex },
      { customerType: regex },
    ];
  }

  if (role) query.role = role;
  if (status) query.status = status;
  if (customerType) query.customerType = customerType;

  return query;
}

async function handleListUsers({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { users } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 20, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const query = buildUserQuery(url.searchParams);

  const [total, docs] = await Promise.all([
    users.countDocuments(query),
    users
      .find(query, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: docs.map(publicUser),
  });
}

function sanitizeUserUpdate(input = {}) {
  const allowed = ["fullName", "customerType", "role", "status", "emailVerified"];
  const update = {};

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      update[key] = input[key];
    }
  }

  if (typeof update.fullName === "string") update.fullName = update.fullName.trim();
  if (update.customerType && !["normal", "student", "business"].includes(update.customerType)) {
    delete update.customerType;
  }
  if (update.role && !["customer", "admin"].includes(update.role)) delete update.role;
  if (update.status && !["active", "blocked"].includes(update.status)) delete update.status;
  if (update.emailVerified !== undefined) update.emailVerified = Boolean(update.emailVerified);

  update.updatedAt = new Date();
  return update;
}

async function handleUpdateUser({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const userId = pathParts[3];
  if (!ObjectId.isValid(userId)) {
    sendError(res, 400, "User id không hợp lệ.");
    return;
  }

  const body = await parseJsonBody(req);
  const update = sanitizeUserUpdate(body);

  const { users } = await getCollections(getDb);
  const result = await users.findOneAndUpdate(
    { _id: new ObjectId(userId) },
    { $set: update },
    { returnDocument: "after", projection: { passwordHash: 0 } }
  );

  if (!result) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    data: publicUser(result),
  });
}

async function handleDeleteUser({ req, res, pathParts, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const userId = pathParts[3];
  if (!ObjectId.isValid(userId)) {
    sendError(res, 400, "User id không hợp lệ.");
    return;
  }

  const { users } = await getCollections(getDb);
  const result = await users.findOneAndDelete(
    { _id: new ObjectId(userId) },
    { projection: { passwordHash: 0 } }
  );

  if (!result) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    deleted: publicUser(result),
  });
}

async function handleAdminRequest(context) {
  const { req, res, pathParts, sendError } = context;
  const resource = pathParts[2];
  const identifier = pathParts[3];

  if (!resource && req.method === "GET") {
    await handleAdminSummary(context);
    return;
  }

  if (resource === "summary" && req.method === "GET") {
    await handleAdminSummary(context);
    return;
  }

  if (resource === "users" && !identifier && req.method === "GET") {
    await handleListUsers(context);
    return;
  }

  if (resource === "users" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateUser(context);
    return;
  }

  if (resource === "users" && identifier && req.method === "DELETE") {
    await handleDeleteUser(context);
    return;
  }

  if (resource === "orders" && !identifier && req.method === "GET") {
    await handleListOrders(context);
    return;
  }

  if (resource === "orders" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateOrder(context);
    return;
  }

  if (resource === "reviews" && !identifier && req.method === "GET") {
    await handleListReviews(context);
    return;
  }

  if (resource === "reviews" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateReview(context);
    return;
  }

  if (resource === "reviews" && identifier && req.method === "DELETE") {
    await handleDeleteReview(context);
    return;
  }

  if (resource === "questions" && !identifier && req.method === "GET") {
    await handleListQuestions(context);
    return;
  }

  if (resource === "questions" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateQuestion(context);
    return;
  }

  if (resource === "questions" && identifier && req.method === "DELETE") {
    await handleDeleteQuestion(context);
    return;
  }

  sendError(res, 404, "Admin route not found.");
}

module.exports = {
  handleAdminRequest,
  isAdminAuthorized,
};
