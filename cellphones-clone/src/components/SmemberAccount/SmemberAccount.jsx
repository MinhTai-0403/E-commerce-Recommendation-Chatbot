import { useEffect, useMemo, useState } from 'react';
import { formatPrice } from '../../data/mockData';
import {
  findInstitutionByEmail,
  findInstitutionByName,
  getInstitutionMeta,
  getEmailDomain,
  loadHcmcEducationInstitutions,
  searchEducationInstitutions,
} from '../../data/educationInstitutions';
import {
  changeSmemberPassword,
  requestEducationVerificationOtp,
  submitBusinessVerification,
  updateCurrentSmember,
  verifyEducationVerificationOtp,
} from '../../services/apiAuth';
import {
  claimCustomerVoucher,
  createCustomerAddress,
  createCustomerReturnRequest,
  deleteCustomerAddress,
  fetchCustomerAddresses,
  fetchCustomerInvoices,
  fetchCustomerNotifications,
  fetchCustomerReturns,
  fetchCustomerVouchers,
  fetchCustomerWarranties,
  fetchCustomerWishlist,
  markCustomerNotificationRead,
  setDefaultCustomerAddress,
  updateCustomerAddress,
} from '../../services/apiCustomer';
import { fetchMyOrders } from '../../services/apiOrders';
import './SmemberAccount.css';

const statusLabels = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  packing: 'Đang chuẩn bị hàng',
  ready_for_pickup: 'Sẵn sàng nhận tại cửa hàng',
  shipping: 'Đang giao hàng',
  completed: 'Giao thành công',
  cancelled: 'Đã hủy',
  refunded: 'Hoàn tiền',
};

const returnStatusLabels = {
  pending: 'Chờ tiếp nhận',
  received: 'Đã tiếp nhận',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  completed: 'Hoàn trả thành công',
  cancelled: 'Đã hủy',
};

const returnReasonOptions = [
  'Sản phẩm lỗi kỹ thuật',
  'Sản phẩm không đúng mô tả',
  'Giao sai sản phẩm hoặc phiên bản',
  'Thiếu phụ kiện hoặc quà tặng',
  'Sản phẩm bị trầy xước, móp vỡ',
  'Nhu cầu đổi sang sản phẩm khác',
  'Lý do khác',
];

const voucherAudienceLabels = {
  all: 'Tất cả khách hàng',
  smember: 'Smember',
  student: 'S-Student',
  teacher: 'S-Teacher',
  education: 'S-Student & S-Teacher',
  business: 'S-Business',
};

const iconPaths = {
  overview: ['M3.75 10.4 12 3.75l8.25 6.65', 'M5.5 9.75V20h13V9.75', 'M9.5 20v-5.5h5V20'],
  receipt: ['M6 3.75h12v16.5l-2-1.25-2 1.25-2-1.25-2 1.25-2-1.25-2 1.25V3.75Z', 'M8.5 8h7', 'M8.5 12h7', 'M8.5 16h4'],
  warranty: ['M12 3.5 5.25 6.4v5.1c0 4.25 2.75 7.15 6.75 8.9 4-1.75 6.75-4.65 6.75-8.9V6.4L12 3.5Z', 'm9.5 12 1.65 1.65L15 9.75'],
  recycle: ['M7.2 8.4 9.7 4l2.55 4.4', 'M8.55 4.25h4.95', 'M16.85 8.45l2.55 4.35h-5.1', 'M19.2 12.8l-2.45 4.25', 'M12.05 19.25H7l2.55-4.4', 'M7.1 17.05l-2.5-4.25'],
  diamond: ['M12 3.5 20 8.25 12 20.5 4 8.25 12 3.5Z', 'M4 8.25h16', 'M9.2 8.25 12 20.5l2.8-12.25'],
  suitcase: ['M8 7V5.75A1.75 1.75 0 0 1 9.75 4h4.5A1.75 1.75 0 0 1 16 5.75V7', 'M4 7.5h16v11H4z', 'M4 12h16'],
  cap: ['M3.5 8.25 12 4.5l8.5 3.75L12 12 3.5 8.25Z', 'M7 10.25v4.25c2.8 2 7.2 2 10 0v-4.25', 'M20.5 8.25V13'],
  gear: ['M12 8.25A3.75 3.75 0 1 0 12 15.75 3.75 3.75 0 0 0 12 8.25Z', 'M19.4 13.5a7.9 7.9 0 0 0 0-3l2-1.55-2-3.45-2.45 1a8.7 8.7 0 0 0-2.6-1.5L14 2.5h-4l-.35 2.5a8.7 8.7 0 0 0-2.6 1.5l-2.45-1-2 3.45 2 1.55a7.9 7.9 0 0 0 0 3l-2 1.55 2 3.45 2.45-1a8.7 8.7 0 0 0 2.6 1.5L10 21.5h4l.35-2.5a8.7 8.7 0 0 0 2.6-1.5l2.45 1 2-3.45-2-1.55Z'],
  store: ['M4.5 10.25h15l-1.25-5.5H5.75L4.5 10.25Z', 'M6 10.25V20h12v-9.75', 'M9 20v-5.25h6V20', 'M4.5 10.25c.4 1.35 2.45 1.35 3 0 .55 1.35 2.6 1.35 3.1 0 .55 1.35 2.6 1.35 3.1 0 .55 1.35 2.6 1.35 3.1 0 .55 1.35 2.6 1.35 3 0'],
  document: ['M7 3.75h7l3 3v13.5H7V3.75Z', 'M14 3.75V7h3', 'M9.5 11h5', 'M9.5 14.5h5', 'M9.5 18h3'],
  mail: ['M4 6.5h16v11H4z', 'm4 7 8 5.5 8-5.5'],
  voucher: ['M4.5 7.25h15v3a2 2 0 0 0 0 4v3h-15v-3a2 2 0 0 0 0-4v-3Z', 'M9 9.5h.01', 'M15 15.5h.01', 'm9 15.5 6-6'],
  heart: ['M12 20s-7-4.25-7-10a3.8 3.8 0 0 1 6.75-2.35A3.8 3.8 0 0 1 18.5 10c0 5.75-6.5 10-6.5 10Z'],
  bell: ['M18 16.5H6l1.4-2.25V10a4.6 4.6 0 0 1 9.2 0v4.25L18 16.5Z', 'M10 19a2 2 0 0 0 4 0'],
  link: ['M10.25 13.75a3.5 3.5 0 0 1 0-4.95l2.1-2.1a3.5 3.5 0 0 1 4.95 4.95l-1.15 1.15', 'M13.75 10.25a3.5 3.5 0 0 1 0 4.95l-2.1 2.1A3.5 3.5 0 0 1 6.7 12.35l1.15-1.15'],
  logout: ['M10 5H5v14h5', 'M13 16l4-4-4-4', 'M17 12H9'],
};

