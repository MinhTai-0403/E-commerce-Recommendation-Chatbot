export const emptyProductForm = {
  name: '',
  slug: '',
  sku: '',
  brand: '',
  currentPrice: '',
  originalPrice: '',
  categories: '',
  primaryImage: '',
  description: '',
  stock: '100',
  reservedStock: '0',
  soldCount: '0',
  inventoryStatus: 'in_stock',
  inventoryNote: '',
};

export const emptyCouponForm = {
  code: '',
  name: '',
  description: '',
  type: 'fixed',
  value: '',
  maxDiscount: '',
  minSubtotal: '',
  usageLimit: '',
  userLimit: '',
  startsAt: '',
  expiresAt: '',
  status: 'active',
  audiences: ['all'],
  allowWithEducationOffer: true,
};

export const couponTypeOptions = [
  { value: 'fixed', label: 'Giảm tiền cố định' },
  { value: 'percent', label: 'Giảm theo %' },
  { value: 'free_shipping', label: 'Miễn phí vận chuyển' },
];

export const couponStatusOptions = [
  { value: 'active', label: 'Đang bật' },
  { value: 'inactive', label: 'Tạm tắt' },
  { value: 'expired', label: 'Hết hạn' },
];

export const couponAudienceOptions = [
  { value: 'all', label: 'Tất cả khách hàng', hint: 'Khách vãng lai và thành viên' },
  { value: 'smember', label: 'Tất cả Smember', hint: 'Bắt buộc đăng nhập' },
  { value: 'student', label: 'S-Student', hint: 'Sinh viên đã xác minh email trường' },
  { value: 'teacher', label: 'S-Teacher', hint: 'Giáo viên đã xác minh email trường' },
  { value: 'education', label: 'Nhóm giáo dục', hint: 'Cả S-Student và S-Teacher' },
  { value: 'business', label: 'S-Business', hint: 'Tài khoản khách hàng doanh nghiệp' },
];

export const orderStatusOptions = [
  { value: 'pending', label: 'Chờ xác nhận' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'packing', label: 'Đang chuẩn bị hàng' },
  { value: 'ready_for_pickup', label: 'Sẵn sàng nhận tại cửa hàng' },
  { value: 'shipping', label: 'Đang giao hàng' },
  { value: 'completed', label: 'Đã hoàn tất' },
  { value: 'cancelled', label: 'Đã hủy' },
];

export const paymentStatusOptions = [
  { value: 'unpaid', label: 'Chưa thanh toán' },
  { value: 'pending', label: 'Chờ chuyển khoản' },
  { value: 'paid', label: 'Đã thanh toán' },
  { value: 'refunded', label: 'Đã hoàn tiền' },
  { value: 'failed', label: 'Thanh toán lỗi' },
];

export const inventoryStatusOptions = [
  { value: 'in_stock', label: 'Còn hàng' },
  { value: 'low_stock', label: 'Sắp hết' },
  { value: 'out_of_stock', label: 'Hết hàng' },
  { value: 'inactive', label: 'Ngừng bán' },
];

export const shipmentStatusOptions = [
  { value: 'pending', label: 'Chờ tạo vận đơn' },
  { value: 'ready', label: 'Sẵn sàng giao' },
  { value: 'shipping', label: 'Đang giao' },
  { value: 'delivered', label: 'Đã giao' },
  { value: 'failed', label: 'Giao thất bại' },
  { value: 'cancelled', label: 'Đã hủy' },
];

