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
const ORDER_STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["packing", "ready_for_pickup", "cancelled"],
  packing: ["shipping", "ready_for_pickup", "cancelled"],
  ready_for_pickup: ["completed", "cancelled"],
  shipping: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  refunded: [],
};
const PAYMENT_STATUS_LABELS = {
  unpaid: "Chưa thanh toán",
  pending: "Chờ chuyển khoản",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
  failed: "Thanh toán lỗi",
};

const SHIPMENT_STATUS_LABELS = {
  pending: "Chờ tạo vận đơn",
  ready: "Sẵn sàng giao",
  shipping: "Đang giao",
  delivered: "Đã giao",
  failed: "Giao thất bại",
  cancelled: "Đã hủy",
  returned: "Hoàn về",
};
const SHIPMENT_STATUS_TRANSITIONS = {
  pending: ["ready", "shipping", "cancelled"],
  ready: ["shipping", "delivered", "cancelled"],
  shipping: ["delivered", "failed", "cancelled", "returned"],
  failed: ["ready", "shipping", "cancelled", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
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
const RETURN_STATUS_TRANSITIONS = {
  pending: ["received", "approved", "rejected", "cancelled"],
  received: ["approved", "rejected", "cancelled"],
  approved: ["completed", "cancelled"],
  rejected: [],
  completed: [],
  cancelled: [],
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
    userVouchers: db.collection(process.env.USER_VOUCHERS_COLLECTION || "user_vouchers"),
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

function getNextOrderStatuses(order = {}) {
  const currentStatus = order.status || "pending";
  const candidates = ORDER_STATUS_TRANSITIONS[currentStatus] || [];
  const pickup = isPickupOrder(order);

  return candidates.filter((status) => {
    if (status === "ready_for_pickup") return pickup;
    if (status === "shipping") return !pickup;
    return true;
  });
}

function getOrderAttentionFlags(order = {}) {
  const flags = [];
  const status = order.status || "pending";
  const paymentStatus = order.payment?.status || "unpaid";
  const shipmentStatus = order.shippingChoice?.shipmentStatus || "pending";
  const pickup = isPickupOrder(order);
  const createdAt = new Date(order.createdAt || 0).getTime();

  if (status === "completed" && paymentStatus !== "paid") {
    flags.push({ code: "completed_unpaid", severity: "critical", label: "Hoàn tất nhưng chưa thu tiền" });
  }
  if (status === "completed" && !pickup && shipmentStatus !== "delivered") {
    flags.push({ code: "completed_not_delivered", severity: "critical", label: "Hoàn tất nhưng chưa xác nhận giao" });
  }
  if (status === "shipping" && (!order.shippingChoice?.carrier || !order.shippingChoice?.trackingCode)) {
    flags.push({ code: "shipping_without_tracking", severity: "critical", label: "Đang giao nhưng thiếu vận đơn" });
  }
  if (status === "pending" && Number.isFinite(createdAt) && Date.now() - createdAt > 24 * 60 * 60 * 1000) {
    flags.push({ code: "pending_sla", severity: "warning", label: "Chờ xác nhận quá 24 giờ" });
  }
  if (!order.inventoryState && !["cancelled", "refunded"].includes(status)) {
    flags.push({ code: "inventory_unknown", severity: "warning", label: "Chưa đồng bộ trạng thái tồn kho" });
  }

  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const hasTerminalRegression = history.some((entry, index) => {
    if (index === 0) return false;
    const previous = history[index - 1]?.status;
    return ["completed", "cancelled", "refunded"].includes(previous) && entry?.status !== previous;
  });
  if (hasTerminalRegression) {
    flags.push({ code: "invalid_history", severity: "critical", label: "Lịch sử có bước quay ngược" });
  }

  return flags;
}

function normalizeAdminOrder(doc = {}) {
  const status = doc.status || "pending";
  const paymentStatus = doc.payment?.status || "unpaid";
  const attentionFlags = getOrderAttentionFlags(doc);

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
    inventoryReservations: Array.isArray(doc.inventoryReservations) ? doc.inventoryReservations : [],
    inventoryState: doc.inventoryState || "",
    gifts: Array.isArray(doc.gifts) ? doc.gifts : [],
    totals: doc.totals || {},
    payment: {
      ...(doc.payment || {}),
      status: paymentStatus,
      statusLabel: PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus,
    },
    paymentStatus,
    paymentMethod: doc.payment?.method || "cod",
    nextStatuses: getNextOrderStatuses(doc),
    attentionFlags,
    attentionCount: attentionFlags.length,
    marketingOptIn: Boolean(doc.marketingOptIn),
    educationOffer: Boolean(doc.educationOffer),
    companyInvoice: doc.companyInvoice || {},
    note: doc.note || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function buildOrderAdminQuery(searchParams, options = {}) {
  const q = searchParams.get("q");
  const status = searchParams.get("status");
  const paymentStatus = searchParams.get("paymentStatus");
  const shipmentStatus = searchParams.get("shipmentStatus");
  const attention = searchParams.get("attention");
  const conditions = [];

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    conditions.push({ $or: [
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
    ] });
  }

  if (!options.ignoreStatus && status && status !== "all") conditions.push({ status });
  if (paymentStatus && paymentStatus !== "all") conditions.push({ "payment.status": paymentStatus });
  if (shipmentStatus && shipmentStatus !== "all") {
    conditions.push({ "shippingChoice.shipmentStatus": shipmentStatus });
  }
  if (attention === "true" || attention === "1") {
    const stalePendingAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    conditions.push({ $or: [
      { status: "completed", "payment.status": { $ne: "paid" } },
      {
        status: "completed",
        "shippingChoice.shipmentStatus": { $ne: "delivered" },
        $nor: [
          { "shippingChoice.type": /store|pickup/i },
          { "shippingChoice.method": /store|pickup|nhận tại cửa hàng/i },
          { "shippingChoice.label": /store|pickup|nhận tại cửa hàng/i },
        ],
      },
      {
        status: "shipping",
        $or: [
          { "shippingChoice.carrier": { $in: [null, ""] } },
          { "shippingChoice.trackingCode": { $in: [null, ""] } },
        ],
      },
      { status: "pending", createdAt: { $lt: stalePendingAt } },
      { inventoryState: { $in: [null, ""] }, status: { $nin: ["cancelled", "refunded"] } },
    ] });
  }

  if (!conditions.length) return {};
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}

function sanitizeOrderUpdate(input = {}, req) {
  const update = {};
  const set = {};
  const push = {};
  const requestedStatus = cleanLimitedText(input.status, 40);
  const requestedShipmentStatus = cleanLimitedText(
    input.shipmentStatus || input.shippingChoice?.shipmentStatus,
    40
  );
  const paymentStatus = cleanLimitedText(input.paymentStatus || input.payment?.status, 40);
  const now = new Date();
  let effectiveStatus = ORDER_STATUS_FLOW.includes(requestedStatus) ? requestedStatus : "";
  let effectiveShipmentStatus = requestedShipmentStatus;

  if (!effectiveStatus && requestedShipmentStatus === "shipping") effectiveStatus = "shipping";
  if (!effectiveStatus && requestedShipmentStatus === "delivered") effectiveStatus = "completed";
  if (!effectiveShipmentStatus && ["pending", "confirmed", "packing"].includes(effectiveStatus)) {
    effectiveShipmentStatus = "pending";
  }
  if (!effectiveShipmentStatus && effectiveStatus === "shipping") effectiveShipmentStatus = "shipping";
  if (!effectiveShipmentStatus && effectiveStatus === "completed") effectiveShipmentStatus = "delivered";
  if (!effectiveShipmentStatus && effectiveStatus === "cancelled") effectiveShipmentStatus = "cancelled";
  if (!effectiveShipmentStatus && effectiveStatus === "ready_for_pickup") effectiveShipmentStatus = "ready";

  if (effectiveStatus) {
    const label = ORDER_STATUS_LABELS[effectiveStatus];
    set.status = effectiveStatus;
    set.statusLabel = label;
    push.statusHistory = {
      status: effectiveStatus,
      label,
      note: cleanLimitedText(
        input.statusNote || input.shippingNote || input.note || input.adminNote,
        400
      ),
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

  if (Object.prototype.hasOwnProperty.call(input, "bankReference")) {
    set["payment.bankReference"] = cleanLimitedText(input.bankReference, 180);
  }

  if (Object.prototype.hasOwnProperty.call(input, "paymentNote")) {
    set["payment.adminNote"] = cleanLimitedText(input.paymentNote, 1000);
  }

  if (Object.prototype.hasOwnProperty.call(input, "adminNote")) {
    set.adminNote = cleanLimitedText(input.adminNote, 1000);
  }

  if (Object.prototype.hasOwnProperty.call(input, "carrier")) {
    set["shippingChoice.carrier"] = cleanLimitedText(input.carrier, 120);
  }

  if (Object.prototype.hasOwnProperty.call(input, "trackingCode")) {
    set["shippingChoice.trackingCode"] = cleanLimitedText(input.trackingCode, 120);
  }

  if (effectiveShipmentStatus && SHIPMENT_STATUS_LABELS[effectiveShipmentStatus]) {
    set["shippingChoice.shipmentStatus"] = effectiveShipmentStatus;
    set["shippingChoice.shipmentStatusLabel"] = SHIPMENT_STATUS_LABELS[effectiveShipmentStatus];
  }

  if (Object.prototype.hasOwnProperty.call(input, "shippingNote")) {
    set["shippingChoice.adminNote"] = cleanLimitedText(input.shippingNote, 1000);
  }

  if (input.etaText !== undefined) {
    set["shippingChoice.etaText"] = cleanLimitedText(input.etaText, 180);
  }

  set.updatedAt = now;
  update.$set = set;
  if (Object.keys(push).length) update.$push = push;

  return update;
}

function isPickupOrder(order = {}) {
  const shippingText = [
    order.shippingChoice?.label,
    order.shippingChoice?.method,
    order.shippingChoice?.type,
  ].filter(Boolean).join(" ");
  return /nhận tại cửa hàng|pickup|store/i.test(shippingText);
}

function getShipmentStatusFromOrder(order = {}) {
  if (order.status === "completed") return "delivered";
  if (order.status === "cancelled") return "cancelled";
  const explicitStatus = order.shippingChoice?.shipmentStatus;
  if (explicitStatus && SHIPMENT_STATUS_LABELS[explicitStatus]) return explicitStatus;
  if (order.status === "shipping") return "shipping";
  if (["packing", "ready_for_pickup"].includes(order.status)) return "ready";
  return "pending";
}

async function syncPaymentRecordFromOrder(payments, order = {}) {
  if (!payments || !order.orderCode) return;

  const now = new Date();
  const paymentStatus = order.payment?.status || "unpaid";
  const transactionId = cleanLimitedText(
    order.payment?.transactionId || `ORDER-${order.orderCode}`,
    180
  );

  await payments.updateOne(
    { orderCode: order.orderCode },
    {
      $set: {
        orderCode: order.orderCode,
        amount: Number(order.totals?.total || order.totals?.roundedTotal || 0),
        method: order.payment?.method || "cod",
        methodLabel: order.payment?.methodLabel || "Thanh toán khi nhận hàng",
        status: ["unpaid", "pending", "paid", "unmatched", "failed", "refunded"].includes(paymentStatus)
          ? paymentStatus
          : "unpaid",
        bankReference: order.payment?.bankReference || "",
        note: order.payment?.adminNote || "",
        customer: order.customer || {},
        updatedAt: now,
      },
      $setOnInsert: {
        transactionId,
        source: "order-admin",
        createdAt: order.createdAt || now,
      },
    },
    { upsert: true }
  );
}

async function syncShipmentRecordFromOrder(shipments, order = {}) {
  if (!shipments || !order.orderCode || isPickupOrder(order)) return;

  const now = new Date();
  await shipments.updateOne(
    { orderCode: order.orderCode },
    {
      $set: {
        orderCode: order.orderCode,
        carrier: order.shippingChoice?.carrier || "",
        trackingCode: order.shippingChoice?.trackingCode || "",
        status: getShipmentStatusFromOrder(order),
        receiverName: order.receiver?.fullName || order.customer?.fullName || "",
        receiverPhone: order.receiver?.phone || order.customer?.phone || "",
        shippingAddress: order.shippingAddress || {},
        note: order.shippingChoice?.adminNote || "",
        updatedAt: now,
      },
      $setOnInsert: {
        source: "order-admin",
        createdAt: order.createdAt || now,
      },
    },
    { upsert: true }
  );
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
    item.selectedOptions?.variantId || item.selectedOptions?.variantName || "default",
    item.selectedOptions?.colorId || item.selectedOptions?.colorName || "default",
  ].map(slugifyAuditKey).filter(Boolean).join("::");
}

function getInventoryStatus({ stock = 0, reservedStock = 0, currentStatus = "" } = {}) {
  if (currentStatus === "inactive") return "inactive";
  const available = Math.max(0, Number(stock || 0) - Number(reservedStock || 0));
  if (available <= 0) return "out_of_stock";
  if (available <= 5) return "low_stock";
  return "in_stock";
}

async function settleInventoryForOrder(inventory, order = {}, mode = "release") {
  if (!inventory || !Array.isArray(order.items)) return;

  const savedReservations = Array.isArray(order.inventoryReservations)
    ? order.inventoryReservations
    : [];
  const updates = order.items
    .map((item) => {
      const itemAliases = [item.id, item.productId, item.mongoId, item.slug, item.sku]
        .filter(Boolean)
        .map(String);
      const reservation = savedReservations.find((entry) => [
        entry.itemId,
        entry.productId,
        entry.productSlug,
        entry.productSku,
      ].filter(Boolean).map(String).some((value) => itemAliases.includes(value)));
      if (!reservation && (item.manageInventory === false || item.productSnapshot?.manageInventory === false)) {
        return null;
      }
      return {
        key: reservation?.key || buildInventoryKeyFromOrderItem(item),
        inventoryId: reservation?.inventoryId || "",
        quantity: Math.max(1, Math.round(Number(reservation?.quantity || item.quantity || 1))),
      };
    })
    .filter((item) => item?.key);

  for (const item of updates) {
    const existing = item.inventoryId && ObjectId.isValid(item.inventoryId)
      ? await inventory.findOne({ _id: new ObjectId(item.inventoryId) })
      : await inventory.findOne({ key: item.key });
    if (!existing) continue;

    const stock = Number(existing.stock || 0);
    const reservedStock = Number(existing.reservedStock || 0);
    const soldCount = Number(existing.soldCount || 0);
    const releasedQuantity = Math.min(reservedStock, item.quantity);
    let nextStock = stock;
    let nextReserved = Math.max(0, reservedStock - releasedQuantity);
    let nextSold = soldCount;

    if (mode === "complete") {
      nextStock = Math.max(0, stock - item.quantity);
      nextSold = soldCount + item.quantity;
    } else if (mode === "restock") {
      nextStock = stock + item.quantity;
      nextSold = Math.max(0, soldCount - item.quantity);
      nextReserved = reservedStock;
    }

    await inventory.updateOne(
      { _id: existing._id },
      {
        $set: {
          stock: nextStock,
          reservedStock: nextReserved,
          soldCount: nextSold,
          status: getInventoryStatus({
            stock: nextStock,
            reservedStock: nextReserved,
            currentStatus: existing.status,
          }),
          updatedAt: new Date(),
        },
      }
    );
  }
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
  const statusCountQuery = buildOrderAdminQuery(url.searchParams, { ignoreStatus: true });
  const attentionParams = new URLSearchParams(url.searchParams);
  attentionParams.set("attention", "true");
  const attentionQuery = buildOrderAdminQuery(attentionParams, { ignoreStatus: true });

  const [total, docs, statusCounts, attentionCount] = await Promise.all([
    orders.countDocuments(query),
    orders
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    orders.aggregate([
      { $match: statusCountQuery },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).toArray(),
    orders.countDocuments(attentionQuery),
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
    attentionCount,
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
  const query = {
    $or: [
      { orderCode: orderId },
      ...(ObjectId.isValid(orderId) ? [{ _id: new ObjectId(orderId) }] : []),
    ],
  };

  const {
    orders,
    payments,
    shipments,
    inventory,
    coupons,
    userVouchers,
    auditLogs,
  } = await getCollections(getDb);
  const before = await orders.findOne(query);

  if (!before) {
    sendError(res, 404, "Không tìm thấy đơn hàng.");
    return;
  }

  const expectedUpdatedAt = body.expectedUpdatedAt ? new Date(body.expectedUpdatedAt) : null;
  if (body.expectedUpdatedAt && !Number.isFinite(expectedUpdatedAt.getTime())) {
    sendError(res, 400, "Mốc đồng bộ đơn hàng không hợp lệ. Vui lòng tải lại dữ liệu.");
    return;
  }
  if (
    expectedUpdatedAt
    && Number.isFinite(expectedUpdatedAt.getTime())
    && new Date(before.updatedAt || 0).getTime() !== expectedUpdatedAt.getTime()
  ) {
    sendError(res, 409, "Đơn hàng vừa được người khác cập nhật. Vui lòng tải lại dữ liệu trước khi lưu.");
    return;
  }

  const requestedStatus = cleanLimitedText(body.status, 40);
  if (requestedStatus === before.status) delete body.status;
  if (requestedStatus && requestedStatus !== before.status) {
    const allowedStatuses = getNextOrderStatuses(before);
    if (!allowedStatuses.includes(requestedStatus)) {
      sendError(
        res,
        409,
        `Không thể chuyển đơn từ "${ORDER_STATUS_LABELS[before.status] || before.status}" sang "${ORDER_STATUS_LABELS[requestedStatus] || requestedStatus}".`
      );
      return;
    }
  }

  const requestedShipmentStatus = cleanLimitedText(
    body.shipmentStatus || body.shippingChoice?.shipmentStatus,
    40
  );
  const impliedOrderStatus = requestedShipmentStatus === "shipping"
    ? "shipping"
    : requestedShipmentStatus === "delivered"
      ? "completed"
      : "";
  if (impliedOrderStatus && impliedOrderStatus !== before.status) {
    const allowedStatuses = getNextOrderStatuses(before);
    if (!allowedStatuses.includes(impliedOrderStatus)) {
      sendError(
        res,
        409,
        `Không thể cập nhật giao nhận khi đơn đang ở bước "${ORDER_STATUS_LABELS[before.status] || before.status}".`
      );
      return;
    }
  }
  const currentShipmentStatus = before.shippingChoice?.shipmentStatus || "pending";
  if (requestedShipmentStatus && requestedShipmentStatus !== currentShipmentStatus) {
    const allowedShipmentStatuses = SHIPMENT_STATUS_TRANSITIONS[currentShipmentStatus] || [];
    if (!allowedShipmentStatuses.includes(requestedShipmentStatus)) {
      sendError(res, 409, "Bước giao nhận không hợp lệ. Vui lòng tải lại trạng thái mới nhất.");
      return;
    }
  }

  if (requestedStatus === "ready_for_pickup" && !isPickupOrder(before)) {
    sendError(res, 409, "Chỉ đơn nhận tại cửa hàng mới được chuyển sang sẵn sàng nhận.");
    return;
  }
  if (requestedStatus === "shipping" && isPickupOrder(before)) {
    sendError(res, 409, "Đơn nhận tại cửa hàng không thể chuyển sang đang giao hàng.");
    return;
  }

  const willComplete = body.status === "completed" || requestedShipmentStatus === "delivered";
  if (willComplete && before.payment?.method === "cod") {
    body.paymentStatus = "paid";
  }
  if (willComplete && before.payment?.method !== "cod") {
    const nextPaymentStatus = body.paymentStatus || before.payment?.status || "unpaid";
    if (nextPaymentStatus !== "paid") {
      sendError(res, 409, "Cần xác nhận thanh toán trước khi hoàn tất đơn hàng.");
      return;
    }
  }

  const willShip = ["shipping", "delivered"].includes(requestedShipmentStatus)
    || ["shipping", "completed"].includes(body.status);
  if (willShip && !isPickupOrder(before)) {
    const carrier = cleanLimitedText(body.carrier ?? before.shippingChoice?.carrier, 120);
    const trackingCode = cleanLimitedText(body.trackingCode ?? before.shippingChoice?.trackingCode, 120);
    if (!carrier || !trackingCode) {
      sendError(res, 409, "Vui lòng nhập đơn vị vận chuyển và mã vận đơn trước khi giao hàng.");
      return;
    }
  }

  if (body.paymentStatus === "refunded" && !cleanLimitedText(body.paymentNote || body.adminNote, 1000)) {
    sendError(res, 409, "Cần nhập ghi chú hoặc lý do trước khi xác nhận hoàn tiền.");
    return;
  }

  const update = sanitizeOrderUpdate(body, req);
  const updateQuery = { _id: before._id };
  if (expectedUpdatedAt && Number.isFinite(expectedUpdatedAt.getTime())) {
    updateQuery.updatedAt = expectedUpdatedAt;
  }
  const result = await orders.findOneAndUpdate(
    updateQuery,
    update,
    { returnDocument: "after" }
  );
  let updatedOrder = unwrapMongoWriteResult(result);

  if (!updatedOrder) {
    sendError(
      res,
      expectedUpdatedAt ? 409 : 404,
      expectedUpdatedAt
        ? "Đơn hàng đã thay đổi trong lúc bạn chỉnh sửa. Vui lòng tải lại."
        : "Không tìm thấy đơn hàng."
    );
    return;
  }

  if (
    updatedOrder.status === "completed"
    && updatedOrder.payment?.method === "cod"
    && updatedOrder.payment?.status !== "paid"
  ) {
    const paidAt = new Date();
    await orders.updateOne(
      { _id: updatedOrder._id },
      {
        $set: {
          "payment.status": "paid",
          "payment.statusLabel": PAYMENT_STATUS_LABELS.paid,
          "payment.paidAt": paidAt,
          updatedAt: paidAt,
        },
      }
    );
    updatedOrder = {
      ...updatedOrder,
      payment: {
        ...(updatedOrder.payment || {}),
        status: "paid",
        statusLabel: PAYMENT_STATUS_LABELS.paid,
        paidAt,
      },
      updatedAt: paidAt,
    };
  }

  const inventoryState = before.inventoryState
    || (!["completed", "cancelled", "refunded"].includes(before.status) ? "reserved" : "unknown");
  let nextInventoryState = inventoryState;

  if (updatedOrder.status === "completed" && inventoryState === "reserved") {
    await settleInventoryForOrder(inventory, updatedOrder, "complete");
    nextInventoryState = "fulfilled";
  } else if (updatedOrder.status === "cancelled" && inventoryState === "reserved") {
    await settleInventoryForOrder(inventory, updatedOrder, "release");
    nextInventoryState = "released";
  } else if (updatedOrder.status === "cancelled" && inventoryState === "fulfilled") {
    await settleInventoryForOrder(inventory, updatedOrder, "restock");
    nextInventoryState = "restocked";
  }

  if (nextInventoryState !== inventoryState) {
    const inventoryUpdatedAt = new Date();
    await orders.updateOne(
      { _id: updatedOrder._id },
      { $set: { inventoryState: nextInventoryState, inventoryUpdatedAt } }
    );
    updatedOrder.inventoryState = nextInventoryState;
    updatedOrder.inventoryUpdatedAt = inventoryUpdatedAt;
  }

  if (
    before.status !== "cancelled"
    && updatedOrder.status === "cancelled"
    && before.coupon?.walletId
    && ObjectId.isValid(before.coupon.walletId)
  ) {
    const restoredWallet = unwrapMongoWriteResult(await userVouchers.findOneAndUpdate(
      {
        _id: new ObjectId(before.coupon.walletId),
        orderCode: before.orderCode,
        status: "used",
      },
      {
        $set: { status: "available", updatedAt: new Date() },
        $inc: { usedCount: -1 },
        $unset: { orderId: "", orderCode: "", usedAt: "" },
      },
      { returnDocument: "after" }
    ));

    if (restoredWallet && before.coupon.couponId && ObjectId.isValid(before.coupon.couponId)) {
      await coupons.updateOne(
        { _id: new ObjectId(before.coupon.couponId), usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 }, $set: { updatedAt: new Date() } }
      );
    }
  }

  await Promise.all([
    syncPaymentRecordFromOrder(payments, updatedOrder),
    syncShipmentRecordFromOrder(shipments, updatedOrder),
  ]);

  await writeAdminAuditLog(auditLogs, req, "update", "order", updatedOrder._id || orderId, {
    before,
    after: updatedOrder,
    meta: {
      paymentSynced: true,
      shipmentSynced: !isPickupOrder(updatedOrder),
    },
  });

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
  if (Object.keys(update).length) update.updatedAt = new Date();
  return update;
}

async function wouldRemoveLastActiveAdmin(users, user, update = null) {
  const removesAdminAccess = user?.role === "admin"
    && user?.status !== "blocked"
    && (!update || update.role === "customer" || update.status === "blocked");

  if (!removesAdminAccess) return false;

  const remainingAdmins = await users.countDocuments({
    _id: { $ne: user._id },
    role: "admin",
    status: { $ne: "blocked" },
  });
  return remainingAdmins === 0;
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

  if (!Object.keys(update).length) {
    sendError(res, 400, "Không có trường người dùng hợp lệ để cập nhật.");
    return;
  }

  const { users, auditLogs } = await getCollections(getDb);
  const before = await users.findOne({ _id: new ObjectId(userId) }, { projection: { passwordHash: 0 } });

  if (!before) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }

  const actor = getAdminPayload(req);
  const isSelf = actor?.sub && String(actor.sub) === String(userId);
  if (isSelf && (update.role === "customer" || update.status === "blocked")) {
    sendError(res, 409, "Bạn không thể tự hạ quyền hoặc khóa tài khoản admin đang đăng nhập.");
    return;
  }

  if (await wouldRemoveLastActiveAdmin(users, before, update)) {
    sendError(res, 409, "Hệ thống phải còn ít nhất một admin đang hoạt động.");
    return;
  }

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
  const actor = getAdminPayload(req);
  if (actor?.sub && String(actor.sub) === String(userId)) {
    sendError(res, 409, "Bạn không thể tự xóa tài khoản admin đang đăng nhập.");
    return;
  }

  const before = await users.findOne(
    { _id: new ObjectId(userId) },
    { projection: { passwordHash: 0 } }
  );
  if (!before) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }

  if (await wouldRemoveLastActiveAdmin(users, before)) {
    sendError(res, 409, "Hệ thống phải còn ít nhất một admin đang hoạt động.");
    return;
  }

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
    distributionMode: doc.distributionMode || "manual_claim",
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
    distributionMode: parsed.data.distributionMode || "manual_claim",
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
  if (!before) {
    sendError(res, 404, "Không tìm thấy mã giảm giá.");
    return;
  }

  const mergedType = update.type || before.type;
  const mergedValue = update.value ?? before.value;
  if (mergedType === "percent" && (Number(mergedValue) <= 0 || Number(mergedValue) > 100)) {
    sendError(res, 400, "Mức giảm phần trăm phải lớn hơn 0 và không vượt quá 100%.");
    return;
  }
  if (mergedType === "fixed" && Number(mergedValue) <= 0) {
    sendError(res, 400, "Số tiền giảm cố định phải lớn hơn 0.");
    return;
  }

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

  const { coupons, userVouchers, auditLogs } = await getCollections(getDb);
  const result = await coupons.findOneAndDelete({ _id: new ObjectId(couponId) });
  const deletedCoupon = unwrapMongoWriteResult(result);

  if (!deletedCoupon) {
    sendError(res, 404, "Không tìm thấy mã giảm giá.");
    return;
  }

  await userVouchers.deleteMany({ couponId });
  await writeAdminAuditLog(auditLogs, req, "delete", "coupon", couponId, {
    before: deletedCoupon,
  });

  sendJson(res, 200, { ok: true, deleted: normalizeCoupon(deletedCoupon) });
}

function normalizeInventory(doc = {}) {
  const stock = Math.max(0, Number(doc.stock || 0));
  const reservedStock = Math.max(0, Number(doc.reservedStock || 0));
  const availableStock = Math.max(0, stock - reservedStock);
  const status = getInventoryStatus({
    stock,
    reservedStock,
    currentStatus: doc.status,
  });

  return {
    id: String(doc._id || ""),
    key: doc.key || "",
    productId: String(doc.productId || ""),
    productSlug: doc.productSlug || doc.slug || "",
    productSku: doc.productSku || doc.sku || "",
    productName: doc.productName || doc.name || "",
    variantId: doc.variantId || "",
    variantName: doc.variantName || "",
    colorId: doc.colorId || "",
    colorName: doc.colorName || "",
    locationId: doc.locationId || "main",
    stock,
    reservedStock,
    availableStock,
    soldCount: Math.max(0, Number(doc.soldCount || 0)),
    status,
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
      { slug: regex },
      { sku: regex },
      { name: regex },
      { variantName: regex },
      { colorName: regex },
    ];
  }

  if (status && status !== "all") query.status = status;
  return query;
}

function buildInventoryKeyFromBody(input = {}) {
  const productIdentity = input.productId || input.productSlug || input.productSku;
  if (!productIdentity) return "";

  return cleanLimitedText([
    productIdentity,
    input.variantId || input.variantName || "default",
    input.colorId || input.colorName || "default",
  ].map(slugifyAuditKey).filter(Boolean).join("::"), 320);
}

function sanitizeInventoryCreate(input = {}) {
  const stock = Math.max(0, Math.min(1_000_000, Math.round(Number(input.stock || 0))));
  const reservedStock = 0;
  const soldCount = 0;
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
    locationId: cleanLimitedText(input.locationId || "main", 120),
    stock,
    reservedStock,
    soldCount,
    status: input.status === "inactive"
      ? "inactive"
      : getInventoryStatus({ stock, reservedStock }),
    note: cleanLimitedText(input.note, 1000),
  };
}

async function ensureInventoryRowsForProducts(inventory, productDocs = []) {
  const now = new Date();

  for (const product of productDocs) {
    const productId = String(product._id || product.slug || product.sku || "");
    if (!productId) continue;

    const key = [productId, "default", "default"].map(slugifyAuditKey).join("::");
    const aliases = [productId, product.slug, product.sku].filter(Boolean);
    const linkQuery = {
      $or: [
        { key },
        { productId: { $in: aliases } },
        { productSlug: { $in: aliases } },
        { productSku: { $in: aliases } },
        { slug: { $in: aliases } },
        { sku: { $in: aliases } },
      ],
    };
    const hasInventory = await inventory.findOne(linkQuery, { projection: { _id: 1 } });

    if (hasInventory) {
      await inventory.updateMany(linkQuery, {
        $set: {
          productId,
          productSlug: product.slug || "",
          productSku: product.sku || "",
          productName: product.name || "",
          updatedAt: now,
        },
      });
      continue;
    }

    await inventory.updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          variantId: "",
          variantName: "Mặc định",
          colorId: "",
          colorName: "Mặc định",
          locationId: "main",
          stock: 100,
          reservedStock: 0,
          soldCount: 0,
          status: "in_stock",
          note: "Khởi tạo mặc định 100 sản phẩm.",
          autoCreated: true,
          createdAt: now,
        },
        $set: {
          productId,
          productSlug: product.slug || "",
          productSku: product.sku || "",
          productName: product.name || "",
          updatedAt: now,
        },
      },
      { upsert: true }
    );
  }
}