function SmemberIcon({ name, className = '' }) {
  const paths = iconPaths[name] || iconPaths.overview;
  return (
    <svg className={`smember-svg-icon ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function getVoucherBenefit(voucher = {}) {
  if (voucher.type === 'percent') {
    const cap = Number(voucher.maxDiscount || 0);
    return `Giảm ${Number(voucher.value || 0)}%${cap > 0 ? ` · tối đa ${formatPrice(cap)}` : ''}`;
  }
  if (voucher.type === 'free_shipping') return 'Miễn phí vận chuyển';
  return `Giảm ${formatPrice(Number(voucher.value || 0))}`;
}

function VoucherCard({ voucher, compact = false }) {
  const audiences = Array.isArray(voucher.audiences) && voucher.audiences.length
    ? voucher.audiences
    : ['all'];
  const audienceText = audiences
    .map((audience) => voucherAudienceLabels[audience] || audience)
    .join(', ');
  const expiryText = voucher.expiresAt || voucher.endAt
    ? formatDate(voucher.expiresAt || voucher.endAt)
    : 'Không giới hạn';

  return (
    <div className={`smember-voucher ${compact ? 'compact' : ''}`}>
      <span><SmemberIcon name="voucher" /></span>
      <div>
        <strong>{voucher.code || voucher.title || 'Voucher CellphoneS'}</strong>
        <b className="smember-voucher-benefit">{getVoucherBenefit(voucher)}</b>
        <p>{voucher.description || voucher.name || 'Áp dụng theo điều kiện chương trình.'}</p>
        <small>Dành cho: {audienceText}</small>
        {Number(voucher.minSubtotal || 0) > 0 && (
          <small>Đơn tối thiểu: {formatPrice(Number(voucher.minSubtotal))}</small>
        )}
        {!compact && <small>Hạn dùng: {expiryText}</small>}
      </div>
    </div>
  );
}

const menuItems = [
  { id: 'overview', label: 'Tổng quan', icon: 'overview' },
  { id: 'orders', label: 'Lịch sử mua hàng', icon: 'receipt' },
  { id: 'warranty', label: 'Tra cứu bảo hành', icon: 'warranty' },
  { id: 'tradein', label: 'Lịch sử thu cũ', icon: 'recycle' },
  { id: 'rank', label: 'Hạng thành viên và ưu đãi', icon: 'diamond', separator: true },
  { id: 'business', label: 'Ưu đãi và đơn hàng S-Business', icon: 'suitcase' },
  { id: 'education', label: 'Ưu đãi S-Student và S-Teacher', icon: 'cap' },
  { id: 'profile', label: 'Thông tin tài khoản', icon: 'gear', separator: true },
  { id: 'stores', label: 'Tìm kiếm cửa hàng', icon: 'store' },
  { id: 'policy', label: 'Chính sách bảo hành', icon: 'document', path: '/chinh-sach-bao-hanh' },
  { id: 'support', label: 'Góp ý - Phản hồi - Hỗ trợ', icon: 'mail', path: '/support' },
  { id: 'terms', label: 'Điều khoản sử dụng', icon: 'document' },
];

const accountTabIds = new Set([
  ...menuItems.filter((item) => !item.path).map((item) => item.id),
  'vouchers',
  'addresses',
  'wishlist',
  'notifications',
  'invoices',
]);

function getAccountTabFromSearch(search = '') {
  const params = new URLSearchParams(search || '');
  const requestedTab = String(params.get('tab') || '').trim();
  return accountTabIds.has(requestedTab) ? requestedTab : 'overview';
}

const emptyAddressForm = {
  fullName: '',
  phone: '',
  province: '',
  district: '',
  ward: '',
  addressLine: '',
  isDefault: false,
};

function maskPhone(phone = '') {
  const clean = String(phone || '').replace(/[^\d]/g, '');
  if (clean.length < 6) return clean || 'Chưa cập nhật SĐT';
  return `${clean.slice(0, 3)}*****${clean.slice(-2)}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('vi-VN');
}

function getItemPaidAmount(item = {}) {
  const quantity = Math.max(1, Number(item.quantity || 1));
  const lineTotal = Number(item.lineTotal || item.total || item.subtotal || 0);
  const unitPrice = Number(item.currentPrice || item.price || item.unitPrice || 0);
  return Math.max(0, lineTotal > 0 ? lineTotal : unitPrice * quantity);
}

function getDerivedReturnAmount(order, returns = []) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const completedReturns = returns.filter((request) => (
    request.orderCode === order?.orderCode && request.status === 'completed'
  ));

  return completedReturns.reduce((sum, request) => {
    const item = items.find((candidate) => (
      (request.productId && [candidate.productId, candidate.mongoId].includes(request.productId))
      || (request.productSlug && [candidate.slug, candidate.productSlug].includes(request.productSlug))
      || (request.productName && request.productName === (candidate.name || candidate.productName))
    ));
    return sum + (item ? getItemPaidAmount(item) : Number(request.refundAmount || 0));
  }, 0);
}

function getCompletedReturnSummary(order, returns = []) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const completedReturns = returns.filter((request) => (
    request.orderCode === order?.orderCode && request.status === 'completed'
  ));

  if (!completedReturns.length) return null;

  const returnedItemKeys = new Set(completedReturns.map((request) => (
    request.productId || request.productSlug || request.productName || request.returnCode
  )).filter(Boolean));
  const totalItems = Math.max(1, items.length);
  const isFullReturn = returnedItemKeys.size >= totalItems;

  return {
    status: isFullReturn ? 'return_completed' : 'return_partial_completed',
    label: isFullReturn ? 'Hoàn trả thành công' : 'Hoàn trả một phần',
    isFullReturn,
  };
}

function getOrderTotal(order, returns = []) {
  const originalTotal = Number(order?.totals?.total || order?.totals?.roundedTotal || 0);
  const explicitNetTotal = Number(order?.totals?.netTotal);
  if (Number.isFinite(explicitNetTotal) && explicitNetTotal >= 0) return explicitNetTotal;

  const recordedRefund = Number(order?.totals?.refundedAmount || order?.payment?.refundedAmount || 0);
  const derivedRefund = getDerivedReturnAmount(order, returns);
  return Math.max(0, originalTotal - Math.max(recordedRefund, derivedRefund));
}

function isOrderEligibleForMemberStats(order) {
  const orderStatus = String(order?.status || '').trim().toLowerCase();
  const paymentStatus = String(order?.payment?.status || order?.paymentStatus || '').trim().toLowerCase();
  const paymentMethod = String(order?.payment?.method || order?.paymentMethod || '').trim().toLowerCase();

  if (orderStatus !== 'completed') return false;
  if (['failed', 'refunded', 'cancelled'].includes(paymentStatus)) return false;

  // Đơn chuyển khoản/QR chỉ được tính khi đã thanh toán thật.
  if (['bank_qr', 'bank-qr', 'vietqr', 'qr', 'bank_transfer', 'bank-transfer'].includes(paymentMethod)) {
    return ['paid', 'completed', 'success', 'succeeded'].includes(paymentStatus);
  }

  // COD đã giao thành công thì được tính tích lũy.
  return true;
}

