const ORDER_TRACKING_LABELS = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  packing: "Đang chuẩn bị hàng",
  ready_for_pickup: "Sẵn sàng nhận tại cửa hàng",
  shipping: "Đang giao",
  completed: "Giao thành công",
  cancelled: "Đã hủy",
  refunded: "Hoàn tiền",
};

const ORDER_TRACKING_FLOW = [
  "pending",
  "confirmed",
  "packing",
  "shipping",
  "completed",
];

function generateOrderCode() {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CPS${datePart}${randomPart}`;
}

function normalizeTimelineEntry(entry = {}, fallbackStatus = "pending") {
  const status = entry.status || fallbackStatus;
  return {
    status,
    label: entry.label || ORDER_TRACKING_LABELS[status] || status,
    note: entry.note || "",
    changedBy: entry.changedBy || "",
    changedByRole: entry.changedByRole || "",
    time: entry.changedAt || entry.createdAt || null,
  };
}

function buildOrderTracking(order = {}) {
  const currentStatus = order.status || "pending";
  const history = Array.isArray(order.statusHistory) && order.statusHistory.length
    ? order.statusHistory.map((entry) => normalizeTimelineEntry(entry, currentStatus))
    : [
      {
        status: "pending",
        label: ORDER_TRACKING_LABELS.pending,
        note: "Đặt hàng thành công.",
        changedBy: order.userId || "guest",
        changedByRole: order.userRole || "guest",
        time: order.createdAt || null,
      },
    ];

  const completedStatuses = new Set(history.map((entry) => entry.status));
  const currentIndex = ORDER_TRACKING_FLOW.indexOf(currentStatus);
  const flow = ORDER_TRACKING_FLOW.map((status, index) => ({
    status,
    label: ORDER_TRACKING_LABELS[status],
    completed: completedStatuses.has(status) || (currentIndex >= 0 && index <= currentIndex),
    current: status === currentStatus,
  }));

  if (["cancelled", "refunded"].includes(currentStatus)) {
    flow.push({
      status: currentStatus,
      label: ORDER_TRACKING_LABELS[currentStatus],
      completed: true,
      current: true,
    });
  }

  return {
    orderCode: order.orderCode || "",
    status: currentStatus,
    statusLabel: order.statusLabel || ORDER_TRACKING_LABELS[currentStatus] || "",
    paymentStatus: order.payment?.status || "unpaid",
    paymentLabel: order.payment?.statusLabel || "",
    trackingCode: order.shippingChoice?.trackingCode || order.shipment?.trackingCode || "",
    carrier: order.shippingChoice?.carrier || order.shipment?.carrier || "",
    etaText: order.shippingChoice?.etaText || "",
    timeline: history.sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0)),
    flow,
    updatedAt: order.updatedAt || order.createdAt || null,
  };
}

module.exports = {
  buildOrderTracking,
  generateOrderCode,
  ORDER_TRACKING_LABELS,
};
