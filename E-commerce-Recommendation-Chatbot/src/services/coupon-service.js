function toMoney(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
  return Math.round(numericValue);
}

function getCouponAudiences(coupon = {}) {
  const audiences = Array.isArray(coupon.audiences) ? coupon.audiences.filter(Boolean) : [];
  return audiences.length ? audiences : ["all"];
}

function getCouponAudienceInvalidReason(coupon = {}, member = null) {
  const audiences = getCouponAudiences(coupon);
  if (audiences.includes("all")) return "";
  if (!member) return "Vui lòng đăng nhập Smember để sử dụng mã giảm giá này.";

  const education = member.educationVerification || {};
  const educationActive = education.status === "verified" &&
    (!education.expiresAt || new Date(education.expiresAt) > new Date());
  const educationType = education.type || member.customerType || "";
  const matches = audiences.some((audience) => {
    if (audience === "smember") return true;
    if (audience === "education") return educationActive;
    if (audience === "student") return educationActive && educationType === "student";
    if (audience === "teacher") return educationActive && educationType === "teacher";
    if (audience === "business") return member.customerType === "business";
    return false;
  });

  if (matches) return "";
  if (audiences.includes("student") && !audiences.includes("teacher")) {
    return "Mã giảm giá này chỉ dành cho tài khoản S-Student đã xác minh.";
  }
  if (audiences.includes("teacher") && !audiences.includes("student")) {
    return "Mã giảm giá này chỉ dành cho tài khoản S-Teacher đã xác minh.";
  }
  if (audiences.includes("education")) {
    return "Mã giảm giá này chỉ dành cho tài khoản S-Student/S-Teacher đã xác minh.";
  }
  if (audiences.includes("business")) {
    return "Mã giảm giá này chỉ dành cho tài khoản S-Business.";
  }
  return "Tài khoản của bạn không thuộc nhóm được áp dụng mã giảm giá này.";
}

function computeCouponDiscount(coupon = {}, totalsBase = {}) {
  if (!coupon || coupon.status !== "active") return 0;

  const now = new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) return 0;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return 0;
  if (coupon.usageLimit && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) return 0;

  const subtotal = toMoney(totalsBase.subtotal);
  if (subtotal < toMoney(coupon.minSubtotal)) return 0;

  if (coupon.type === "free_shipping") return toMoney(totalsBase.shippingFee);
  if (coupon.type === "percent") {
    const rawDiscount = Math.floor((subtotal * Number(coupon.value || 0)) / 100);
    return coupon.maxDiscount ? Math.min(rawDiscount, toMoney(coupon.maxDiscount)) : rawDiscount;
  }

  return Math.min(subtotal, toMoney(coupon.value));
}

function normalizeCouponForPublic(coupon = {}, discount = 0) {
  if (!coupon) return null;
  return {
    id: String(coupon._id || ""),
    code: coupon.code || "",
    name: coupon.name || "",
    description: coupon.description || "",
    type: coupon.type || "fixed",
    value: coupon.value || 0,
    minSubtotal: coupon.minSubtotal || 0,
    maxDiscount: coupon.maxDiscount || 0,
    audiences: getCouponAudiences(coupon),
    allowWithEducationOffer: coupon.allowWithEducationOffer !== false,
    discount,
    startsAt: coupon.startsAt || null,
    expiresAt: coupon.expiresAt || null,
  };
}

function getCouponInvalidReason(coupon = null, totalsBase = {}, context = {}) {
  if (!coupon) return "Mã giảm giá không tồn tại hoặc đã ngừng áp dụng.";
  if (coupon.status !== "active") return "Mã giảm giá đang không hoạt động.";

  const now = new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) {
    return "Mã giảm giá chưa tới thời gian áp dụng.";
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return "Mã giảm giá đã hết hạn.";
  if (coupon.usageLimit && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) {
    return "Mã giảm giá đã hết lượt sử dụng.";
  }

  const audienceError = getCouponAudienceInvalidReason(coupon, context.member);
  if (audienceError) return audienceError;
  if (context.educationOffer && coupon.allowWithEducationOffer === false) {
    return "Mã giảm giá này không áp dụng đồng thời với ưu đãi giáo dục.";
  }

  const subtotal = toMoney(totalsBase.subtotal);
  const minSubtotal = toMoney(coupon.minSubtotal);
  if (subtotal < minSubtotal) {
    return `Đơn hàng cần tối thiểu ${minSubtotal.toLocaleString("vi-VN")}đ để áp dụng mã này.`;
  }

  return "";
}

module.exports = {
  computeCouponDiscount,
  getCouponAudienceInvalidReason,
  getCouponAudiences,
  getCouponInvalidReason,
  normalizeCouponForPublic,
};