async function handleListInventory({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { inventory, products } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 20, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const keyword = cleanLimitedText(url.searchParams.get("q"), 240);
  const requestedStatus = cleanLimitedText(url.searchParams.get("status"), 40);
  const productQuery = { manageInventory: { $ne: false } };

  if (keyword) {
    const regex = new RegExp(escapeRegex(keyword), "i");
    productQuery.$or = [
      { name: regex },
      { slug: regex },
      { sku: regex },
      { brand: regex },
      { category: regex },
    ];
  }

  const [totalProducts, productDocs] = await Promise.all([
    products.countDocuments(productQuery),
    products
      .find(
        productQuery,
        {
          projection: {
            name: 1,
            slug: 1,
            sku: 1,
            brand: 1,
            category: 1,
            manageInventory: 1,
            updatedAt: 1,
            scrapedAt: 1,
          },
        }
      )
      .sort({ updatedAt: -1, scrapedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
  ]);

  await ensureInventoryRowsForProducts(inventory, productDocs);

  const productIds = productDocs.map((product) => String(product._id)).filter(Boolean);
  const productSlugs = productDocs.map((product) => product.slug).filter(Boolean);
  const productSkus = productDocs.map((product) => product.sku).filter(Boolean);
  const pageAliases = [...new Set([...productIds, ...productSlugs, ...productSkus])];
  const inventoryQuery = productDocs.length
    ? {
        $or: [
          { productId: { $in: pageAliases } },
          { productSlug: { $in: pageAliases } },
          { productSku: { $in: pageAliases } },
          { slug: { $in: pageAliases } },
          { sku: { $in: pageAliases } },
        ],
      }
    : { _id: { $exists: false } };

  if (requestedStatus && requestedStatus !== "all") {
    inventoryQuery.status = requestedStatus;
  }

  const docs = await inventory
    .find(inventoryQuery)
    .sort({ productName: 1, variantName: 1, colorName: 1, _id: 1 })
    .toArray();

  sendJson(res, 200, {
    ok: true,
    pagination: {
      page,
      limit,
      total: totalProducts,
      totalPages: Math.ceil(totalProducts / limit),
    },
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

  const claimedResult = await inventory.findOneAndUpdate(
    { key: doc.key, autoCreated: true },
    {
      $set: { ...doc, updatedAt: now },
      $unset: { autoCreated: "" },
    },
    { returnDocument: "after" }
  );
  const claimedInventory = unwrapMongoWriteResult(claimedResult);
  if (claimedInventory) {
    await writeAdminAuditLog(auditLogs, req, "create", "inventory", claimedInventory._id, {
      after: claimedInventory,
      meta: { claimedAutoCreatedRow: true },
    });
    sendJson(res, 201, { ok: true, data: normalizeInventory(claimedInventory) });
    return;
  }

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

  const { inventory, auditLogs } = await getCollections(getDb);
  const query = {
    $or: [
      { key: identifier },
      { productId: identifier },
      { productSlug: identifier },
      { productSku: identifier },
      { slug: identifier },
      { sku: identifier },
      ...(ObjectId.isValid(identifier) ? [{ _id: new ObjectId(identifier) }] : []),
    ],
  };
  const before = await inventory.findOne(query);

  if (!before) {
    sendError(res, 404, "Không tìm thấy tồn kho.");
    return;
  }

  const update = {};
  if (parsed.data.stock !== undefined && parsed.data.stock !== "") {
    const stock = Math.max(0, Math.round(Number(parsed.data.stock || 0)));
    const reservedStock = Math.max(0, Number(before.reservedStock || 0));
    if (stock < reservedStock) {
      sendError(
        res,
        409,
        `Tồn thực tế không thể thấp hơn ${reservedStock} sản phẩm đang giữ chỗ.`
      );
      return;
    }
    update.stock = stock;
  }
  if (parsed.data.note !== undefined) update.note = cleanLimitedText(parsed.data.note, 1000);

  const nextStock = update.stock ?? Number(before.stock || 0);
  const nextReserved = Math.max(0, Number(before.reservedStock || 0));
  const requestedStatus = parsed.data.status;
  update.status = requestedStatus === "inactive"
    ? "inactive"
    : getInventoryStatus({
      stock: nextStock,
      reservedStock: nextReserved,
      currentStatus: requestedStatus === "inactive" ? "inactive" : "",
    });
  update.updatedAt = new Date();

  const result = await inventory.findOneAndUpdate(
    { _id: before._id },
    { $set: update },
    { returnDocument: "after" }
  );
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
  const existing = await inventory.findOne(query);
  if (existing && Number(existing.reservedStock || 0) > 0) {
    sendError(res, 409, "Không thể xóa tồn kho đang có sản phẩm giữ chỗ cho đơn hàng.");
    return;
  }

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

async function syncOrderShipmentFields({ orders, inventory, payments, shipment }) {
  if (!orders || !shipment?.orderCode) return;

  const order = await orders.findOne({ orderCode: shipment.orderCode });
  if (!order) return;

  const now = new Date();
  const set = {
    "shippingChoice.carrier": shipment.carrier || "",
    "shippingChoice.trackingCode": shipment.trackingCode || "",
    "shippingChoice.shipmentStatus": shipment.status || "",
    "shippingChoice.shipmentStatusLabel": SHIPMENT_STATUS_LABELS[shipment.status] || shipment.status || "",
    "shippingChoice.adminNote": shipment.note || "",
    updatedAt: now,
  };

  if (shipment.status === "shipping") {
    set.status = "shipping";
    set.statusLabel = ORDER_STATUS_LABELS.shipping;
  }
  if (shipment.status === "delivered") {
    set.status = "completed";
    set.statusLabel = ORDER_STATUS_LABELS.completed;

    const inventoryState = order.inventoryState
      || (!["completed", "cancelled", "refunded"].includes(order.status) ? "reserved" : "unknown");
    if (inventoryState === "reserved") {
      await settleInventoryForOrder(inventory, order, "complete");
      set.inventoryState = "fulfilled";
      set.inventoryUpdatedAt = now;
    }

    if (order.payment?.method === "cod") {
      set["payment.status"] = "paid";
      set["payment.statusLabel"] = PAYMENT_STATUS_LABELS.paid;
      set["payment.paidAt"] = now;
    }
  }
  if (shipment.estimatedDeliveryAt) set["shippingChoice.estimatedDeliveryAt"] = shipment.estimatedDeliveryAt;

  await orders.updateOne({ _id: order._id }, { $set: set });
  const updatedOrder = await orders.findOne({ _id: order._id });
  if (updatedOrder) await syncPaymentRecordFromOrder(payments, updatedOrder);
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

  const { shipments, orders, inventory, payments, auditLogs } = await getCollections(getDb);
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
  await syncOrderShipmentFields({ orders, inventory, payments, shipment: doc });
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

  const { shipments, orders, inventory, payments, auditLogs } = await getCollections(getDb);
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

  await syncOrderShipmentFields({ orders, inventory, payments, shipment: updated });
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

  if (update.status && update.status !== before.status) {
    const allowedStatuses = RETURN_STATUS_TRANSITIONS[before.status] || [];
    if (!allowedStatuses.includes(update.status)) {
      sendError(
        res,
        409,
        `Không thể chuyển đổi trả từ "${RETURN_STATUS_LABELS[before.status] || before.status}" sang "${RETURN_STATUS_LABELS[update.status] || update.status}".`
      );
      return;
    }
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

  const before = await returns.findOne(query);
  if (!before) {
    sendError(res, 404, "Không tìm thấy yêu cầu đổi trả.");
    return;
  }
  if (!["pending", "cancelled"].includes(before.status)) {
    sendError(res, 409, "Yêu cầu đã xử lý cần được giữ lại để đối soát.");
    return;
  }

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
    preferredContact: doc.preferredContact || "email",
    messages: Array.isArray(doc.messages)
      ? doc.messages.map((message) => ({
        id: String(message.id || ""),
        sender: message.sender === "admin" ? "admin" : "customer",
        senderName: message.senderName || (message.sender === "admin" ? "CellphoneS" : doc.fullName),
        content: message.content || "",
        createdAt: message.createdAt,
      }))
      : [],
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
  const countQuery = { ...query };
  delete countQuery.status;

  const [total, docs, statusCounts] = await Promise.all([
    supportRequests.countDocuments(query),
    supportRequests
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    supportRequests.aggregate([
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
  const responseChanged = Boolean(
    before
    && update.response
    && update.response !== before.response
  );
  if (responseChanged) {
    update.lastResponseAt = new Date();
  }
  const actor = getAdminPayload(req);
  const updateOperations = { $set: update };
  if (responseChanged) {
    updateOperations.$push = {
      messages: {
        id: new ObjectId().toHexString(),
        sender: "admin",
        senderName: actor?.fullName || actor?.name || "CellphoneS",
        content: update.response,
        createdAt: update.lastResponseAt,
      },
    };
  }
  const result = await supportRequests.findOneAndUpdate(
    query,
    updateOperations,
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
  const before = await supportRequests.findOne(query);
  if (!before) {
    sendError(res, 404, "Không tìm thấy yêu cầu hỗ trợ.");
    return;
  }
  if (before.status !== "new") {
    sendError(res, 409, "Yêu cầu đã xử lý cần được giữ lại trong lịch sử hỗ trợ.");
    return;
  }

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