function getOrderQuantity(order) {
  return Number(order?.totals?.quantity || 0)
    || (order?.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function getRankLabel(rank = 'S-NEW') {
  return String(rank || 'S-NEW').toUpperCase();
}

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }

    if (!file.type.startsWith('image/')) {
      reject(new Error('Vui lòng chọn đúng file ảnh.'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('Ảnh quá lớn. Vui lòng chọn ảnh dưới 5MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('File ảnh không hợp lệ hoặc đã bị lỗi.'));
      image.onload = () => {
        const maxSize = 360;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function readBusinessDocumentAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      reject(new Error('Vui lòng chọn ảnh Giấy chứng nhận đăng ký doanh nghiệp.'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('Ảnh hồ sơ quá lớn. Vui lòng chọn ảnh dưới 5MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc ảnh hồ sơ doanh nghiệp.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Ảnh hồ sơ doanh nghiệp không hợp lệ.'));
      image.onload = () => {
        const maxSize = 1200;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function OrderCard({ order, returns = [], onCreateReturn, returnSubmitting = false }) {
  const [expanded, setExpanded] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnForm, setReturnForm] = useState({ productIndex: '0', reason: '', note: '', images: [] });
  const [returnImageError, setReturnImageError] = useState('');
  const items = Array.isArray(order.items) ? order.items : [];
  const firstItem = items[0] || {};
  const address = order.shippingAddress?.fullAddress
    || [
      order.shippingAddress?.addressLine,
      order.shippingAddress?.ward,
      order.shippingAddress?.district,
      order.shippingAddress?.province,
    ].filter(Boolean).join(', ');
  const history = order.statusHistory?.length
    ? order.statusHistory
    : [{ status: order.status, label: order.statusLabel || statusLabels[order.status], changedAt: order.updatedAt }];
  const orderReturns = returns.filter((request) => request.orderCode === order.orderCode);
  const returnSummary = getCompletedReturnSummary(order, returns);
  const orderTotalAfterReturns = getOrderTotal(order, returns);
  const originalOrderTotal = Number(order?.totals?.total || order?.totals?.roundedTotal || 0);
  const hasFullReturn = returnSummary?.isFullReturn
    || (returnSummary && originalOrderTotal > 0 && orderTotalAfterReturns <= 0);
  const displayStatus = hasFullReturn
    ? 'return_completed'
    : (returnSummary?.status || order.status || 'pending');
  const displayStatusLabel = hasFullReturn
    ? 'Hoàn trả thành công'
    : (returnSummary?.label || statusLabels[order.status] || order.statusLabel || order.status);
  const totalLabel = hasFullReturn
    ? 'Đã hoàn trả'
    : (orderTotalAfterReturns < originalOrderTotal ? 'Thanh toán sau hoàn trả' : 'Tổng thanh toán');

  const findItemReturn = (item) => orderReturns.find((request) => (
    (item.productId && request.productId === item.productId)
    || (item.slug && request.productSlug === item.slug)
    || request.productName === item.name
  ));

  const canRequestReturn = order.status === 'completed' && items.some((item) => {
    const request = findItemReturn(item);
    return !request || ['rejected', 'cancelled'].includes(request.status);
  });

  const handleReturnSubmit = async (event) => {
    event.preventDefault();
    const selectedItem = items[Number(returnForm.productIndex) || 0];
    if (!selectedItem || !returnForm.reason) return;

    try {
      const productId = selectedItem.productId || selectedItem.mongoId || '';
      const productSlug = selectedItem.slug || selectedItem.productSlug || '';
      await onCreateReturn?.({
        orderCode: order.orderCode,
        ...(productId ? { productId } : {}),
        ...(productSlug ? { productSlug } : {}),
        productName: selectedItem.name || selectedItem.productName || 'Sản phẩm CellphoneS',
        reason: returnForm.reason,
        note: returnForm.note,
        images: returnForm.images,
      });
      setReturnForm({ productIndex: '0', reason: '', note: '', images: [] });
      setReturnImageError('');
      setShowReturnForm(false);
    } catch {
      // Parent component displays the API error and keeps the form open for correction.
    }
  };

  const handleReturnImagesChange = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    setReturnImageError('');

    if (!selectedFiles.length) return;

    const remainingSlots = Math.max(0, 6 - returnForm.images.length);
    if (!remainingSlots) {
      setReturnImageError('Bạn chỉ có thể đính kèm tối đa 6 ảnh.');
      return;
    }

    const filesToRead = selectedFiles.slice(0, remainingSlots);

    try {
      const images = await Promise.all(filesToRead.map((file) => readImageFileAsDataUrl(file)));
      setReturnForm((form) => ({
        ...form,
        images: [...form.images, ...images.filter(Boolean)].slice(0, 6),
      }));

      if (selectedFiles.length > remainingSlots) {
        setReturnImageError(`Chỉ thêm ${remainingSlots} ảnh để không vượt quá giới hạn 6 ảnh.`);
      }
    } catch (imageError) {
      setReturnImageError(imageError.message || 'Không thể đọc ảnh đính kèm.');
    }
  };

  const handleRemoveReturnImage = (imageIndex) => {
    setReturnForm((form) => ({
      ...form,
      images: form.images.filter((_, index) => index !== imageIndex),
    }));
    setReturnImageError('');
  };

  return (
    <article className={`smember-order-card ${expanded ? 'expanded' : ''}`}>
      <div className="smember-order-top">
        <div>
          <span>Đơn hàng <strong>#{order.orderCode}</strong></span>
          <span>{formatDate(order.createdAt)}</span>
        </div>
        <em className={`smember-order-status ${displayStatus}`}>
          {displayStatusLabel}
        </em>
      </div>

      <div className="smember-order-main">
        <img src={firstItem.image || firstItem.thumbnail || firstItem.primaryImage} alt={firstItem.name || ''} />
        <div className="smember-order-summary">
          <strong>{firstItem.name || 'Đơn hàng CellphoneS'}</strong>
          <span>{getOrderQuantity(order)} sản phẩm · {order.shippingChoice?.label || 'Giao tiêu chuẩn'}</span>
          <small>{address || 'Địa chỉ nhận hàng sẽ được cập nhật khi xử lý đơn.'}</small>
        </div>
        <div className="smember-order-total">
          <span>{totalLabel}</span>
          <strong>{formatPrice(orderTotalAfterReturns)}</strong>
          <button type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Thu gọn' : 'Xem chi tiết'} <b>{expanded ? '⌃' : '⌄'}</b>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="smember-order-detail">
          <section className="smember-order-detail-section">
            <div className="smember-order-detail-title">
              <strong>Sản phẩm trong đơn</strong>
              <span>{items.length} mặt hàng</span>
            </div>
            <div className="smember-order-items">
              {items.map((item, index) => {
                const returnRequest = findItemReturn(item);
                return (
                  <div className="smember-order-item-row" key={item.id || item.slug || item.name || index}>
                    <img src={item.image || item.thumbnail || item.primaryImage} alt={item.name || ''} />
                    <div>
                      <strong>{item.name || 'Sản phẩm CellphoneS'}</strong>
                      <span>Số lượng: {item.quantity || 1}</span>
                      {returnRequest && (
                        <em className={`smember-return-status ${returnRequest.status || 'pending'}`}>
                          Đổi trả: {returnStatusLabels[returnRequest.status] || returnRequest.statusLabel || returnRequest.status}
                        </em>
                      )}
                    </div>
                    <b>{formatPrice((item.price || item.currentPrice || 0) * (item.quantity || 1))}</b>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="smember-order-detail-section timeline-section">
            <div className="smember-order-detail-title">
              <strong>Tiến trình đơn hàng</strong>
              <span>{history.length} cập nhật</span>
            </div>
            <div className="smember-status-timeline">
              {history.map((item, index) => (
                <div className="smember-status-node" key={`${order.id || order.orderCode}-${item.status}-${index}`}>
                  <span />
                  <div>
                    <strong>{item.label || statusLabels[item.status] || item.status}</strong>
                    <small>{formatDate(item.changedAt || item.time)}</small>
                    {item.note && <p>{item.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {(canRequestReturn || orderReturns.length > 0) && (
            <section className="smember-order-detail-section smember-return-section">
              <div className="smember-order-detail-title">
                <div>
                  <strong>Đổi trả sản phẩm</strong>
                  <p>Theo dõi hoặc gửi yêu cầu cho sản phẩm đã giao thành công.</p>
                </div>
                {canRequestReturn && (
                  <button type="button" onClick={() => setShowReturnForm((value) => !value)}>
                    {showReturnForm ? 'Đóng biểu mẫu' : 'Tạo yêu cầu'}
                  </button>
                )}
              </div>

              {orderReturns.length > 0 && (
                <div className="smember-return-list">
                  {orderReturns.map((request) => (
                    <article key={request.id || request.returnCode}>
                      <div>
                        <strong>#{request.returnCode}</strong>
                        <span>{request.productName}</span>
                      </div>
                      <em className={`smember-return-status ${request.status || 'pending'}`}>
                        {returnStatusLabels[request.status] || request.statusLabel || request.status}
                      </em>
                      <p>{request.reason}</p>
                      {request.status === 'completed' && Number(request.refundAmount || 0) > 0 && (
                        <small>Đã hoàn: {formatPrice(request.refundAmount)}</small>
                      )}
                      {request.adminNote && <small>Phản hồi: {request.adminNote}</small>}
                    </article>
                  ))}
                </div>
              )}

              {showReturnForm && (
                <form className="smember-return-form" onSubmit={handleReturnSubmit}>
                  <label>
                    Sản phẩm cần đổi trả
                    <select
                      value={returnForm.productIndex}
                      onChange={(event) => setReturnForm((form) => ({ ...form, productIndex: event.target.value }))}
                    >
                      {items.map((item, index) => (
                        <option value={String(index)} key={item.id || item.slug || item.name || index}>
                          {item.name || `Sản phẩm ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Lý do
                    <select
                      required
                      value={returnForm.reason}
                      onChange={(event) => setReturnForm((form) => ({ ...form, reason: event.target.value }))}
                    >
                      <option value="">Chọn lý do đổi trả</option>
                      {returnReasonOptions.map((reason) => <option value={reason} key={reason}>{reason}</option>)}
                    </select>
                  </label>
                  <label className="full">
                    Mô tả thêm
                    <textarea
                      rows="3"
                      value={returnForm.note}
                      placeholder="Mô tả tình trạng sản phẩm để nhân viên xử lý nhanh hơn..."
                      onChange={(event) => setReturnForm((form) => ({ ...form, note: event.target.value }))}
                    />
                  </label>

                  <div className="smember-return-image-field full">
                    <div className="smember-return-image-heading">
                      <div>
                        <strong>Ảnh tình trạng sản phẩm</strong>
                        <span>Chọn cùng lúc nhiều ảnh JPG, PNG hoặc WEBP · tối đa 6 ảnh</span>
                      </div>
                      <em>{returnForm.images.length}/6 ảnh</em>
                    </div>

                    <label className={`smember-return-image-picker ${returnForm.images.length >= 6 ? 'disabled' : ''}`}>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        disabled={returnForm.images.length >= 6 || returnSubmitting}
                        onChange={handleReturnImagesChange}
                      />
                      <span>＋</span>
                      <strong>{returnForm.images.length ? 'Thêm ảnh khác' : 'Chọn nhiều ảnh'}</strong>
                      <small>Có thể chọn nhiều file trong một lần</small>
                    </label>

                    {returnImageError && <p className="smember-return-image-error">{returnImageError}</p>}

                    {returnForm.images.length > 0 && (
                      <div className="smember-return-image-preview">
                        {returnForm.images.map((image, imageIndex) => (
                          <figure key={`${image.slice(0, 36)}-${imageIndex}`}>
                            <img src={image} alt={`Ảnh đổi trả ${imageIndex + 1}`} />
                            <button
                              type="button"
                              aria-label={`Xóa ảnh ${imageIndex + 1}`}
                              onClick={() => handleRemoveReturnImage(imageIndex)}
                            >
                              ×
                            </button>
                            <figcaption>Ảnh {imageIndex + 1}</figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                  </div>

                  <button type="submit" disabled={returnSubmitting || !returnForm.reason}>
                    {returnSubmitting ? 'Đang gửi...' : 'Gửi yêu cầu đổi trả'}
                  </button>
                </form>
              )}
            </section>
          )}
        </div>
      )}
    </article>
  );
}

export default function SmemberAccount({
  currentUser,
  onGoLogin,
  onLogout,
  onUserUpdate,
  onNavigate,
  search = '',
}) {
  const [activeTab, setActiveTab] = useState(() => (
    getAccountTabFromSearch(search || window.location.search)
  ));
  const [orders, setOrders] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherClaiming, setVoucherClaiming] = useState(false);
  const [warranties, setWarranties] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [returns, setReturns] = useState([]);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingAddressId, setEditingAddressId] = useState('');
  const [addressForm, setAddressForm] = useState(emptyAddressForm);
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    birthday: '',
    gender: '',
    email: '',
    phone: '',
    avatar: '',
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [educationForm, setEducationForm] = useState({
    type: 'student',
    schoolName: '',
    email: '',
    otp: '',
  });
  const [educationOtpSent, setEducationOtpSent] = useState(false);
  const [businessForm, setBusinessForm] = useState({
    companyName: '',
    taxCode: '',
    companyAddress: '',
    representativeName: currentUser?.fullName || '',
    position: '',
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
    registrationDocument: '',
  });
  const [educationDirectory, setEducationDirectory] = useState([]);
  const [educationDirectoryLoading, setEducationDirectoryLoading] = useState(true);
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
    queueMicrotask(() => setActiveTab(getAccountTabFromSearch(search)));
  }, [search]);

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

  useEffect(() => {
    if (!currentUser) return;
    queueMicrotask(() => {
      setProfileForm({
        fullName: currentUser.fullName || '',
        birthday: currentUser.birthday || '',
        gender: currentUser.gender || '',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        avatar: currentUser.avatar || '',
      });
      const businessVerification = currentUser.businessVerification || {};
      setBusinessForm((form) => ({
        ...form,
        companyName: businessVerification.companyName || form.companyName,
        taxCode: businessVerification.taxCode || form.taxCode,
        companyAddress: businessVerification.companyAddress || form.companyAddress,
        representativeName: businessVerification.representativeName || form.representativeName || currentUser.fullName || '',
        position: businessVerification.position || form.position,
        email: businessVerification.email || form.email || currentUser.email || '',
        phone: businessVerification.phone || form.phone || currentUser.phone || '',
      }));
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return undefined;

    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError('');
    });

    Promise.allSettled([
      fetchMyOrders(controller.signal),
      fetchCustomerAddresses(),
      fetchCustomerWishlist(),
      fetchCustomerNotifications({ limit: 20 }),
      fetchCustomerVouchers(),
      fetchCustomerWarranties(),
      fetchCustomerInvoices(),
      fetchCustomerReturns({ limit: 100 }),
    ])
      .then((results) => {
        if (controller.signal.aborted) return;
        const [ordersResult, addressesResult, wishlistResult, notificationsResult, vouchersResult, warrantiesResult, invoicesResult, returnsResult] = results;
        if (ordersResult.status === 'fulfilled') setOrders(ordersResult.value);
        if (addressesResult.status === 'fulfilled') setAddresses(addressesResult.value);
        if (wishlistResult.status === 'fulfilled') setWishlist(wishlistResult.value);
        if (notificationsResult.status === 'fulfilled') setNotifications(notificationsResult.value);
        if (vouchersResult.status === 'fulfilled') setVouchers(vouchersResult.value);
        if (warrantiesResult.status === 'fulfilled') setWarranties(warrantiesResult.value);
        if (invoicesResult.status === 'fulfilled') setInvoices(invoicesResult.value);
        if (returnsResult.status === 'fulfilled') setReturns(returnsResult.value);

        const rejected = results.find((item) => item.status === 'rejected');
        if (rejected) setError(rejected.reason?.message || 'Không thể tải đầy đủ dữ liệu tài khoản.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [currentUser]);

  const stats = useMemo(() => {
    const eligibleOrders = orders.filter((order) => (
      isOrderEligibleForMemberStats(order) && getOrderTotal(order, returns) > 0
    ));
    const totalSpent = eligibleOrders.reduce((sum, order) => sum + getOrderTotal(order, returns), 0);
    const totalOrders = eligibleOrders.length;
    const points = Math.floor(totalSpent / 100000);
    const memberRank = getRankLabel(totalSpent >= 20000000 ? 'S-VIP' : totalSpent >= 3000000 ? 'S-MEM' : 'S-NEW');
    const nextRankSpent = memberRank === 'S-NEW' ? 3000000 : memberRank === 'S-MEM' ? 20000000 : null;
    const nextRankLabel = memberRank === 'S-NEW' ? 'S-MEM' : memberRank === 'S-MEM' ? 'S-VIP' : '';

    return {
      totalOrders,
      totalSpent,
      points,
      memberRank,
      nextRankLabel,
      remainingToNextRank: nextRankSpent ? Math.max(0, nextRankSpent - totalSpent) : 0,
      recentOrders: orders.slice(0, 3),
    };
  }, [orders, returns]);

  if (!currentUser) {
    return (
      <section className="smember-account-page">
        <div className="container smember-account-container">
          <div className="smember-login-required">
            <img src="https://cellphones.com.vn/media/wysiwyg/ant-smile.png" alt="" />
            <h1>Đăng nhập Smember để xem thông tin cá nhân</h1>
            <p>Lịch sử mua hàng, ưu đãi và trạng thái đơn chỉ hiển thị cho tài khoản đã đăng nhập.</p>
            <button type="button" onClick={onGoLogin}>Đăng nhập ngay</button>
          </div>
        </div>
      </section>
    );
  }

  const displayName = currentUser.fullName || currentUser.username || currentUser.email || 'Khách hàng CellphoneS';
  const avatar = currentUser.avatar || 'https://cellphones.com.vn/media/wysiwyg/ant-smile.png';

  const reloadAddresses = async () => {
    setAddresses(await fetchCustomerAddresses());
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const updatedUser = await updateCurrentSmember(profileForm);
      onUserUpdate?.(updatedUser);
      setSuccess('Đã cập nhật thông tin tài khoản.');
    } catch (updateError) {
      setError(updateError.message || 'Không thể cập nhật thông tin tài khoản.');
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      await changeSmemberPassword(passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setSuccess('Đã đổi mật khẩu thành công.');
    } catch (passwordError) {
      setError(passwordError.message || 'Không thể đổi mật khẩu.');
    }
  };

  const handleEducationOtpRequest = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      await requestEducationVerificationOtp(educationForm);
      setEducationOtpSent(true);
      setSuccess('Đã gửi OTP về email trường. Vui lòng kiểm tra hộp thư.');
    } catch (requestError) {
      setError(requestError.message || 'Không thể gửi OTP xác minh.');
    }
  };

  const handleEducationEmailChange = (email) => {
    const matchedInstitution = findInstitutionByEmail(email);
    setEducationForm((form) => ({
      ...form,
      email,
      ...(matchedInstitution ? { schoolName: matchedInstitution.name } : {}),
    }));
  };

  const handleEducationOtpVerify = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const updatedUser = await verifyEducationVerificationOtp({
        email: educationForm.email,
        otp: educationForm.otp,
      });
      onUserUpdate?.(updatedUser);
      setEducationOtpSent(false);
      setEducationForm((form) => ({ ...form, otp: '' }));
      setSuccess('Xác minh ưu đãi giáo dục thành công.');
    } catch (verifyError) {
      setError(verifyError.message || 'Không thể xác minh OTP.');
    }
  };

  const handleBusinessSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const updatedUser = await submitBusinessVerification(businessForm);
      onUserUpdate?.(updatedUser);
      setSuccess('Đã gửi hồ sơ doanh nghiệp. Vui lòng chờ admin duyệt.');
    } catch (businessError) {
      setError(businessError.message || 'Không thể gửi hồ sơ doanh nghiệp.');
    }
  };

  const handleBusinessDocumentChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError('');
    setSuccess('');
    try {
      const dataUrl = await readBusinessDocumentAsDataUrl(file);
      if (!dataUrl) return;
      setBusinessForm((form) => ({ ...form, registrationDocument: dataUrl }));
      setSuccess('Đã chọn Giấy chứng nhận đăng ký doanh nghiệp.');
    } catch (documentError) {
      setError(documentError.message || 'Không thể đọc hồ sơ doanh nghiệp.');
    }
  };

  const handleAvatarFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError('');
    setSuccess('');

    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      if (!dataUrl) return;
      setProfileForm((form) => ({ ...form, avatar: dataUrl }));
      setSuccess('Đã chọn ảnh avatar.');
    } catch (avatarError) {
      setError(avatarError.message || 'Không thể chọn ảnh avatar.');
    }
  };

  const handleAddressSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      if (editingAddressId) {
        await updateCustomerAddress(editingAddressId, addressForm);
        setSuccess('Đã cập nhật địa chỉ.');
      } else {
        await createCustomerAddress(addressForm);
        setSuccess('Đã thêm địa chỉ mới.');
      }
      setEditingAddressId('');
      setAddressForm(emptyAddressForm);
      await reloadAddresses();
    } catch (addressError) {
      setError(addressError.message || 'Không thể lưu địa chỉ.');
    }
  };

  const handleEditAddress = (address) => {
    setEditingAddressId(address.id);
    setAddressForm({
      fullName: address.fullName || '',
      phone: address.phone || '',
      province: address.province || '',
      district: address.district || '',
      ward: address.ward || '',
      addressLine: address.addressLine || '',
      isDefault: Boolean(address.isDefault),
    });
  };

  const handleDeleteAddress = async (addressId) => {
    setError('');
    setSuccess('');
    try {
      await deleteCustomerAddress(addressId);
      await reloadAddresses();
      setSuccess('Đã xóa địa chỉ.');
    } catch (deleteError) {
      setError(deleteError.message || 'Không thể xóa địa chỉ.');
    }
  };

  const handleSetDefaultAddress = async (addressId) => {
    setError('');
    setSuccess('');
    try {
      await setDefaultCustomerAddress(addressId);
      await reloadAddresses();
      setSuccess('Đã đặt địa chỉ mặc định.');
    } catch (defaultError) {
      setError(defaultError.message || 'Không thể đặt địa chỉ mặc định.');
    }
  };

  const handleReadNotification = async (notificationId) => {
    try {
      const updated = await markCustomerNotificationRead(notificationId);
      setNotifications((items) => items.map((item) => (item.id === notificationId ? updated : item)));
    } catch {
      // Notification read state is a small convenience; keep UI usable if it fails.
    }
  };

  const handleVoucherClaim = async (event) => {
    event.preventDefault();
    const code = voucherCode.trim().toUpperCase();
    if (!code) {
      setError('Vui lòng nhập mã giảm giá.');
      setSuccess('');
      return;
    }

    setVoucherClaiming(true);
    setError('');
    setSuccess('');
    try {
      const result = await claimCustomerVoucher(code);
      if (result.voucher) {
        setVouchers((items) => [
          result.voucher,
          ...items.filter((item) => item.code !== result.voucher.code),
        ]);
      }
      setVoucherCode('');
      setSuccess(result.message || `Đã thêm mã ${code} vào kho voucher.`);
    } catch (claimError) {
      setError(claimError.message || 'Không thể thêm mã giảm giá vào kho voucher.');
    } finally {
      setVoucherClaiming(false);
    }
  };

  const handleCreateReturn = async (payload) => {
    setError('');
    setSuccess('');
    setReturnSubmitting(true);
    try {
      const created = await createCustomerReturnRequest(payload);
      setReturns((items) => [created, ...items.filter((item) => item.id !== created.id)]);
      setSuccess(`Đã gửi yêu cầu đổi trả #${created.returnCode}. Admin sẽ tiếp nhận và phản hồi trên tài khoản Smember.`);
      return created;
    } catch (returnError) {
      setError(returnError.message || 'Không thể gửi yêu cầu đổi trả.');
      throw returnError;
    } finally {
      setReturnSubmitting(false);
    }
  };

  const navigateToAccountTab = (tab) => {
    if (!accountTabIds.has(tab)) return;

    setActiveTab(tab);
    const nextPath = `/smember?tab=${encodeURIComponent(tab)}`;
    const currentPath = `${window.location.pathname}${window.location.search}`;

    if (currentPath === nextPath) return;

    if (typeof onNavigate === 'function') {
      onNavigate(nextPath);
      return;
    }

    window.history.pushState(null, '', nextPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMenuItemClick = (item) => {
    if (item.path) {
      if (typeof onNavigate === 'function') {
        onNavigate(item.path);
      } else {
        window.location.assign(item.path);
      }
      return;
    }

    navigateToAccountTab(item.id);
  };

  return (
    <section className="smember-account-page">
      <div className="container smember-account-container">
        <div className="smember-profile-hero">
          <div className="smember-profile-main">
            <div className="smember-avatar">
              <img src={avatar} alt="" />
            </div>
            <div>
              <h1>{displayName}</h1>
              <p>{maskPhone(currentUser.phone)}</p>
              <div className="smember-badges">
                <span>{stats.memberRank}</span>
                <span>{currentUser.customerType === 'student' ? 'S-Student' : currentUser.customerType === 'teacher' ? 'S-Teacher' : currentUser.customerType === 'business' ? 'S-Business' : 'Smember'}</span>
              </div>
              <small>⟳ Cập nhật lại sau 01/2027</small>
            </div>
          </div>

          <div className="smember-profile-stat">
            <span><SmemberIcon name="receipt" /></span>
            <div>
              <strong>{stats.totalOrders}</strong>
              <p>Tổng số đơn hàng đã mua</p>
            </div>
          </div>

          <div className="smember-profile-stat money">
            <span><SmemberIcon name="voucher" /></span>
            <div>
              <strong>{formatPrice(stats.totalSpent)}</strong>
              <p>Tổng tiền tích lũy · Từ 01/01/2025</p>
              <small>
                {stats.nextRankLabel
                  ? `Cần chi tiêu thêm ${formatPrice(stats.remainingToNextRank)} để lên hạng ${stats.nextRankLabel}`
                  : 'Bạn đang ở hạng thành viên cao nhất'}
              </small>
            </div>
          </div>

        </div>

        <div className="smember-top-tabs">
          {[
            ['rank', 'diamond', 'Hạng thành viên'],
            ['vouchers', 'voucher', 'Mã giảm giá'],
            ['orders', 'receipt', 'Lịch sử mua hàng'],
            ['addresses', 'store', 'Sổ địa chỉ'],
            ['education', 'cap', 'S-Student & S-Teacher'],
            ['profile', 'link', 'Liên kết tài khoản'],
          ].map(([id, icon, label]) => (
            <button type="button" key={id} className={activeTab === id ? 'active' : ''} onClick={() => navigateToAccountTab(id)}>
              <span><SmemberIcon name={icon} /></span>
              {label}
            </button>
          ))}
        </div>

        <div className="smember-account-layout">
          <aside className="smember-side-menu">
            {menuItems.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`${activeTab === item.id ? 'active' : ''} ${item.separator ? 'with-separator' : ''}`}
                onClick={() => handleMenuItemClick(item)}
              >
                <span><SmemberIcon name={item.icon} /></span>
                {item.label}
              </button>
            ))}
            <button type="button" className="logout" onClick={onLogout}>
              <span><SmemberIcon name="logout" /></span>
              Đăng xuất
            </button>
          </aside>

          <div className="smember-content">
            {error && <div className="smember-alert error">{error}</div>}
            {success && <div className="smember-alert success">{success}</div>}
            {loading && <div className="smember-alert">Đang tải dữ liệu tài khoản...</div>}

            {activeTab === 'overview' && (
              <>
                <div className="smember-info-banners">
                  <div>
                    <span><SmemberIcon name="cap" /></span>
                    Đăng ký Tân sinh viên để nhận mã giảm giá đến 10%.
                    <button type="button" onClick={() => navigateToAccountTab('education')}>Đăng ký ngay</button>
                    <em>×</em>
                  </div>
                  <div>
                    <span><SmemberIcon name="suitcase" /></span>
                    Đăng ký S-Business để nhận ưu đãi đặc quyền!
                    <button type="button" onClick={() => navigateToAccountTab('business')}>Đăng ký ngay</button>
                    <em>×</em>
                  </div>
                  <div>
                    <span><SmemberIcon name="store" /></span>
                    Thêm địa chỉ để đặt đơn hàng nhanh hơn.
                    <button type="button" onClick={() => navigateToAccountTab('addresses')}>Thêm địa chỉ</button>
                    <em>×</em>
                  </div>
                </div>

                <div className="smember-overview-grid">
                  <div className="smember-panel">
                    <div className="smember-panel-head">
                      <h2>Đơn hàng gần đây</h2>
                      <button type="button" onClick={() => navigateToAccountTab('orders')}>Xem tất cả ›</button>
                    </div>
                    {stats.recentOrders.length ? (
                      stats.recentOrders.map((order) => (
                        <OrderCard
                          order={order}
                          returns={returns}
                          onCreateReturn={handleCreateReturn}
                          returnSubmitting={returnSubmitting}
                          key={order.id || order.orderCode}
                        />
                      ))
                    ) : (
                      <p className="smember-empty">Bạn chưa có đơn hàng nào.</p>
                    )}
                  </div>

                  <div className="smember-panel smember-benefit-panel">
                    <div className="smember-panel-head">
                      <h2>Ưu đãi của bạn</h2>
                      {vouchers.length > 0 && (
                        <button type="button" onClick={() => navigateToAccountTab('vouchers')}>Xem tất cả ›</button>
                      )}
                    </div>
                    {vouchers.length ? (
                      <div className="smember-benefit-vouchers">
                        {vouchers.slice(0, 2).map((voucher) => (
                          <VoucherCard voucher={voucher} compact key={voucher.id || voucher.code} />
                        ))}
                      </div>
                    ) : (
                      <div className="smember-benefit-empty">
                        <img src="https://cellphones.com.vn/media/wysiwyg/ant-smile.png" alt="" />
                        <p>Bạn chưa có ưu đãi nào.</p>
                        <button type="button" onClick={() => navigateToAccountTab('vouchers')}>Xem sản phẩm</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="smember-panel smember-home-wishlist">
                  <div className="smember-panel-head">
                    <h2>Sản phẩm yêu thích</h2>
                    <button type="button" onClick={() => navigateToAccountTab('wishlist')}>Xem tất cả ›</button>
                  </div>
                  {wishlist.length ? (
                    <div className="smember-card-grid compact">
                      {wishlist.slice(0, 4).map((item) => (
                        <a className="smember-product-mini" href={item.productSlug ? `/${item.productSlug}.html` : item.productUrl} key={item.id}>
                          <img src={item.productImage || item.snapshot?.image || item.snapshot?.primaryImage} alt="" />
                          <strong>{item.productName || item.snapshot?.name}</strong>
                          <span>{formatPrice(item.price || item.snapshot?.currentPrice || 0)}</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="smember-empty">Bạn chưa có sản phẩm yêu thích.</p>
                  )}
                </div>
              </>
            )}

            {activeTab === 'orders' && (
              <div className="smember-panel">
                <div className="smember-panel-head">
                  <h2>Lịch sử mua hàng</h2>
                  <span>{orders.length} đơn hàng</span>
                </div>
                {orders.length ? orders.map((order) => (
                  <OrderCard
                    order={order}
                    returns={returns}
                    onCreateReturn={handleCreateReturn}
                    returnSubmitting={returnSubmitting}
                    key={order.id || order.orderCode}
                  />
                )) : <p className="smember-empty">Chưa có đơn hàng trong tài khoản này.</p>}
              </div>
            )}

            {activeTab === 'rank' && (
              <div className="smember-panel smember-rank-panel">
                <h2>Hạng thành viên và ưu đãi</h2>
                <div className="smember-rank-card">
                  <div>
                    <span className="smember-rank-badge">{stats.memberRank}</span>
                    <strong>{displayName}</strong>
                    <p>Tổng tích lũy: {formatPrice(stats.totalSpent)} · {stats.points.toLocaleString('vi-VN')} điểm</p>
                  </div>
                  <div className="smember-rank-progress">
                    <span style={{ width: `${Math.min(100, Math.round((stats.totalSpent / 3000000) * 100))}%` }} />
                  </div>
                  <small>Mua sắm thêm để mở khóa các ưu đãi S-MEM/S-VIP.</small>
                </div>
              </div>
            )}

            {activeTab === 'vouchers' && (
              <div className="smember-panel">
                <div className="smember-panel-head">
                  <div>
                    <h2>Kho mã giảm giá</h2>
                    <small>Chỉ những mã bạn đã nhập và nhận thành công mới xuất hiện tại đây.</small>
                  </div>
                  <span>{vouchers.length} mã</span>
                </div>

                <form className="smember-voucher-claim" onSubmit={handleVoucherClaim}>
                  <div>
                    <strong>Nhập mã ưu đãi</strong>
                    <span>Nhập mã được CellphoneS cung cấp để lưu vào tài khoản.</span>
                  </div>
                  <div className="smember-voucher-claim-control">
                    <input
                      type="text"
                      value={voucherCode}
                      maxLength="80"
                      autoComplete="off"
                      spellCheck="false"
                      placeholder="Ví dụ: KHUYENMAI10"
                      onChange={(event) => {
                        setVoucherCode(event.target.value.toUpperCase());
                        setError('');
                        setSuccess('');
                      }}
                    />
                    <button type="submit" disabled={voucherClaiming || !voucherCode.trim()}>
                      {voucherClaiming ? 'Đang kiểm tra...' : 'Thêm vào kho'}
                    </button>
                  </div>
                </form>

                <div className="smember-list-stack">
                  {vouchers.length ? vouchers.map((voucher) => (
                    <VoucherCard voucher={voucher} key={voucher.walletId || voucher.id || voucher.code} />
                  )) : (
                    <p className="smember-empty">Kho voucher đang trống. Hãy nhập mã ưu đãi để thêm voucher.</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tradein' && (
              <div className="smember-panel">
                <h2>Lịch sử thu cũ</h2>
                <p className="smember-empty">Chưa có giao dịch thu cũ trong tài khoản này.</p>
              </div>
            )}

            {activeTab === 'business' && (
              <div className="smember-panel smember-business-panel">
                <div className="smember-business-heading">
                  <div>
                    <span><SmemberIcon name="suitcase" /></span>
                    <div>
                      <h2>Đăng ký S-Business</h2>
                      <p>Dành cho doanh nghiệp mua số lượng lớn, xuất hóa đơn và theo dõi đơn B2B.</p>
                    </div>
                  </div>
                  <em>
                    {currentUser.businessVerification?.status === 'verified'
                      ? 'Đã duyệt'
                      : currentUser.businessVerification?.status === 'pending'
                        ? 'Chờ duyệt'
                        : currentUser.businessVerification?.status === 'rejected'
                          ? 'Bị từ chối'
                          : 'Chưa đăng ký'}
                  </em>
                </div>

                {currentUser.businessVerification?.status === 'verified' ? (
                  <div className="smember-business-verified">
                    <div className="smember-business-check">✓</div>
                    <div>
                      <strong>{currentUser.businessVerification.companyName}</strong>
                      <span>Mã số thuế: {currentUser.businessVerification.taxCode}</span>
                      <span>{currentUser.businessVerification.companyAddress}</span>
                      <span>{currentUser.businessVerification.representativeName} · {currentUser.businessVerification.position}</span>
                      <span>{currentUser.businessVerification.email} · {currentUser.businessVerification.phone}</span>
                      <small>Admin duyệt ngày {formatDate(currentUser.businessVerification.reviewedAt)}</small>
                    </div>
                  </div>
                ) : currentUser.businessVerification?.status === 'pending' ? (
                  <div className="smember-business-review-state pending">
                    <div className="smember-business-state-icon">⌛</div>
                    <div>
                      <strong>Hồ sơ đang chờ admin duyệt</strong>
                      <span>{currentUser.businessVerification.companyName}</span>
                      <span>Mã số thuế: {currentUser.businessVerification.taxCode}</span>
                      <small>Đã gửi ngày {formatDate(currentUser.businessVerification.submittedAt)}</small>
                    </div>
                  </div>
                ) : (
                  <>
                    {currentUser.businessVerification?.status === 'rejected' && (
                      <div className="smember-business-review-state rejected">
                        <div className="smember-business-state-icon">!</div>
                        <div>
                          <strong>Hồ sơ chưa được duyệt</strong>
                          <span>{currentUser.businessVerification.reviewNote || 'Vui lòng kiểm tra và gửi lại thông tin doanh nghiệp.'}</span>
                          <small>Admin xử lý ngày {formatDate(currentUser.businessVerification.reviewedAt)}</small>
                        </div>
                      </div>
                    )}

                    <form className="smember-business-form" onSubmit={handleBusinessSubmit}>
                      <div className="smember-form-grid">
                        <label className="full">Tên doanh nghiệp
                          <input
                            value={businessForm.companyName}
                            placeholder="Nhập tên theo Giấy chứng nhận đăng ký doanh nghiệp"
                            onChange={(event) => setBusinessForm((form) => ({ ...form, companyName: event.target.value }))}
                          />
                        </label>
                        <label>Mã số thuế
                          <input
                            value={businessForm.taxCode}
                            inputMode="numeric"
                            placeholder="Nhập mã số thuế"
                            onChange={(event) => setBusinessForm((form) => ({ ...form, taxCode: event.target.value.replace(/[^\d-]/g, '').slice(0, 14) }))}
                          />
                        </label>
                        <label>Số điện thoại doanh nghiệp
                          <input
                            value={businessForm.phone}
                            inputMode="numeric"
                            placeholder="Nhập số điện thoại"
                            onChange={(event) => setBusinessForm((form) => ({ ...form, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))}
                          />
                        </label>
                        <label className="full">Địa chỉ trụ sở
                          <input
                            value={businessForm.companyAddress}
                            placeholder="Nhập địa chỉ trụ sở doanh nghiệp"
                            onChange={(event) => setBusinessForm((form) => ({ ...form, companyAddress: event.target.value }))}
                          />
                        </label>
                        <label>Người đại diện / người đăng ký
                          <input
                            value={businessForm.representativeName}
                            placeholder="Nhập họ và tên"
                            onChange={(event) => setBusinessForm((form) => ({ ...form, representativeName: event.target.value }))}
                          />
                        </label>
                        <label>Chức vụ
                          <input
                            value={businessForm.position}
                            placeholder="Ví dụ: Giám đốc, Kế toán"
                            onChange={(event) => setBusinessForm((form) => ({ ...form, position: event.target.value }))}
                          />
                        </label>
                        <label className="full">Email doanh nghiệp
                          <input
                            type="email"
                            value={businessForm.email}
                            placeholder="Nhập email doanh nghiệp"
                            onChange={(event) => setBusinessForm((form) => ({ ...form, email: event.target.value }))}
                          />
                        </label>
                        <label className="full smember-business-document">
                          Giấy chứng nhận đăng ký doanh nghiệp
                          <div>
                            {businessForm.registrationDocument ? (
                              <img src={businessForm.registrationDocument} alt="Giấy chứng nhận đăng ký doanh nghiệp" />
                            ) : (
                              <span><SmemberIcon name="document" /></span>
                            )}
                            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleBusinessDocumentChange} />
                            {businessForm.registrationDocument && (
                              <button type="button" onClick={() => setBusinessForm((form) => ({ ...form, registrationDocument: '' }))}>
                                Xóa ảnh
                              </button>
                            )}
                          </div>
                        </label>
                      </div>
                      <div className="smember-business-actions">
                        <button type="submit">Gửi hồ sơ cho admin duyệt</button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            )}

            {activeTab === 'stores' && (
              <div className="smember-panel">
                <h2>Tìm kiếm cửa hàng</h2>
                <p className="smember-note">Bạn có thể tra cứu cửa hàng gần nhất trên hệ thống CellphoneS.</p>
              </div>
            )}

            {activeTab === 'policy' && (
              <div className="smember-panel">
                <h2>Chính sách bảo hành</h2>
                <p className="smember-note">Tra cứu chính sách bảo hành theo sản phẩm, IMEI/Serial và thông tin đơn hàng.</p>
              </div>
            )}

            {activeTab === 'terms' && (
              <div className="smember-panel">
                <h2>Điều khoản sử dụng</h2>
                <p className="smember-note">Thông tin điều khoản sử dụng tài khoản Smember và quyền lợi thành viên.</p>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="smember-panel">
                <h2>Thông tin tài khoản</h2>
                <form className="smember-form-grid" onSubmit={handleProfileSubmit}>
                  <label>Họ và tên<input value={profileForm.fullName} onChange={(e) => setProfileForm((form) => ({ ...form, fullName: e.target.value }))} /></label>
                  <label>Ngày sinh<input type="date" value={profileForm.birthday} onChange={(e) => setProfileForm((form) => ({ ...form, birthday: e.target.value }))} /></label>
                  <label>Giới tính
                    <select value={profileForm.gender} onChange={(e) => setProfileForm((form) => ({ ...form, gender: e.target.value }))}>
                      <option value="">Chưa cập nhật</option>
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                      <option value="other">Khác</option>
                    </select>
                  </label>
                  <label>Email<input value={profileForm.email} onChange={(e) => setProfileForm((form) => ({ ...form, email: e.target.value }))} /></label>
                  <label>Số điện thoại<input value={profileForm.phone} onChange={(e) => setProfileForm((form) => ({ ...form, phone: e.target.value }))} /></label>
                  <label className="smember-avatar-upload">
                    Avatar
                    <div className="smember-avatar-preview">
                      <img src={profileForm.avatar || avatar} alt="Avatar preview" />
                      <div>
                        <input
                          value={profileForm.avatar?.startsWith('data:image/') ? '' : profileForm.avatar}
                          onChange={(e) => setProfileForm((form) => ({ ...form, avatar: e.target.value }))}
                          placeholder="Dán URL ảnh nếu muốn dùng ảnh online"
                        />
                        <input type="file" accept="image/*" onChange={handleAvatarFileChange} />
                        {profileForm.avatar?.startsWith('data:image/') && (
                          <button
                            type="button"
                            className="smember-clear-image-btn"
                            onClick={() => setProfileForm((form) => ({ ...form, avatar: '' }))}
                          >
                            Xóa ảnh đã chọn
                          </button>
                        )}
                      </div>
                    </div>
                  </label>
                  <button type="submit">Lưu thông tin</button>
                </form>

                <h2 className="smember-subtitle">Đổi mật khẩu</h2>
                <form className="smember-form-grid" onSubmit={handlePasswordSubmit}>
                  <label>Mật khẩu hiện tại<input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((form) => ({ ...form, currentPassword: e.target.value }))} /></label>
                  <label>Mật khẩu mới<input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((form) => ({ ...form, newPassword: e.target.value }))} /></label>
                  <button type="submit">Đổi mật khẩu</button>
                </form>
              </div>
            )}

            {activeTab === 'education' && (
              <div className="smember-panel smember-education-panel">
                <h2>Xác minh S-Student/S-Teacher</h2>
                {currentUser.educationVerification?.status === 'verified' ? (
                  <div className="smember-education-verified">
                    <strong>✓ Tài khoản đã được xác minh {currentUser.customerType === 'teacher' ? 'S-Teacher' : 'S-Student'}</strong>
                    <span>{currentUser.educationVerification.schoolName}</span>
                    <span>{currentUser.educationVerification.email}</span>
                    <small>Hiệu lực đến {formatDate(currentUser.educationVerification.expiresAt)}</small>
                  </div>
                ) : (
                  <>
                    <form className="smember-form-grid" onSubmit={educationOtpSent ? handleEducationOtpVerify : handleEducationOtpRequest}>
                      <label>Đối tượng
                        <select
                          value={educationForm.type}
                          disabled={educationOtpSent}
                          onChange={(event) => setEducationForm((form) => ({ ...form, type: event.target.value }))}
                        >
                          <option value="student">Sinh viên</option>
                          <option value="teacher">Giáo viên</option>
                        </select>
                      </label>
                      <label>Tên trường / cơ sở giáo dục
                        <input
                          list="smember-education-institutions"
                          value={educationForm.schoolName}
                          disabled={educationOtpSent}
                          placeholder="Ví dụ: Đại học Văn Lang"
                          onChange={(event) => setEducationForm((form) => ({ ...form, schoolName: event.target.value }))}
                        />
                        <datalist id="smember-education-institutions">
                          {educationSuggestions.map((institution) => (
                            <option
                              key={institution.id}
                              value={institution.name}
                              label={getInstitutionMeta(institution)}
                            />
                          ))}
                        </datalist>
                        <small className={educationNameInstitution ? 'education-institution-hint recognized' : 'education-institution-hint'}>
                          {educationNameInstitution
                            ? `Đã chọn ${educationNameInstitution.name}${getInstitutionMeta(educationNameInstitution) ? ` · ${getInstitutionMeta(educationNameInstitution)}` : ''}.`
                            : educationForm.schoolName.trim()
                              ? 'Chưa có trường này trong danh sách. Bạn vẫn có thể xác minh bằng email trường thật.'
                              : educationDirectoryLoading
                                ? 'Đang tải danh sách trường tại TP.HCM...'
                                : 'Gõ tên, tên viết tắt hoặc chọn một trường trong danh sách gợi ý.'}
                        </small>
                      </label>
                      <label>Email trường
                        <input
                          type="email"
                          value={educationForm.email}
                          disabled={educationOtpSent}
                          placeholder="ten@school.edu.vn hoặc ten@university.vn"
                          onChange={(event) => handleEducationEmailChange(event.target.value)}
                        />
                        <small className={educationEmailInstitution ? 'education-institution-hint recognized' : 'education-institution-hint'}>
                          {educationEmailInstitution
                            ? `Đã nhận diện ${educationEmailInstitution.name} từ tên miền email.`
                            : educationForm.email.includes('@')
                              ? `Chưa nhận diện tên miền ${getEmailDomain(educationForm.email) || 'này'}; hệ thống sẽ kiểm tra khả năng nhận OTP.`
                              : 'Nhập email do trường cấp; tên trường sẽ tự điền nếu tên miền đã được nhận diện.'}
                        </small>
                      </label>
                      {educationOtpSent && (
                        <label>Mã OTP 6 chữ số
                          <input
                            inputMode="numeric"
                            maxLength="6"
                            value={educationForm.otp}
                            placeholder="Nhập OTP từ email trường"
                            onChange={(event) => setEducationForm((form) => ({ ...form, otp: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
                          />
                        </label>
                      )}
                      <button type="submit">{educationOtpSent ? 'Xác nhận OTP' : 'Gửi OTP xác minh'}</button>
                      {educationOtpSent && (
                        <button type="button" className="smember-secondary-btn" onClick={() => setEducationOtpSent(false)}>
                          Nhập lại thông tin
                        </button>
                      )}
                    </form>
                  </>
                )}
              </div>
            )}

            {activeTab === 'addresses' && (
              <div className="smember-panel">
                <div className="smember-panel-head">
                  <h2>Sổ địa chỉ</h2>
                  <span>{addresses.length} địa chỉ</span>
                </div>
                <form className="smember-form-grid" onSubmit={handleAddressSubmit}>
                  <label>Họ tên người nhận<input value={addressForm.fullName} onChange={(e) => setAddressForm((form) => ({ ...form, fullName: e.target.value }))} /></label>
                  <label>Số điện thoại<input value={addressForm.phone} onChange={(e) => setAddressForm((form) => ({ ...form, phone: e.target.value }))} /></label>
                  <label>Tỉnh / Thành phố<input value={addressForm.province} onChange={(e) => setAddressForm((form) => ({ ...form, province: e.target.value }))} /></label>
                  <label>Quận / Huyện<input value={addressForm.district} onChange={(e) => setAddressForm((form) => ({ ...form, district: e.target.value }))} /></label>
                  <label>Phường / Xã<input value={addressForm.ward} onChange={(e) => setAddressForm((form) => ({ ...form, ward: e.target.value }))} /></label>
                  <label>Địa chỉ chi tiết<input value={addressForm.addressLine} onChange={(e) => setAddressForm((form) => ({ ...form, addressLine: e.target.value }))} /></label>
                  <label className="smember-checkbox"><input type="checkbox" checked={addressForm.isDefault} onChange={(e) => setAddressForm((form) => ({ ...form, isDefault: e.target.checked }))} /> Đặt làm mặc định</label>
                  <button type="submit">{editingAddressId ? 'Cập nhật địa chỉ' : 'Thêm địa chỉ'}</button>
                </form>

                <div className="smember-list-stack">
                  {addresses.length ? addresses.map((address) => (
                    <div className="smember-address-row" key={address.id}>
                      <strong>{address.fullName} · {address.phone}</strong>
                      <span>{address.fullAddress || [address.addressLine, address.ward, address.district, address.province].filter(Boolean).join(', ')}</span>
                      <div className="smember-row-actions">
                        {address.isDefault && <em>Mặc định</em>}
                        {!address.isDefault && <button type="button" onClick={() => handleSetDefaultAddress(address.id)}>Đặt mặc định</button>}
                        <button type="button" onClick={() => handleEditAddress(address)}>Sửa</button>
                        <button type="button" onClick={() => handleDeleteAddress(address.id)}>Xóa</button>
                      </div>
                    </div>
                  )) : <p className="smember-empty">Bạn chưa có địa chỉ nào.</p>}
                </div>
              </div>
            )}

            {activeTab === 'wishlist' && (
              <div className="smember-panel">
                <h2>Sản phẩm yêu thích</h2>
                <div className="smember-card-grid">
                  {wishlist.length ? wishlist.map((item) => (
                    <a className="smember-product-mini" href={item.productSlug ? `/${item.productSlug}.html` : item.productUrl} key={item.id}>
                      <img src={item.productImage || item.snapshot?.image || item.snapshot?.primaryImage} alt="" />
                      <strong>{item.productName || item.snapshot?.name}</strong>
                      <span>{formatPrice(item.price || item.snapshot?.currentPrice || 0)}</span>
                    </a>
                  )) : <p className="smember-empty">Bạn chưa có sản phẩm yêu thích.</p>}
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="smember-panel">
                <h2>Thông báo</h2>
                <div className="smember-list-stack">
                  {notifications.length ? notifications.map((notification) => (
                    <button
                      type="button"
                      className={`smember-notification ${notification.readAt ? 'read' : ''}`}
                      key={notification.id}
                      onClick={() => handleReadNotification(notification.id)}
                    >
                      <strong>{notification.title || 'CellphoneS'}</strong>
                      <span>{notification.message}</span>
                      <small>{formatDate(notification.createdAt)}</small>
                    </button>
                  )) : <p className="smember-empty">Chưa có thông báo mới.</p>}
                </div>
              </div>
            )}

            {activeTab === 'warranty' && (
              <div className="smember-panel">
                <h2>Tra cứu bảo hành</h2>
                <div className="smember-list-stack">
                  {warranties.length ? warranties.map((item) => (
                    <div className="smember-address-row" key={item.id}>
                      <strong>{item.productName}</strong>
                      <span>Đơn hàng #{item.orderCode} · Bảo hành đến {formatDate(item.warrantyUntil)}</span>
                    </div>
                  )) : <p className="smember-empty">Chưa có sản phẩm bảo hành trong tài khoản.</p>}
                </div>
              </div>
            )}

            {activeTab === 'invoices' && (
              <div className="smember-panel">
                <h2>Hóa đơn điện tử</h2>
                <div className="smember-list-stack">
                  {invoices.length ? invoices.map((invoice) => (
                    <div className="smember-address-row" key={invoice.orderCode}>
                      <strong>Đơn #{invoice.orderCode} · {formatPrice(invoice.total)}</strong>
                      <span>Trạng thái hóa đơn: {invoice.invoiceStatus}</span>
                      <span>{invoice.companyName || invoice.customerName || 'Khách hàng cá nhân'} · {invoice.invoiceEmail}</span>
                    </div>
                  )) : <p className="smember-empty">Chưa có hóa đơn nào.</p>}
                </div>
              </div>
            )}

            {activeTab === 'support' && (
              <div className="smember-panel">
                <h2>Góp ý - Phản hồi - Hỗ trợ</h2>
                <p className="smember-note">CellphoneS hỗ trợ khách hàng qua tổng đài 1800.2097, email chăm sóc khách hàng và các kênh cửa hàng gần bạn.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