export const returnStatusOptions = [
  { value: 'pending', label: 'Chờ tiếp nhận' },
  { value: 'received', label: 'Đã tiếp nhận' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Từ chối' },
  { value: 'completed', label: 'Hoàn tất' },
  { value: 'cancelled', label: 'Đã hủy' },
];

export function formatCurrency(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return 'Liên hệ';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN');
}

function splitTextList(value) {
  return String(value || '')
    .split(/[,|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function findInventoryForProduct(product = {}, inventoryItems = []) {
  const identifiers = [
    product.id,
    product.mongoId,
    product.slug,
    product.sku,
    product.name,
  ].filter(Boolean).map((value) => String(value).toLowerCase());

  return inventoryItems.find((item) => [
    item.id,
    item.productId,
    item.productSlug,
    item.productSku,
    item.productName,
    item.key,
  ].filter(Boolean).some((value) => identifiers.includes(String(value).toLowerCase())));
}

export function productToForm(product, inventoryItem = null) {
  return {
    name: product.name || '',
    slug: product.slug || '',
    sku: product.sku || '',
    brand: product.brand || product.brandName || '',
    currentPrice: product.currentPrice || '',
    originalPrice: product.originalPrice || '',
    categories: Array.isArray(product.categories) ? product.categories.join(', ') : '',
    primaryImage: product.primaryImage || product.thumbnail || product.image || '',
    description: product.description || '',
    stock: inventoryItem?.stock ?? product.stock ?? '100',
    reservedStock: inventoryItem?.reservedStock ?? product.reservedStock ?? '0',
    soldCount: inventoryItem?.soldCount ?? product.soldCount ?? '0',
    inventoryStatus: inventoryItem?.status || product.inventoryStatus || 'in_stock',
    inventoryNote: inventoryItem?.note || '',
  };
}

export function buildProductPayload(form) {
  const currentPrice = Number(form.currentPrice);
  const originalPrice = Number(form.originalPrice);
  const primaryImage = form.primaryImage.trim();

  return {
    source: 'admin',
    name: form.name.trim(),
    slug: form.slug.trim(),
    sku: form.sku.trim(),
    brand: form.brand.trim(),
    price: Number.isFinite(currentPrice) ? currentPrice : undefined,
    currentPrice: Number.isFinite(currentPrice) ? currentPrice : undefined,
    originalPrice: Number.isFinite(originalPrice) ? originalPrice : undefined,
    priceCurrency: 'VND',
    categories: splitTextList(form.categories),
    primaryImage,
    images: primaryImage ? [primaryImage] : [],
    description: form.description.trim(),
    availability: {
      status: form.inventoryStatus === 'out_of_stock' ? 'OutOfStock' : 'InStock',
      raw: form.inventoryStatus === 'out_of_stock' ? 'Hết hàng' : 'Còn hàng',
    },
    stock: Number(form.stock || 0),
  };
}

export function buildProductInventoryPayload(form, savedProduct = {}) {
  const productSlug = savedProduct.slug || form.slug.trim();
  const productSku = savedProduct.sku || form.sku.trim();
  const productName = savedProduct.name || form.name.trim();
  const productId = savedProduct.mongoId || savedProduct.id || productSlug || productSku || productName;

  return {
    key: productSlug || productSku || productId,
    productId: String(productId || ''),
    productSlug,
    productSku,
    productName,
    stock: Number(form.stock || 0),
    reservedStock: Number(form.reservedStock || 0),
    soldCount: Number(form.soldCount || 0),
    status: form.inventoryStatus || 'in_stock',
    note: form.inventoryNote || '',
  };
}

function toDatetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

export function couponToForm(coupon = {}) {
  return {
    code: coupon.code || '',
    name: coupon.name || '',
    description: coupon.description || '',
    type: coupon.type || 'fixed',
    value: coupon.value ?? '',
    maxDiscount: coupon.maxDiscount ?? '',
    minSubtotal: coupon.minSubtotal ?? '',
    usageLimit: coupon.usageLimit ?? '',
    userLimit: coupon.userLimit ?? '',
    startsAt: toDatetimeLocalValue(coupon.startsAt),
    expiresAt: toDatetimeLocalValue(coupon.expiresAt),
    status: coupon.status || 'active',
    audiences: Array.isArray(coupon.audiences) && coupon.audiences.length ? coupon.audiences : ['all'],
    allowWithEducationOffer: coupon.allowWithEducationOffer !== false,
  };
}

function numberOrUndefined(value) {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateOrUndefined(value) {
  return value ? new Date(value).toISOString() : undefined;
}

export function buildCouponPayload(form) {
  const payload = {
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
    description: form.description.trim(),
    type: form.type || 'fixed',
    value: numberOrUndefined(form.value) ?? 0,
    maxDiscount: numberOrUndefined(form.maxDiscount),
    minSubtotal: numberOrUndefined(form.minSubtotal) ?? 0,
    usageLimit: numberOrUndefined(form.usageLimit),
    userLimit: numberOrUndefined(form.userLimit),
    startsAt: dateOrUndefined(form.startsAt),
    expiresAt: dateOrUndefined(form.expiresAt),
    status: form.status || 'active',
    audiences: Array.isArray(form.audiences) && form.audiences.length ? form.audiences : ['all'],
    allowWithEducationOffer: Boolean(form.allowWithEducationOffer),
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key];
  });

  return payload;
}
