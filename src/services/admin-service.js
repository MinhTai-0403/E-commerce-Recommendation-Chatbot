const { ObjectId } = require("mongodb");
const { getAuthConfig, getAuthToken, publicUser, verifyJwt } = require("./auth-service");
const { getCorsOriginForRequest } = require("../server/http-response");
const {
  couponSchema,
  couponUpdateSchema,
  invoiceUpdateSchema,
  inventoryUpdateSchema,
  parseWithSchema,
  paymentUpdateSchema,
  shipmentSchema,
  shipmentUpdateSchema,
} = require("../validators/ecommerce-validators");

const MAX_ADMIN_LIMIT = 100;

const ORDER_STATUS_LABELS = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  packing: "Đang chuẩn bị hàng",
  ready_for_pickup: "Sẵn sàng nhận tại cửa hàng",
  shipping: "Đang giao hàng",
  completed: "Giao thành công",
  cancelled: "Đã hủy",
  refunded: "Hoàn tiền",
};

const ORDER_STATUS_FLOW = Object.keys(ORDER_STATUS_LABELS);
const PAYMENT_STATUS_LABELS = {
  unpaid: "Chưa thanh toán",
  pending: "Chờ chuyển khoản",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
  failed: "Thanh toán lỗi",
};

const SUPPORT_STATUS_LABELS = {
  new: "Mới tiếp nhận",
  in_progress: "Đang xử lý",
  waiting_customer: "Chờ khách phản hồi",
  resolved: "Đã giải quyết",
  closed: "Đã đóng",
};

const BUSINESS_VERIFICATION_STATUS_LABELS = {
  pending: "Chờ duyệt",
  verified: "Đã duyệt",
  rejected: "Từ chối",
};

const RETURN_STATUS_LABELS = {
  pending: "Chờ tiếp nhận",
  received: "Đã tiếp nhận",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  completed: "Hoàn trả thành công",
  cancelled: "Đã hủy",
};

function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function unwrapMongoWriteResult(result) {
  return result?.value || result || null;
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBearerToken(req) {
  return getAuthToken(req);
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
  const {
    client,
    db,
    productDetails,
    productReviews,
    productQuestions,
    orders,
    payments,
    inventory,
    coupons,
    shipments,
    wishlists,
    notifications,
    addresses,
    returns,
    warranties,
    adminAuditLogs,
  } = await getDb();
  const { usersCollection, otpCollection } = getAuthConfig();

  return {
    client,
    db,
    products: productDetails,
    reviews: productReviews,
    questions: productQuestions,
    orders,
    payments,
    inventory,
    coupons,
    shipments,
    wishlists,
    notifications,
    addresses,
    returns,
    warranties,
    supportRequests: db.collection(process.env.SUPPORT_REQUESTS_COLLECTION || "support_requests"),
    auditLogs: adminAuditLogs,
    users: db.collection(usersCollection),
    otps: db.collection(otpCollection),
  };
}

function sendUnauthorized(res, sendError) {
  sendError(res, 401, "Bạn cần quyền admin để thực hiện thao tác này.");
}

function getAdminPayload(req) {
  const token = getAuthToken(req);
  if (!token) return null;

  try {
    return verifyJwt(token);
  } catch {
    return null;
  }
}

async function writeAdminAuditLog(auditLogs, req, action, targetType, targetId, changes = {}) {
  if (!auditLogs) return;

  const actor = getAdminPayload(req);
  await auditLogs.insertOne({
    actorId: actor?.sub || "",
    actorRole: actor?.role || "admin-api-key",
    actorEmail: actor?.email || "",
    action,
    targetType,
    targetId: String(targetId || ""),
    before: changes.before || null,
    after: changes.after || null,
    meta: changes.meta || {},
    createdAt: new Date(),
  });
}

async function handleAdminSummary({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { products, users, otps, reviews, questions, orders, returns } = await getCollections(getDb);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalProducts,
    totalUsers,
    activeUsers,
    blockedUsers,
    pendingOtps,
    pendingBusinessVerifications,
    totalReviews,
    pendingReviews,
    pendingQuestions,
    pendingReturns,
    totalOrders,
    pendingOrders,
    shippingOrders,
    completedOrders,
    cancelledOrders,
    revenueTodayRows,
    revenueMonthRows,
    recentUsers,
    recentProducts,
    recentOrders,
  ] = await Promise.all([
    products.estimatedDocumentCount(),
    users.estimatedDocumentCount(),
    users.countDocuments({ status: { $in: [null, "active"] } }),
    users.countDocuments({ status: "blocked" }),
    otps.countDocuments({ expiresAt: { $gt: now } }),
    users.countDocuments({ "businessVerification.status": "pending" }),
    reviews.estimatedDocumentCount(),
    reviews.countDocuments({ status: "pending" }),
    questions.countDocuments({ status: "pending" }),
    returns.countDocuments({ status: { $in: ["pending", "received", "approved"] } }),
    orders.estimatedDocumentCount(),
    orders.countDocuments({ status: { $in: ["pending", "confirmed", "packing", "ready_for_pickup"] } }),
    orders.countDocuments({ status: "shipping" }),
    orders.countDocuments({ status: "completed" }),
    orders.countDocuments({ status: "cancelled" }),
    orders.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfToday },
          $or: [{ "payment.status": "paid" }, { status: "completed" }],
        },
      },
      { $group: { _id: null, revenue: { $sum: "$totals.total" }, orders: { $sum: 1 } } },
    ]).toArray(),
    orders.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth },
          $or: [{ "payment.status": "paid" }, { status: "completed" }],
        },
      },
      { $group: { _id: null, revenue: { $sum: "$totals.total" }, orders: { $sum: 1 } } },
    ]).toArray(),
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
        pendingBusinessVerifications,
        totalReviews,
        pendingReviews,
        pendingQuestions,
        pendingReturns,
        totalOrders,
        pendingOrders,
        shippingOrders,
        completedOrders,
        cancelledOrders,
        revenueToday: Number(revenueTodayRows?.[0]?.revenue || 0),
        revenueTodayOrders: Number(revenueTodayRows?.[0]?.orders || 0),
        revenueMonth: Number(revenueMonthRows?.[0]?.revenue || 0),
        revenueMonthOrders: Number(revenueMonthRows?.[0]?.orders || 0),
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

function slugifyAuditKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildInventoryKeyFromOrderItem(item = {}) {
  return [
    item.productId || item.mongoId || item.slug || item.sku,
    item.selectedOptions?.variantId || item.selectedOptions?.variantName || "",
    item.selectedOptions?.colorId || item.selectedOptions?.colorName || "",
  ].map(slugifyAuditKey).filter(Boolean).join("::");
}

async function settleInventoryForOrder(inventory, order = {}, mode = "release") {
  if (!inventory || !Array.isArray(order.items)) return;

  const updates = order.items
    .map((item) => ({
      key: buildInventoryKeyFromOrderItem(item),
      quantity: Math.max(1, Math.round(Number(item.quantity || 1))),
    }))
    .filter((item) => item.key);

  await Promise.all(
    updates.map((item) => {
      const inc = mode === "complete"
        ? { reservedStock: -item.quantity, soldCount: item.quantity }
        : { reservedStock: -item.quantity };

      return inventory.updateOne(
        { key: item.key },
        {
          $inc: inc,
          $set: { updatedAt: new Date() },
        }
      );
    })
  );
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

  const { orders, inventory, auditLogs } = await getCollections(getDb);
  const before = await orders.findOne(query);
  const result = await orders.findOneAndUpdate(
    query,
    update,
    { returnDocument: "after" }
  );
  const updatedOrder = unwrapMongoWriteResult(result);

  if (!updatedOrder) {
    sendError(res, 404, "Không tìm thấy đơn hàng.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "update", "order", updatedOrder._id || orderId, {
    before,
    after: updatedOrder,
  });

  if (before?.status !== updatedOrder.status && ["completed", "cancelled"].includes(updatedOrder.status)) {
    await settleInventoryForOrder(inventory, updatedOrder, updatedOrder.status === "completed" ? "complete" : "release");
  }

  sendJson(res, 200, {
    ok: true,
    data: normalizeAdminOrder(updatedOrder),
  });
}

function normalizeInvoiceUpdate(input = {}) {
  const requested = input.requested !== undefined
    ? Boolean(input.requested)
    : Boolean(input.companyName || input.taxCode || input.companyAddress || input.invoiceEmail || input.email);
  const invoiceEmail = normalizeEmail(input.invoiceEmail || input.email);

  return {
    requested,
    companyName: requested ? cleanLimitedText(input.companyName, 180) : "",
    taxCode: requested ? cleanLimitedText(input.taxCode, 40) : "",
    companyAddress: requested ? cleanLimitedText(input.companyAddress, 320) : "",
    invoiceEmail: requested ? invoiceEmail : "",
    email: requested ? invoiceEmail : "",
    invoiceStatus: requested ? cleanLimitedText(input.invoiceStatus || "pending", 40) : "not_requested",
    note: requested ? cleanLimitedText(input.note, 1000) : "",
  };
}

async function handleUpdateOrderInvoice({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const orderId = decodeURIComponent(pathParts[3] || "");
  if (!orderId) {
    sendError(res, 400, "Order id không hợp lệ.");
    return;
  }

  const parsed = parseWithSchema(invoiceUpdateSchema, await parseJsonBody(req));
  if (!parsed.ok) {
    sendError(res, 400, "Thông tin hóa đơn không hợp lệ.", parsed.message);
    return;
  }

  const { orders, auditLogs } = await getCollections(getDb);
  const query = {
    $or: [
      { orderCode: orderId },
      ...(ObjectId.isValid(orderId) ? [{ _id: new ObjectId(orderId) }] : []),
    ],
  };
  const before = await orders.findOne(query);
  const invoice = normalizeInvoiceUpdate(parsed.data);
  const result = await orders.findOneAndUpdate(
    query,
    {
      $set: {
        companyInvoice: invoice,
        invoiceStatus: invoice.invoiceStatus,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );
  const updatedOrder = unwrapMongoWriteResult(result);

  if (!updatedOrder) {
    sendError(res, 404, "Không tìm thấy đơn hàng.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "update_invoice", "order", updatedOrder._id || orderId, {
    before,
    after: updatedOrder,
  });

  sendJson(res, 200, {
    ok: true,
    message: "Đã cập nhật thông tin hóa đơn.",
    data: normalizeAdminOrder(updatedOrder),
  });
}

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

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase().slice(0, 160);
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
  const { reviews, auditLogs } = await getCollections(getDb);
  const before = await reviews.findOne({ _id: new ObjectId(reviewId) });
  const result = await reviews.findOneAndUpdate(
    { _id: new ObjectId(reviewId) },
    { $set: update },
    { returnDocument: "after" }
  );
  const updatedReview = unwrapMongoWriteResult(result);

  if (!updatedReview) {
    sendError(res, 404, "Không tìm thấy đánh giá.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "update", "review", reviewId, {
    before,
    after: updatedReview,
  });

  sendJson(res, 200, {
    ok: true,
    data: normalizeAdminReview(updatedReview),
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

  const { reviews, auditLogs } = await getCollections(getDb);
  const result = await reviews.findOneAndDelete({ _id: new ObjectId(reviewId) });
  const deletedReview = unwrapMongoWriteResult(result);

  if (!deletedReview) {
    sendError(res, 404, "Không tìm thấy đánh giá.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "delete", "review", reviewId, {
    before: deletedReview,
  });

  sendJson(res, 200, {
    ok: true,
    deleted: normalizeAdminReview(deletedReview),
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
  const { questions, auditLogs } = await getCollections(getDb);
  const before = await questions.findOne({ _id: new ObjectId(questionId) });
  const result = await questions.findOneAndUpdate(
    { _id: new ObjectId(questionId) },
    { $set: update },
    { returnDocument: "after" }
  );
  const updatedQuestion = unwrapMongoWriteResult(result);

  if (!updatedQuestion) {
    sendError(res, 404, "Không tìm thấy câu hỏi.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "update", "question", questionId, {
    before,
    after: updatedQuestion,
  });

  sendJson(res, 200, {
    ok: true,
    data: normalizeAdminQuestion(updatedQuestion),
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

  const { questions, auditLogs } = await getCollections(getDb);
  const result = await questions.findOneAndDelete({ _id: new ObjectId(questionId) });
  const deletedQuestion = unwrapMongoWriteResult(result);

  if (!deletedQuestion) {
    sendError(res, 404, "Không tìm thấy câu hỏi.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "delete", "question", questionId, {
    before: deletedQuestion,
  });

  sendJson(res, 200, {
    ok: true,
    deleted: normalizeAdminQuestion(deletedQuestion),
  });
}

function normalizeAdminBusinessVerification(doc = {}) {
  const business = doc.businessVerification || {};
  const status = business.status || "pending";

  return {
    userId: String(doc._id || doc.id || ""),
    fullName: doc.fullName || doc.username || "",
    accountEmail: doc.email || "",
    accountPhone: doc.phone || "",
    customerType: doc.customerType || "normal",
    status,
    statusLabel: BUSINESS_VERIFICATION_STATUS_LABELS[status] || status,
    companyName: business.companyName || "",
    taxCode: business.taxCode || "",
    companyAddress: business.companyAddress || "",
    representativeName: business.representativeName || "",
    position: business.position || "",
    email: business.email || "",
    phone: business.phone || "",
    registrationDocument: business.registrationDocument || "",
    submittedAt: business.submittedAt || null,
    reviewedAt: business.reviewedAt || null,
    reviewedBy: business.reviewedBy || null,
    reviewNote: business.reviewNote || "",
  };
}

function buildBusinessVerificationQuery(searchParams) {
  const q = searchParams.get("q");
  const status = searchParams.get("status");
  const query = {
    "businessVerification.status": { $exists: true },
  };

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { fullName: regex },
      { email: regex },
      { phone: regex },
      { "businessVerification.companyName": regex },
      { "businessVerification.taxCode": regex },
      { "businessVerification.companyAddress": regex },
      { "businessVerification.representativeName": regex },
      { "businessVerification.email": regex },
      { "businessVerification.phone": regex },
    ];
  }

  if (status && status !== "all" && BUSINESS_VERIFICATION_STATUS_LABELS[status]) {
    query["businessVerification.status"] = status;
  }

  return query;
}

async function handleListBusinessVerifications({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { users } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 30, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const query = buildBusinessVerificationQuery(url.searchParams);

  const countQuery = { ...query };
  delete countQuery["businessVerification.status"];
  countQuery["businessVerification.status"] = { $exists: true };

  const [total, docs, statusCounts] = await Promise.all([
    users.countDocuments(query),
    users
      .find(query, { projection: { passwordHash: 0 } })
      .sort({ "businessVerification.submittedAt": -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    users.aggregate([
      { $match: countQuery },
      { $group: { _id: "$businessVerification.status", count: { $sum: 1 } } },
    ]).toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    statusOptions: Object.entries(BUSINESS_VERIFICATION_STATUS_LABELS).map(([value, label]) => ({ value, label })),
    statusCounts: Object.fromEntries(statusCounts.map((item) => [item._id || "pending", item.count])),
    data: docs.map(normalizeAdminBusinessVerification),
  });
}

async function handleUpdateBusinessVerification({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const userId = decodeURIComponent(pathParts[3] || "");
  if (!ObjectId.isValid(userId)) {
    sendError(res, 400, "User id không hợp lệ.");
    return;
  }

  const body = await parseJsonBody(req);
  const status = cleanLimitedText(body.status, 32);
  const reviewNote = cleanLimitedText(body.reviewNote || body.note, 1500);

  if (!["verified", "rejected"].includes(status)) {
    sendError(res, 400, "Trạng thái duyệt doanh nghiệp không hợp lệ.");
    return;
  }
  if (status === "rejected" && !reviewNote) {
    sendError(res, 400, "Vui lòng nhập lý do từ chối hồ sơ.");
    return;
  }

  const { users, auditLogs } = await getCollections(getDb);
  const objectId = new ObjectId(userId);
  const before = await users.findOne({ _id: objectId }, { projection: { passwordHash: 0 } });

  if (!before?.businessVerification) {
    sendError(res, 404, "Không tìm thấy hồ sơ doanh nghiệp.");
    return;
  }

  const actor = getAdminPayload(req);
  const now = new Date();
  const set = {
    "businessVerification.status": status,
    "businessVerification.reviewedAt": now,
    "businessVerification.reviewedBy": {
      id: actor?.sub || "",
      email: actor?.email || "",
      role: actor?.role || "admin",
    },
    "businessVerification.reviewNote": reviewNote,
    updatedAt: now,
  };
  const update = { $set: set };

  if (status === "verified") {
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    set.customerType = "business";
    set["businessVerification.verifiedAt"] = now;
    set["businessVerification.expiresAt"] = expiresAt;
    update.$addToSet = { memberTags: "S-Business" };
  } else {
    if (before.customerType === "business") set.customerType = "normal";
    update.$pull = { memberTags: "S-Business" };
    update.$unset = {
      "businessVerification.verifiedAt": "",
      "businessVerification.expiresAt": "",
    };
  }

  const result = await users.findOneAndUpdate(
    { _id: objectId },
    update,
    { returnDocument: "after", projection: { passwordHash: 0 } }
  );
  const updated = unwrapMongoWriteResult(result);

  if (!updated) {
    sendError(res, 404, "Không tìm thấy người dùng cần duyệt.");
    return;
  }

  await writeAdminAuditLog(
    auditLogs,
    req,
    status === "verified" ? "approve_business" : "reject_business",
    "business_verification",
    userId,
    { before, after: updated }
  );

  sendJson(res, 200, {
    ok: true,
    message: status === "verified" ? "Đã duyệt hồ sơ S-Business." : "Đã từ chối hồ sơ S-Business.",
    data: normalizeAdminBusinessVerification(updated),
  });
}

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

  const { users, auditLogs } = await getCollections(getDb);
  const before = await users.findOne({ _id: new ObjectId(userId) }, { projection: { passwordHash: 0 } });
  const result = await users.findOneAndUpdate(
    { _id: new ObjectId(userId) },
    { $set: update },
    { returnDocument: "after", projection: { passwordHash: 0 } }
  );
  const updatedUser = unwrapMongoWriteResult(result);

  if (!updatedUser) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "update", "user", userId, {
    before,
    after: updatedUser,
  });

  sendJson(res, 200, {
    ok: true,
    data: publicUser(updatedUser),
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

  const { users, auditLogs } = await getCollections(getDb);
  const result = await users.findOneAndDelete(
    { _id: new ObjectId(userId) },
    { projection: { passwordHash: 0 } }
  );
  const deletedUser = unwrapMongoWriteResult(result);

  if (!deletedUser) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "delete", "user", userId, {
    before: deletedUser,
  });

  sendJson(res, 200, {
    ok: true,
    deleted: publicUser(deletedUser),
  });
}

function normalizeCoupon(doc = {}) {
  return {
    id: String(doc._id || doc.id),
    code: doc.code || "",
    name: doc.name || "",
    description: doc.description || "",
    type: doc.type || "fixed",
    value: Number(doc.value || 0),
    maxDiscount: doc.maxDiscount ?? null,
    minSubtotal: Number(doc.minSubtotal || 0),
    usageLimit: doc.usageLimit ?? null,
    userLimit: doc.userLimit ?? null,
    audiences: Array.isArray(doc.audiences) && doc.audiences.length ? doc.audiences : ["all"],
    allowWithEducationOffer: doc.allowWithEducationOffer !== false,
    usedCount: Number(doc.usedCount || 0),
    status: doc.status || "active",
    startsAt: doc.startsAt || null,
    expiresAt: doc.expiresAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function handleListCoupons({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { coupons } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 30, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const q = url.searchParams.get("q");
  const status = url.searchParams.get("status");
  const query = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [{ code: regex }, { name: regex }, { description: regex }];
  }
  if (status) query.status = status;

  const [total, docs] = await Promise.all([
    coupons.countDocuments(query),
    coupons.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: docs.map(normalizeCoupon),
  });
}

async function handleCreateCoupon({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const parsed = parseWithSchema(couponSchema, await parseJsonBody(req));
  if (!parsed.ok) {
    sendError(res, 400, "Mã giảm giá không hợp lệ.", parsed.message);
    return;
  }

  const { coupons, auditLogs } = await getCollections(getDb);
  const now = new Date();
  const coupon = {
    ...parsed.data,
    code: String(parsed.data.code).trim().toUpperCase(),
    usedCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await coupons.insertOne(coupon);
    coupon._id = result.insertedId;
    await writeAdminAuditLog(auditLogs, req, "create", "coupon", coupon._id, { after: coupon });
    sendJson(res, 201, { ok: true, data: normalizeCoupon(coupon) });
  } catch (error) {
    if (error?.code === 11000) {
      sendError(res, 409, "Mã giảm giá đã tồn tại.");
      return;
    }
    throw error;
  }
}

async function handleUpdateCoupon({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const couponId = pathParts[3];
  if (!ObjectId.isValid(couponId)) {
    sendError(res, 400, "Coupon id không hợp lệ.");
    return;
  }

  const parsed = parseWithSchema(couponUpdateSchema, await parseJsonBody(req));
  if (!parsed.ok) {
    sendError(res, 400, "Mã giảm giá không hợp lệ.", parsed.message);
    return;
  }

  const update = { ...parsed.data, updatedAt: new Date() };
  if (update.code) update.code = String(update.code).trim().toUpperCase();

  const { coupons, auditLogs } = await getCollections(getDb);
  const before = await coupons.findOne({ _id: new ObjectId(couponId) });
  const result = await coupons.findOneAndUpdate(
    { _id: new ObjectId(couponId) },
    { $set: update },
    { returnDocument: "after" }
  );
  const updatedCoupon = unwrapMongoWriteResult(result);

  if (!updatedCoupon) {
    sendError(res, 404, "Không tìm thấy mã giảm giá.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "update", "coupon", couponId, {
    before,
    after: updatedCoupon,
  });

  sendJson(res, 200, { ok: true, data: normalizeCoupon(updatedCoupon) });
}

async function handleDeleteCoupon({ req, res, pathParts, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const couponId = pathParts[3];
  if (!ObjectId.isValid(couponId)) {
    sendError(res, 400, "Coupon id không hợp lệ.");
    return;
  }

  const { coupons, auditLogs } = await getCollections(getDb);
  const result = await coupons.findOneAndDelete({ _id: new ObjectId(couponId) });
  const deletedCoupon = unwrapMongoWriteResult(result);

  if (!deletedCoupon) {
    sendError(res, 404, "Không tìm thấy mã giảm giá.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "delete", "coupon", couponId, {
    before: deletedCoupon,
  });

  sendJson(res, 200, { ok: true, deleted: normalizeCoupon(deletedCoupon) });
}

function normalizeInventory(doc = {}) {
  const stock = Number(doc.stock || 0);
  const reservedStock = Number(doc.reservedStock || 0);
  const availableStock = Math.max(0, stock - reservedStock);

  return {
    id: String(doc._id || ""),
    key: doc.key || "",
    productId: doc.productId || "",
    productSlug: doc.productSlug || "",
    productSku: doc.productSku || "",
    productName: doc.productName || "",
    variantId: doc.variantId || "",
    variantName: doc.variantName || "",
    colorId: doc.colorId || "",
    colorName: doc.colorName || "",
    stock,
    reservedStock,
    availableStock,
    soldCount: Number(doc.soldCount || 0),
    status: doc.status || (availableStock > 0 ? "in_stock" : "out_of_stock"),
    note: doc.note || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function buildInventoryAdminQuery(searchParams) {
  const q = searchParams.get("q");
  const status = searchParams.get("status");
  const query = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { key: regex },
      { productId: regex },
      { productSlug: regex },
      { productSku: regex },
      { productName: regex },
    ];
  }

  if (status && status !== "all") query.status = status;
  return query;
}

function buildInventoryKeyFromBody(input = {}) {
  return cleanLimitedText(
    input.key ||
    [input.productId || input.productSlug || input.productSku, input.variantId || input.variantName, input.colorId || input.colorName]
      .filter(Boolean)
      .join("::"),
    320
  );
}

function sanitizeInventoryCreate(input = {}) {
  const stock = toPositiveInt(input.stock, 0, 1_000_000);
  const reservedStock = toPositiveInt(input.reservedStock, 0, 1_000_000);
  const soldCount = toPositiveInt(input.soldCount, 0, 1_000_000);
  const key = buildInventoryKeyFromBody(input);

  return {
    key,
    productId: cleanLimitedText(input.productId || input.productSlug || input.productSku, 160),
    productSlug: cleanLimitedText(input.productSlug || input.slug, 240),
    productSku: cleanLimitedText(input.productSku || input.sku, 120),
    productName: cleanLimitedText(input.productName || input.name, 500),
    variantId: cleanLimitedText(input.variantId, 120),
    variantName: cleanLimitedText(input.variantName, 240),
    colorId: cleanLimitedText(input.colorId, 120),
    colorName: cleanLimitedText(input.colorName, 240),
    stock,
    reservedStock,
    soldCount,
    status: ["in_stock", "low_stock", "out_of_stock", "inactive"].includes(input.status)
      ? input.status
      : stock - reservedStock > 0
        ? "in_stock"
        : "out_of_stock",
    note: cleanLimitedText(input.note, 1000),
  };
}

async function handleListInventory({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { inventory } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 30, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const query = buildInventoryAdminQuery(url.searchParams);
  const [total, docs] = await Promise.all([
    inventory.countDocuments(query),
    inventory.find(query).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: docs.map(normalizeInventory),
  });
}

async function handleCreateInventory({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const body = await parseJsonBody(req);
  const doc = sanitizeInventoryCreate(body);
  if (!doc.key || !doc.productId) {
    sendError(res, 400, "Tồn kho cần có productId/key hợp lệ.");
    return;
  }

  const { inventory, auditLogs } = await getCollections(getDb);
  const now = new Date();
  const payload = { ...doc, createdAt: now, updatedAt: now };

  try {
    const result = await inventory.insertOne(payload);
    payload._id = result.insertedId;
    await writeAdminAuditLog(auditLogs, req, "create", "inventory", payload._id, { after: payload });
    sendJson(res, 201, { ok: true, data: normalizeInventory(payload) });
  } catch (error) {
    if (error?.code === 11000) {
      sendError(res, 409, "Mã tồn kho đã tồn tại.");
      return;
    }
    throw error;
  }
}

async function handleUpdateInventory({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const identifier = decodeURIComponent(pathParts[3] || "");
  const parsed = parseWithSchema(inventoryUpdateSchema, await parseJsonBody(req));
  if (!parsed.ok) {
    sendError(res, 400, "Dữ liệu tồn kho không hợp lệ.", parsed.message);
    return;
  }

  const update = {};
  for (const key of ["stock", "reservedStock", "soldCount", "status", "note"]) {
    if (parsed.data[key] !== undefined && parsed.data[key] !== "") update[key] = parsed.data[key];
  }
  update.updatedAt = new Date();

  const { inventory, auditLogs } = await getCollections(getDb);
  const query = {
    $or: [
      { key: identifier },
      { productId: identifier },
      ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
    ],
  };
  const before = await inventory.findOne(query);
  const result = await inventory.findOneAndUpdate(query, { $set: update }, { returnDocument: "after" });
  const updated = unwrapMongoWriteResult(result);

  if (!updated) {
    sendError(res, 404, "Không tìm thấy tồn kho.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "update", "inventory", updated._id || identifier, {
    before,
    after: updated,
  });
  sendJson(res, 200, { ok: true, data: normalizeInventory(updated) });
}

async function handleDeleteInventory({ req, res, pathParts, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const identifier = decodeURIComponent(pathParts[3] || "");
  const { inventory, auditLogs } = await getCollections(getDb);
  const query = {
    $or: [
      { key: identifier },
      { productId: identifier },
      ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
    ],
  };
  const result = await inventory.findOneAndDelete(query);
  const deleted = unwrapMongoWriteResult(result);

  if (!deleted) {
    sendError(res, 404, "Không tìm thấy tồn kho.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "delete", "inventory", deleted._id || identifier, { before: deleted });
  sendJson(res, 200, { ok: true, deleted: normalizeInventory(deleted) });
}

function normalizePayment(doc = {}) {
  return {
    id: String(doc._id || ""),
    transactionId: doc.transactionId || "",
    orderCode: doc.orderCode || "",
    amount: Number(doc.amount || 0),
    status: doc.status || "pending",
    bankReference: doc.bankReference || doc.reference || "",
    note: doc.note || "",
    raw: doc.raw || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function handleListPayments({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { payments } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 30, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const q = url.searchParams.get("q");
  const status = url.searchParams.get("status");
  const query = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [{ transactionId: regex }, { orderCode: regex }, { bankReference: regex }, { note: regex }];
  }
  if (status && status !== "all") query.status = status;

  const [total, docs] = await Promise.all([
    payments.countDocuments(query),
    payments.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: docs.map(normalizePayment),
  });
}

async function handleUpdatePayment({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const identifier = decodeURIComponent(pathParts[3] || "");
  const parsed = parseWithSchema(paymentUpdateSchema, await parseJsonBody(req));
  if (!parsed.ok) {
    sendError(res, 400, "Dữ liệu thanh toán không hợp lệ.", parsed.message);
    return;
  }

  const update = {};
  for (const key of ["status", "orderCode", "amount", "bankReference", "note"]) {
    if (parsed.data[key] !== undefined && parsed.data[key] !== "") update[key] = parsed.data[key];
  }
  update.updatedAt = new Date();

  const { payments, orders, auditLogs } = await getCollections(getDb);
  const query = {
    $or: [
      { transactionId: identifier },
      { orderCode: identifier },
      ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
    ],
  };
  const before = await payments.findOne(query);
  const result = await payments.findOneAndUpdate(query, { $set: update }, { returnDocument: "after" });
  const updated = unwrapMongoWriteResult(result);

  if (!updated) {
    sendError(res, 404, "Không tìm thấy thanh toán.");
    return;
  }

  if (updated.orderCode) {
    const orderPaymentSet = {
      "payment.status": updated.status || "pending",
      "payment.statusLabel": PAYMENT_STATUS_LABELS[updated.status] || updated.status || "pending",
      "payment.bankReference": updated.bankReference || "",
      "payment.transactionId": updated.transactionId || "",
      "payment.adminNote": updated.note || "",
      updatedAt: new Date(),
    };

    if (updated.status === "paid") {
      orderPaymentSet["payment.paidAt"] = updated.updatedAt || new Date();
    }

    await orders.updateOne(
      { orderCode: updated.orderCode },
      { $set: orderPaymentSet }
    );
  }

  await writeAdminAuditLog(auditLogs, req, "update", "payment", updated._id || identifier, { before, after: updated });
  sendJson(res, 200, { ok: true, data: normalizePayment(updated) });
}

function normalizeShipment(doc = {}) {
  return {
    id: String(doc._id || ""),
    orderCode: doc.orderCode || "",
    carrier: doc.carrier || "",
    trackingCode: doc.trackingCode || "",
    status: doc.status || "pending",
    receiverName: doc.receiverName || "",
    receiverPhone: doc.receiverPhone || "",
    shippingAddress: doc.shippingAddress || {},
    note: doc.note || "",
    estimatedDeliveryAt: doc.estimatedDeliveryAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function handleListShipments({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { shipments } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 30, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const q = url.searchParams.get("q");
  const status = url.searchParams.get("status");
  const query = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [{ orderCode: regex }, { carrier: regex }, { trackingCode: regex }, { receiverName: regex }, { receiverPhone: regex }];
  }
  if (status && status !== "all") query.status = status;

  const [total, docs] = await Promise.all([
    shipments.countDocuments(query),
    shipments.find(query).sort({ updatedAt: -1, createdAt: -1 }).skip(skip).limit(limit).toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: docs.map(normalizeShipment),
  });
}

async function syncOrderShipmentFields({ orders, shipment }) {
  if (!orders || !shipment?.orderCode) return;

  const set = {
    "shippingChoice.carrier": shipment.carrier || "",
    "shippingChoice.trackingCode": shipment.trackingCode || "",
    "shippingChoice.shipmentStatus": shipment.status || "",
    updatedAt: new Date(),
  };

  if (shipment.status === "shipping") {
    set.status = "shipping";
    set.statusLabel = ORDER_STATUS_LABELS.shipping;
  }
  if (shipment.status === "delivered") {
    set.status = "completed";
    set.statusLabel = ORDER_STATUS_LABELS.completed;
  }
  if (shipment.estimatedDeliveryAt) set["shippingChoice.estimatedDeliveryAt"] = shipment.estimatedDeliveryAt;

  await orders.updateOne({ orderCode: shipment.orderCode }, { $set: set });
}

async function handleCreateShipment({ req, res, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const parsed = parseWithSchema(shipmentSchema, await parseJsonBody(req));
  if (!parsed.ok) {
    sendError(res, 400, "Dữ liệu vận chuyển không hợp lệ.", parsed.message);
    return;
  }

  const { shipments, orders, auditLogs } = await getCollections(getDb);
  const now = new Date();
  const doc = {
    ...parsed.data,
    orderCode: cleanLimitedText(parsed.data.orderCode, 80).toUpperCase(),
    carrier: cleanLimitedText(parsed.data.carrier, 120),
    trackingCode: cleanLimitedText(parsed.data.trackingCode, 120),
    receiverName: cleanLimitedText(parsed.data.receiverName, 120),
    receiverPhone: cleanLimitedText(parsed.data.receiverPhone, 24),
    note: cleanLimitedText(parsed.data.note, 1000),
    createdAt: now,
    updatedAt: now,
  };

  const result = await shipments.insertOne(doc);
  doc._id = result.insertedId;
  await syncOrderShipmentFields({ orders, shipment: doc });
  await writeAdminAuditLog(auditLogs, req, "create", "shipment", doc._id, { after: doc });
  sendJson(res, 201, { ok: true, data: normalizeShipment(doc) });
}

async function handleUpdateShipment({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const identifier = decodeURIComponent(pathParts[3] || "");
  const parsed = parseWithSchema(shipmentUpdateSchema, await parseJsonBody(req));
  if (!parsed.ok) {
    sendError(res, 400, "Dữ liệu vận chuyển không hợp lệ.", parsed.message);
    return;
  }

  const update = {};
  for (const key of ["orderCode", "carrier", "trackingCode", "status", "receiverName", "receiverPhone", "shippingAddress", "note", "estimatedDeliveryAt"]) {
    if (parsed.data[key] !== undefined && parsed.data[key] !== "") update[key] = parsed.data[key];
  }
  if (update.orderCode) update.orderCode = cleanLimitedText(update.orderCode, 80).toUpperCase();
  update.updatedAt = new Date();

  const { shipments, orders, auditLogs } = await getCollections(getDb);
  const query = {
    $or: [
      { orderCode: identifier },
      { trackingCode: identifier },
      ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
    ],
  };
  const before = await shipments.findOne(query);
  const result = await shipments.findOneAndUpdate(query, { $set: update }, { returnDocument: "after" });
  const updated = unwrapMongoWriteResult(result);

  if (!updated) {
    sendError(res, 404, "Không tìm thấy vận đơn.");
    return;
  }

  await syncOrderShipmentFields({ orders, shipment: updated });
  await writeAdminAuditLog(auditLogs, req, "update", "shipment", updated._id || identifier, { before, after: updated });
  sendJson(res, 200, { ok: true, data: normalizeShipment(updated) });
}

async function handleDeleteShipment({ req, res, pathParts, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const identifier = decodeURIComponent(pathParts[3] || "");
  const { shipments, auditLogs } = await getCollections(getDb);
  const query = {
    $or: [
      { orderCode: identifier },
      { trackingCode: identifier },
      ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
    ],
  };
  const result = await shipments.findOneAndDelete(query);
  const deleted = unwrapMongoWriteResult(result);

  if (!deleted) {
    sendError(res, 404, "Không tìm thấy vận đơn.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "delete", "shipment", deleted._id || identifier, { before: deleted });
  sendJson(res, 200, { ok: true, deleted: normalizeShipment(deleted) });
}

function parseAdminDate(value, fallback) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

async function handleAdminRevenue({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { orders } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const now = new Date();
  const fallbackFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const from = parseAdminDate(url.searchParams.get("from"), fallbackFrom);
  const to = parseAdminDate(url.searchParams.get("to"), now);
  const match = {
    createdAt: { $gte: from, $lte: to },
    $or: [{ "payment.status": "paid" }, { status: "completed" }],
  };

  const [summaryRows, dailyRows, statusRows, paymentRows] = await Promise.all([
    orders.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$totals.total" },
          orders: { $sum: 1 },
          items: { $sum: { $size: { $ifNull: ["$items", []] } } },
        },
      },
    ]).toArray(),
    orders.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: "Asia/Ho_Chi_Minh" } },
          revenue: { $sum: "$totals.total" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).toArray(),
    orders.aggregate([{ $match: { createdAt: { $gte: from, $lte: to } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
    orders.aggregate([{ $match: { createdAt: { $gte: from, $lte: to } } }, { $group: { _id: "$payment.status", count: { $sum: 1 } } }]).toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    range: { from, to },
    summary: {
      revenue: Number(summaryRows?.[0]?.revenue || 0),
      orders: Number(summaryRows?.[0]?.orders || 0),
      items: Number(summaryRows?.[0]?.items || 0),
    },
    daily: dailyRows.map((row) => ({ date: row._id, revenue: Number(row.revenue || 0), orders: Number(row.orders || 0) })),
    statusCounts: Object.fromEntries(statusRows.map((row) => [row._id || "unknown", row.count])),
    paymentCounts: Object.fromEntries(paymentRows.map((row) => [row._id || "unknown", row.count])),
  });
}

function csvEscape(value) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function sendCsv(req, res, filename, rows, columns) {
  const header = columns.map((column) => csvEscape(column.label)).join(",");
  const body = rows
    .map((row) => columns.map((column) => csvEscape(typeof column.value === "function" ? column.value(row) : row[column.value])).join(","))
    .join("\n");
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Access-Control-Allow-Origin": getCorsOriginForRequest(req),
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  });
  res.end(`\uFEFF${header}\n${body}`);
}

async function handleAdminExport({ req, res, pathParts, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const target = String(pathParts[3] || "").replace(/\.csv$/i, "");
  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = toPositiveInt(url.searchParams.get("limit"), 1000, 5000);
  const { orders, products, users } = await getCollections(getDb);

  if (target === "orders") {
    const docs = await orders.find(buildOrderAdminQuery(url.searchParams)).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
    sendCsv(req, res, "cellphones-orders.csv", docs.map(normalizeAdminOrder), [
      { label: "orderCode", value: "orderCode" },
      { label: "status", value: "status" },
      { label: "paymentStatus", value: "paymentStatus" },
      { label: "paymentMethod", value: "paymentMethod" },
      { label: "customerName", value: (row) => row.customer?.fullName || "" },
      { label: "customerPhone", value: (row) => row.customer?.phone || "" },
      { label: "customerEmail", value: (row) => row.customer?.email || "" },
      { label: "total", value: (row) => row.totals?.total || 0 },
      { label: "createdAt", value: "createdAt" },
    ]);
    return;
  }

  if (target === "products") {
    const docs = await products.find({}).sort({ updatedAt: -1, scrapedAt: -1, _id: -1 }).limit(limit).toArray();
    sendCsv(req, res, "cellphones-products.csv", docs, [
      { label: "id", value: (row) => String(row._id || "") },
      { label: "name", value: "name" },
      { label: "slug", value: "slug" },
      { label: "sku", value: "sku" },
      { label: "brand", value: "brand" },
      { label: "category", value: "category" },
      { label: "price", value: (row) => row.currentPrice ?? row.price ?? "" },
      { label: "availability", value: (row) => row.availability?.status || row.availability || "" },
      { label: "updatedAt", value: "updatedAt" },
    ]);
    return;
  }

  if (target === "users") {
    const docs = await users.find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
    sendCsv(req, res, "cellphones-users.csv", docs, [
      { label: "id", value: (row) => String(row._id || "") },
      { label: "email", value: "email" },
      { label: "phone", value: "phone" },
      { label: "name", value: (row) => row.fullName || row.name || row.username || "" },
      { label: "role", value: "role" },
      { label: "status", value: "status" },
      { label: "createdAt", value: "createdAt" },
    ]);
    return;
  }

  sendError(res, 404, "Không hỗ trợ export này.");
}

async function handleListAuditLogs({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { auditLogs } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 50, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const [total, docs] = await Promise.all([
    auditLogs.countDocuments({}),
    auditLogs.find({}).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: docs.map((doc) => ({
      id: String(doc._id),
      actorId: doc.actorId || "",
      actorRole: doc.actorRole || "",
      actorEmail: doc.actorEmail || "",
      action: doc.action || "",
      targetType: doc.targetType || "",
      targetId: doc.targetId || "",
      before: doc.before || null,
      after: doc.after || null,
      meta: doc.meta || {},
      createdAt: doc.createdAt,
    })),
  });
}

function normalizeAdminReturn(doc = {}) {
  return {
    id: String(doc._id || ""),
    returnCode: doc.returnCode || "",
    orderCode: doc.orderCode || "",
    userId: doc.userId || "",
    productId: doc.productId || "",
    productSlug: doc.productSlug || "",
    productSku: doc.productSku || "",
    productName: doc.productName || "",
    productImage: doc.productImage || "",
    reason: doc.reason || "",
    status: doc.status || "pending",
    statusLabel: RETURN_STATUS_LABELS[doc.status] || doc.statusLabel || "Chờ tiếp nhận",
    customerPhone: doc.customerPhone || "",
    images: Array.isArray(doc.images) ? doc.images : [],
    note: doc.note || "",
    adminNote: doc.adminNote || "",
    quantity: Number(doc.quantity || 1),
    unitPrice: Number(doc.unitPrice || 0),
    refundAmount: Number(doc.refundAmount || 0),
    refundedAt: doc.refundedAt || null,
    statusHistory: Array.isArray(doc.statusHistory) ? doc.statusHistory : [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function buildReturnAdminQuery(searchParams) {
  const q = searchParams.get("q");
  const status = searchParams.get("status");
  const query = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { returnCode: regex },
      { orderCode: regex },
      { productName: regex },
      { productSlug: regex },
      { customerPhone: regex },
      { reason: regex },
      { note: regex },
      { adminNote: regex },
    ];
  }

  if (status && status !== "all") query.status = status;

  return query;
}

async function handleListReturns({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { returns } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 30, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const query = buildReturnAdminQuery(url.searchParams);
  const countQuery = { ...query };
  delete countQuery.status;

  const [total, docs, statusCounts] = await Promise.all([
    returns.countDocuments(query),
    returns.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
    returns.aggregate([
      { $match: countQuery },
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
    statusCounts: Object.fromEntries(statusCounts.map((item) => [item._id || "pending", item.count])),
    data: docs.map(normalizeAdminReturn),
  });
}

function isReturnItemMatch(item = {}, returnItem = {}) {
  const itemIds = [item.productId, item.mongoId, item.id].filter(Boolean).map(String);
  const itemSlugs = [item.slug, item.productSlug].filter(Boolean).map(String);
  const itemName = String(item.name || item.productName || '');

  if (returnItem.productId && itemIds.includes(String(returnItem.productId))) return true;
  if (returnItem.productSlug && itemSlugs.includes(String(returnItem.productSlug))) return true;
  return Boolean(returnItem.productName && itemName === String(returnItem.productName));
}

function getReturnItemPaidAmount(item = {}, returnItem = {}) {
  const quantity = Math.max(1, Number(item.quantity || returnItem.quantity || 1));
  const lineTotal = Number(item.lineTotal || item.total || item.subtotal || 0);
  const unitPrice = Number(
    item.currentPrice
    || item.price
    || item.unitPrice
    || returnItem.unitPrice
    || 0
  );
  return Math.max(0, lineTotal > 0 ? lineTotal : unitPrice * quantity);
}

async function applyCompletedReturnRefund({ orders, returnItem, session = null }) {
  if (!orders || !returnItem?.orderCode) {
    throw new Error('Yêu cầu đổi trả chưa có mã đơn hàng hợp lệ.');
  }

  const operationOptions = session ? { session } : {};
  const order = await orders.findOne({ orderCode: returnItem.orderCode }, operationOptions);
  if (!order) throw new Error(`Không tìm thấy đơn hàng #${returnItem.orderCode} để hoàn trả.`);

  const items = Array.isArray(order.items) ? order.items.map((item) => ({ ...item })) : [];
  const itemIndex = items.findIndex((item) => isReturnItemMatch(item, returnItem));
  if (itemIndex < 0) throw new Error('Không tìm thấy sản phẩm đổi trả trong đơn hàng.');

  const matchedItem = items[itemIndex];
  if (matchedItem.returnStatus === 'completed' && matchedItem.returnCode === returnItem.returnCode) {
    return {
      refundAmount: Number(matchedItem.refundAmount || returnItem.refundAmount || 0),
      refundedAt: matchedItem.returnedAt || returnItem.refundedAt || new Date(),
      netTotal: Number(order.totals?.netTotal ?? order.totals?.total ?? 0),
    };
  }

  const originalTotal = Math.max(0, Number(order.totals?.total || order.totals?.roundedTotal || 0));
  const refundedBefore = Math.max(0, Number(order.totals?.refundedAmount || order.payment?.refundedAmount || 0));
  const remainingAmount = Math.max(0, originalTotal - refundedBefore);
  const requestedAmount = getReturnItemPaidAmount(matchedItem, returnItem);
  const refundAmount = Math.min(remainingAmount, requestedAmount);

  if (refundAmount <= 0) {
    throw new Error('Đơn hàng không còn số tiền có thể hoàn cho sản phẩm này.');
  }

  const refundedAt = new Date();
  const refundedAmount = refundedBefore + refundAmount;
  const netTotal = Math.max(0, originalTotal - refundedAmount);

  items[itemIndex] = {
    ...matchedItem,
    returnStatus: 'completed',
    returnStatusLabel: RETURN_STATUS_LABELS.completed,
    returnCode: returnItem.returnCode || '',
    refundAmount,
    returnedAt: refundedAt,
  };

  const orderSet = {
    items,
    'totals.refundedAmount': refundedAmount,
    'totals.netTotal': netTotal,
    'payment.refundedAmount': refundedAmount,
    updatedAt: refundedAt,
  };

  if (netTotal === 0) {
    orderSet['payment.status'] = 'refunded';
    orderSet['payment.statusLabel'] = PAYMENT_STATUS_LABELS.refunded;
    orderSet['payment.refundedAt'] = refundedAt;
  }

  await orders.updateOne(
    { _id: order._id },
    {
      $set: orderSet,
      $push: {
        statusHistory: {
          status: 'return_completed',
          label: RETURN_STATUS_LABELS.completed,
          note: `Đã hoàn ${refundAmount.toLocaleString('vi-VN')}đ cho sản phẩm ${returnItem.productName || matchedItem.name || ''}.`,
          changedBy: 'admin',
          changedByRole: 'admin',
          changedAt: refundedAt,
        },
      },
    },
    operationOptions
  );

  return { refundAmount, refundedAt, netTotal };
}

function sanitizeReturnUpdate(input = {}) {
  const update = {};
  const status = cleanLimitedText(input.status, 40);

  if (RETURN_STATUS_LABELS[status]) {
    update.status = status;
    update.statusLabel = RETURN_STATUS_LABELS[status];
  }

  if (Object.prototype.hasOwnProperty.call(input, "adminNote")) {
    update.adminNote = cleanLimitedText(input.adminNote, 1000);
  }

  if (Object.prototype.hasOwnProperty.call(input, "note")) {
    update.note = cleanLimitedText(input.note, 1000);
  }

  update.updatedAt = new Date();
  return update;
}

async function handleUpdateReturn({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const returnId = decodeURIComponent(pathParts[3] || "");
  if (!returnId) {
    sendError(res, 400, "Return id không hợp lệ.");
    return;
  }

  const { client, returns, orders, auditLogs, notifications } = await getCollections(getDb);
  const body = await parseJsonBody(req);
  const update = sanitizeReturnUpdate(body);

  if (update.status === "rejected" && !String(update.adminNote || "").trim()) {
    sendError(res, 400, "Vui lòng nhập lý do từ chối yêu cầu đổi trả.");
    return;
  }

  const query = {
    $or: [
      { returnCode: returnId },
      ...(ObjectId.isValid(returnId) ? [{ _id: new ObjectId(returnId) }] : []),
    ],
  };

  const before = await returns.findOne(query);
  if (!before) {
    sendError(res, 404, "Không tìm thấy yêu cầu đổi trả.");
    return;
  }

  const shouldApplyRefund = update.status === "completed" && before.status !== "completed";
  const actor = getAdminPayload(req);

  const executeUpdate = async (session = null) => {
    const operationOptions = {
      returnDocument: "after",
      ...(session ? { session } : {}),
    };

    if (shouldApplyRefund) {
      const refund = await applyCompletedReturnRefund({
        orders,
        returnItem: before,
        session,
      });
      update.refundAmount = refund.refundAmount;
      update.refundedAt = refund.refundedAt;
      update.refundAppliedAt = refund.refundedAt;
      update.netOrderTotal = refund.netTotal;
    }

    const mongoUpdate = { $set: update };
    if (update.status && update.status !== before.status) {
      mongoUpdate.$push = {
        statusHistory: {
          status: update.status,
          label: update.statusLabel || RETURN_STATUS_LABELS[update.status] || update.status,
          note: shouldApplyRefund
            ? `Đã hoàn ${Number(update.refundAmount || 0).toLocaleString("vi-VN")}đ cho khách hàng.`
            : update.adminNote || "Quản trị viên đã cập nhật yêu cầu đổi trả.",
          changedBy: actor?.sub || "admin",
          changedByRole: actor?.role || "admin",
          changedAt: update.updatedAt || new Date(),
        },
      };
    }

    const result = await returns.findOneAndUpdate(query, mongoUpdate, operationOptions);
    const updatedReturn = unwrapMongoWriteResult(result);
    if (!updatedReturn) throw new Error("Không tìm thấy yêu cầu đổi trả.");
    return updatedReturn;
  };

  let updated;
  if (shouldApplyRefund && client?.withSession) {
    updated = await client.withSession((session) => session.withTransaction(
      () => executeUpdate(session),
      {
        readPreference: "primary",
        readConcern: { level: "local" },
        writeConcern: { w: "majority" },
      }
    ));
  } else {
    updated = await executeUpdate();
  }

  await writeAdminAuditLog(auditLogs, req, "update", "return", updated._id || returnId, {
    before,
    after: updated,
  });

  if (before?.status !== updated.status && updated.userId && notifications) {
    await notifications.insertOne({
      userId: String(updated.userId),
      type: "return_status_changed",
      title: `Yêu cầu đổi trả ${updated.statusLabel || RETURN_STATUS_LABELS[updated.status] || updated.status}`,
      message: updated.adminNote
        ? `Yêu cầu ${updated.returnCode}: ${updated.adminNote}`
        : `Yêu cầu ${updated.returnCode} đã chuyển sang trạng thái ${updated.statusLabel || updated.status}.`,
      orderCode: updated.orderCode || "",
      productId: updated.productId || "",
      metadata: {
        returnCode: updated.returnCode || "",
        returnStatus: updated.status || "",
      },
      readAt: null,
      createdAt: new Date(),
    });
  }

  sendJson(res, 200, {
    ok: true,
    data: normalizeAdminReturn(updated),
  });
}

async function handleDeleteReturn({ req, res, pathParts, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const returnId = decodeURIComponent(pathParts[3] || "");
  const { returns, auditLogs } = await getCollections(getDb);

  const query = {
    $or: [
      { returnCode: returnId },
      ...(ObjectId.isValid(returnId) ? [{ _id: new ObjectId(returnId) }] : []),
    ],
  };

  const result = await returns.findOneAndDelete(query);
  const deleted = unwrapMongoWriteResult(result);

  if (!deleted) {
    sendError(res, 404, "Không tìm thấy yêu cầu đổi trả.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "delete", "return", deleted._id || returnId, {
    before: deleted,
  });

  sendJson(res, 200, {
    ok: true,
    deleted: normalizeAdminReturn(deleted),
  });
}

function normalizeAdminSupportRequest(doc = {}) {
  const status = doc.status || "new";

  return {
    id: String(doc._id || ""),
    requestCode: doc.requestCode || "",
    issueType: doc.issueType || "",
    fullName: doc.fullName || "",
    phone: doc.phone || "",
    email: doc.email || "",
    orderCode: doc.orderCode || "",
    content: doc.content || "",
    attachment: doc.attachment || null,
    status,
    statusLabel: doc.statusLabel || SUPPORT_STATUS_LABELS[status] || status,
    adminNote: doc.adminNote || "",
    response: doc.response || "",
    userId: doc.userId || "",
    userRole: doc.userRole || "guest",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function buildSupportAdminQuery(searchParams) {
  const q = searchParams.get("q");
  const status = searchParams.get("status");
  const query = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { requestCode: regex },
      { issueType: regex },
      { fullName: regex },
      { phone: regex },
      { email: regex },
      { orderCode: regex },
      { content: regex },
      { adminNote: regex },
      { response: regex },
    ];
  }

  if (status && status !== "all") query.status = status;
  return query;
}

async function handleListSupportRequests({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { supportRequests } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 30, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const query = buildSupportAdminQuery(url.searchParams);

  const [total, docs, statusCounts] = await Promise.all([
    supportRequests.countDocuments(query),
    supportRequests
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    supportRequests.aggregate([
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
    statusOptions: Object.entries(SUPPORT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
    statusCounts: Object.fromEntries(statusCounts.map((item) => [item._id || "new", item.count])),
    data: docs.map(normalizeAdminSupportRequest),
  });
}

function sanitizeSupportUpdate(input = {}) {
  const update = {};
  const status = cleanLimitedText(input.status, 40);

  if (SUPPORT_STATUS_LABELS[status]) {
    update.status = status;
    update.statusLabel = SUPPORT_STATUS_LABELS[status];
  }

  if (Object.prototype.hasOwnProperty.call(input, "adminNote")) {
    update.adminNote = cleanLimitedText(input.adminNote, 2000);
  }

  if (Object.prototype.hasOwnProperty.call(input, "response")) {
    update.response = cleanLimitedText(input.response, 4000);
  }

  update.updatedAt = new Date();
  return update;
}

async function handleUpdateSupportRequest({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const identifier = decodeURIComponent(pathParts[3] || "");
  if (!identifier) {
    sendError(res, 400, "Mã yêu cầu hỗ trợ không hợp lệ.");
    return;
  }

  const body = await parseJsonBody(req);
  const update = sanitizeSupportUpdate(body);
  const query = {
    $or: [
      { requestCode: identifier },
      ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
    ],
  };

  const { supportRequests, auditLogs } = await getCollections(getDb);
  const before = await supportRequests.findOne(query);
  const result = await supportRequests.findOneAndUpdate(
    query,
    { $set: update },
    { returnDocument: "after" }
  );
  const updated = unwrapMongoWriteResult(result);

  if (!updated) {
    sendError(res, 404, "Không tìm thấy yêu cầu hỗ trợ.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "update", "support_request", updated._id || identifier, {
    before,
    after: updated,
  });

  sendJson(res, 200, {
    ok: true,
    message: "Đã cập nhật yêu cầu hỗ trợ.",
    data: normalizeAdminSupportRequest(updated),
  });
}

async function handleDeleteSupportRequest({ req, res, pathParts, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const identifier = decodeURIComponent(pathParts[3] || "");
  const query = {
    $or: [
      { requestCode: identifier },
      ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
    ],
  };

  const { supportRequests, auditLogs } = await getCollections(getDb);
  const result = await supportRequests.findOneAndDelete(query);
  const deleted = unwrapMongoWriteResult(result);

  if (!deleted) {
    sendError(res, 404, "Không tìm thấy yêu cầu hỗ trợ.");
    return;
  }

  await writeAdminAuditLog(auditLogs, req, "delete", "support_request", deleted._id || identifier, {
    before: deleted,
  });

  sendJson(res, 200, {
    ok: true,
    deleted: normalizeAdminSupportRequest(deleted),
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

  if (resource === "business-verifications" && !identifier && req.method === "GET") {
    await handleListBusinessVerifications(context);
    return;
  }

  if (resource === "business-verifications" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateBusinessVerification(context);
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

  if (resource === "orders" && identifier && pathParts[4] === "invoice" && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateOrderInvoice(context);
    return;
  }

  if (resource === "orders" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateOrder(context);
    return;
  }

  if (resource === "inventory" && !identifier && req.method === "GET") {
    await handleListInventory(context);
    return;
  }

  if (resource === "inventory" && !identifier && req.method === "POST") {
    await handleCreateInventory(context);
    return;
  }

  if (resource === "inventory" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateInventory(context);
    return;
  }

  if (resource === "inventory" && identifier && req.method === "DELETE") {
    await handleDeleteInventory(context);
    return;
  }

  if (resource === "payments" && !identifier && req.method === "GET") {
    await handleListPayments(context);
    return;
  }

  if (resource === "payments" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdatePayment(context);
    return;
  }

  if (resource === "shipments" && !identifier && req.method === "GET") {
    await handleListShipments(context);
    return;
  }

  if (resource === "shipments" && !identifier && req.method === "POST") {
    await handleCreateShipment(context);
    return;
  }

  if (resource === "shipments" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateShipment(context);
    return;
  }

  if (resource === "shipments" && identifier && req.method === "DELETE") {
    await handleDeleteShipment(context);
    return;
  }

  if (resource === "revenue" && req.method === "GET") {
    await handleAdminRevenue(context);
    return;
  }

  if (resource === "export" && req.method === "GET") {
    await handleAdminExport(context);
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

  if (resource === "returns" && !identifier && req.method === "GET") {
    await handleListReturns(context);
    return;
  }

  if (resource === "returns" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateReturn(context);
    return;
  }

  if (resource === "returns" && identifier && req.method === "DELETE") {
    await handleDeleteReturn(context);
    return;
  }

  if (resource === "coupons" && !identifier && req.method === "GET") {
    await handleListCoupons(context);
    return;
  }

  if (resource === "coupons" && !identifier && req.method === "POST") {
    await handleCreateCoupon(context);
    return;
  }

  if (resource === "coupons" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateCoupon(context);
    return;
  }

  if (resource === "coupons" && identifier && req.method === "DELETE") {
    await handleDeleteCoupon(context);
    return;
  }

  if (resource === "support-requests" && !identifier && req.method === "GET") {
    await handleListSupportRequests(context);
    return;
  }

  if (resource === "support-requests" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateSupportRequest(context);
    return;
  }

  if (resource === "support-requests" && identifier && req.method === "DELETE") {
    await handleDeleteSupportRequest(context);
    return;
  }

  if (resource === "audit-logs" && req.method === "GET") {
    await handleListAuditLogs(context);
    return;
  }

  sendError(res, 404, "Admin route not found.");
}

module.exports = {
  handleAdminRequest,
  isAdminAuthorized,
};
