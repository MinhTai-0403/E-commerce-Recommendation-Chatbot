import { useEffect, useMemo, useState } from 'react';
import {
  createAdminCoupon,
  createAdminInventory,
  createAdminProduct,
  deleteAdminCoupon,
  deleteAdminInventory,
  deleteAdminProduct,
  deleteAdminQuestion,
  deleteAdminReturn,
  deleteAdminReview,
  deleteAdminShipment,
  deleteAdminSupportRequest,
  deleteAdminUser,
  fetchAdminAuditLogs,
  fetchAdminBusinessVerifications,
  fetchAdminCoupons,
  fetchAdminInventory,
  fetchAdminOrders,
  fetchAdminPayments,
  fetchAdminProducts,
  fetchAdminQuestions,
  fetchAdminReturns,
  fetchAdminRevenue,
  fetchAdminReviews,
  fetchAdminShipments,
  fetchAdminSummary,
  fetchAdminSupportRequests,
  fetchAdminUsers,
  updateAdminBusinessVerification,
  updateAdminCoupon,
  updateAdminInventory,
  updateAdminOrder,
  updateAdminPayment,
  updateAdminProduct,
  updateAdminQuestion,
  updateAdminReturn,
  updateAdminReview,
  updateAdminShipment,
  updateAdminSupportRequest,
  updateAdminUser,
} from '../../services/apiAdmin';
import { clearAuthSession } from '../../services/apiAuth';
import {
  buildCouponPayload,
  buildProductInventoryPayload,
  buildProductPayload,
  couponAudienceOptions,
  couponStatusOptions,
  couponToForm,
  couponTypeOptions,
  emptyCouponForm,
  emptyProductForm,
  findInventoryForProduct,
  formatCurrency,
  formatDate,
  inventoryStatusOptions,
  orderStatusOptions,
  paymentStatusOptions,
  productToForm,
  returnStatusOptions,
  shipmentStatusOptions,
  supportStatusOptions,
} from './adminDashboardUtils';
import './AdminDashboard.css';

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
        const maxSize = 640;
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

async function upsertProductInventory(form, savedProduct = {}, editingProduct = null) {
  const payload = buildProductInventoryPayload(form, savedProduct || editingProduct || {});
  const identifier = editingProduct?.inventoryId
    || editingProduct?.inventoryKey
    || payload.key
    || payload.productId
    || payload.productSlug
    || payload.productSku;

  if (!payload.productId && !payload.key) return;

  try {
    await updateAdminInventory(identifier, payload);
  } catch {
    await createAdminInventory(payload);
  }
}

const adminIconPaths = {
  dashboard: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  orders: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6', 'M9 12h6'],
  products: ['M4 7l8-4 8 4-8 4z', 'M4 7v10l8 4 8-4V7', 'M12 11v10'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  business: ['M3 21h18', 'M6 21V7l6-4 6 4v14', 'M9 10h.01', 'M15 10h.01', 'M9 14h.01', 'M15 14h.01'],
  questions: ['M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z', 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7', 'M12 16h.01'],
  reviews: ['M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3L5.8 21 7 14.2 2 9.3l6.9-1z'],
  coupons: ['M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z', 'M12 7v10'],
  inventory: ['M3 9l9-6 9 6-9 6z', 'M5 10v10h14V10', 'M9 20v-6h6v6'],
  payments: ['M3 5h18v14H3z', 'M3 10h18', 'M7 15h3'],
  shipments: ['M3 6h11v11H3z', 'M14 9h4l3 4v4h-7z', 'M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4'],
  returns: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v6h6'],
  support: ['M4 14v-2a8 8 0 0 1 16 0v2', 'M4 14a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2', 'M20 14a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2', 'M17 16v1a4 4 0 0 1-4 4h-1'],
  revenue: ['M4 19V9', 'M10 19V5', 'M16 19v-7', 'M22 19H2'],
  audit: ['M6 3h12v18H6z', 'M9 8h6', 'M9 12h6', 'M9 16h4'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16', 'M21 21l-4.35-4.35'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
};

function AdminIcon({ name, size = 20 }) {
  const paths = adminIconPaths[name] || adminIconPaths.dashboard;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths.map((path, index) => (
        <path key={`${name}-${index}`} d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function StatCard({ label, value, tone, icon = 'dashboard', helper = 'Dữ liệu hiện tại' }) {
  return (
    <div className={`admin-stat-card ${tone || ''}`}>
      <div className="admin-stat-icon"><AdminIcon name={icon} size={23} /></div>
      <div className="admin-stat-copy">
        <span>{label}</span>
        <strong>{value ?? 0}</strong>
      </div>
      <small>{helper}</small>
    </div>
  );
}

export default function AdminDashboard({ currentUser, onBackHome, onLogout, onGoLogin }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [summary, setSummary] = useState(null);
  const [ordersPayload, setOrdersPayload] = useState(null);
  const [productsPayload, setProductsPayload] = useState(null);
  const [usersPayload, setUsersPayload] = useState(null);
  const [businessPayload, setBusinessPayload] = useState(null);
  const [questionsPayload, setQuestionsPayload] = useState(null);
  const [reviewsPayload, setReviewsPayload] = useState(null);
  const [couponsPayload, setCouponsPayload] = useState(null);
  const [inventoryPayload, setInventoryPayload] = useState(null);
  const [paymentsPayload, setPaymentsPayload] = useState(null);
  const [shipmentsPayload, setShipmentsPayload] = useState(null);
  const [returnsPayload, setReturnsPayload] = useState(null);
  const [supportPayload, setSupportPayload] = useState(null);
  const [revenuePayload, setRevenuePayload] = useState(null);
  const [auditLogsPayload, setAuditLogsPayload] = useState(null);

  const [couponSearch, setCouponSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [shipmentSearch, setShipmentSearch] = useState('');
  const [returnSearch, setReturnSearch] = useState('');
  const [returnStatusFilter, setReturnStatusFilter] = useState('all');
  const [returnNotes, setReturnNotes] = useState({});
  const [supportSearch, setSupportSearch] = useState('');
  const [supportStatusFilter, setSupportStatusFilter] = useState('all');
  const [supportDrafts, setSupportDrafts] = useState({});
  const [inventoryDrafts, setInventoryDrafts] = useState({});
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [shipmentDrafts, setShipmentDrafts] = useState({});
  const [productSearch, setProductSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderNotes, setOrderNotes] = useState({});
  const [userSearch, setUserSearch] = useState('');
  const [businessSearch, setBusinessSearch] = useState('');
  const [businessStatusFilter, setBusinessStatusFilter] = useState('pending');
  const [businessReviewNotes, setBusinessReviewNotes] = useState({});
  const [questionSearch, setQuestionSearch] = useState('');
  const [reviewSearch, setReviewSearch] = useState('');
  const [questionAnswers, setQuestionAnswers] = useState({});
  const [reviewReplies, setReviewReplies] = useState({});
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [editingProduct, setEditingProduct] = useState(null);
  const [couponForm, setCouponForm] = useState(emptyCouponForm);
  const [editingCoupon, setEditingCoupon] = useState(null);

  const orders = ordersPayload?.data || [];
  const products = productsPayload?.data || [];
  const users = usersPayload?.data || [];
  const businessVerifications = businessPayload?.data || [];
  const questions = questionsPayload?.data || [];
  const reviews = reviewsPayload?.data || [];
  const coupons = couponsPayload?.data || [];
  const inventoryItems = inventoryPayload?.data || [];
  const payments = paymentsPayload?.data || [];
  const shipments = shipmentsPayload?.data || [];
  const returns = returnsPayload?.data || [];
  const supportRequests = supportPayload?.data || [];
  const auditLogs = auditLogsPayload?.data || [];
  const stats = summary?.cards || {};
  const orderStageStats = [
    { id: 'pending', label: 'Chờ xử lý', value: Number(stats.pendingOrders || 0), tone: 'orange' },
    { id: 'shipping', label: 'Đang giao', value: Number(stats.shippingOrders || 0), tone: 'blue' },
    { id: 'completed', label: 'Hoàn tất', value: Number(stats.completedOrders || 0), tone: 'green' },
    { id: 'cancelled', label: 'Đã hủy', value: Number(stats.cancelledOrders || 0), tone: 'red' },
  ];
  const maxOrderStage = Math.max(1, ...orderStageStats.map((item) => item.value));
  const completionRate = Math.round((Number(stats.completedOrders || 0) / Math.max(1, Number(stats.totalOrders || 0))) * 100);
  const operationalStats = [
    { label: 'Người dùng hoạt động', value: stats.activeUsers, tone: 'green' },
    { label: 'Tài khoản bị khóa', value: stats.blockedUsers, tone: 'orange' },
    { label: 'OTP đang chờ', value: stats.pendingOtps, tone: 'blue' },
    { label: 'Doanh nghiệp chờ duyệt', value: stats.pendingBusinessVerifications, tone: 'orange' },
    { label: 'Đổi trả đang xử lý', value: stats.pendingReturns, tone: 'orange' },
    { label: 'Câu hỏi chờ trả lời', value: stats.pendingQuestions, tone: 'orange' },
  ];
  const businessStatusOptions = businessPayload?.statusOptions || [
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'verified', label: 'Đã duyệt' },
    { value: 'rejected', label: 'Từ chối' },
  ];
  const isAdmin = currentUser?.role === 'admin';
  const adminName = currentUser?.fullName || currentUser?.email || currentUser?.username || 'Quản trị viên';

  const tabs = useMemo(() => [
    { id: 'dashboard', label: 'Tổng quan', group: 'main' },
    { id: 'orders', label: 'Đơn hàng', group: 'commerce' },
    { id: 'products', label: 'Sản phẩm', group: 'commerce' },
    { id: 'users', label: 'Người dùng', group: 'commerce' },
    { id: 'business', label: 'Duyệt doanh nghiệp', group: 'commerce' },
    { id: 'questions', label: 'Hỏi đáp', group: 'operations' },
    { id: 'reviews', label: 'Đánh giá', group: 'operations' },
    { id: 'coupons', label: 'Mã giảm giá', group: 'operations' },
    { id: 'inventory', label: 'Tồn kho', group: 'operations' },
    { id: 'payments', label: 'Thanh toán', group: 'operations' },
    { id: 'shipments', label: 'Vận chuyển', group: 'operations' },
    { id: 'returns', label: 'Đổi trả', group: 'operations' },
    { id: 'support', label: 'Hỗ trợ', group: 'operations' },
    { id: 'revenue', label: 'Doanh thu', group: 'reports' },
    { id: 'audit', label: 'Nhật ký', group: 'reports' },
  ], []);
  const tabGroups = useMemo(() => [
    { id: 'main', label: 'MENU' },
    { id: 'commerce', label: 'THƯƠNG MẠI' },
    { id: 'operations', label: 'VẬN HÀNH' },
    { id: 'reports', label: 'BÁO CÁO' },
  ], []);
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label || 'Tổng quan';

  const handleCommandSearch = (event) => {
    event.preventDefault();
    const keyword = commandSearch.trim().toLocaleLowerCase('vi');
    if (!keyword) return;
    const matchedTab = tabs.find((tab) => (
      tab.label.toLocaleLowerCase('vi').includes(keyword)
      || tab.id.includes(keyword)
    ));
    if (matchedTab) {
      setActiveTab(matchedTab.id);
      setSidebarOpen(false);
      setCommandSearch('');
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadAdminData() {
      if (!isAdmin) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        if (activeTab === 'dashboard') {
          const data = await fetchAdminSummary();
          if (!ignore) setSummary(data);
        }

        if (activeTab === 'orders') {
          const data = await fetchAdminOrders({
            q: orderSearch.trim(),
            status: orderStatusFilter,
            limit: 50,
          });
          if (!ignore) {
            setOrdersPayload(data);
            setOrderNotes(Object.fromEntries(
              (data.data || []).map((item) => [item.id, item.adminNote || ''])
            ));
          }
        }

        if (activeTab === 'products') {
          const [productsData, inventoryData] = await Promise.all([
            fetchAdminProducts({
              q: productSearch.trim(),
              include: 'details',
            }),
            fetchAdminInventory({ limit: 100 }),
          ]);
          if (!ignore) {
            setProductsPayload(productsData);
            setInventoryPayload(inventoryData);
          }
        }

        if (activeTab === 'users') {
          const data = await fetchAdminUsers({
            q: userSearch.trim(),
            limit: 50,
          });
          if (!ignore) setUsersPayload(data);
        }

        if (activeTab === 'business') {
          const data = await fetchAdminBusinessVerifications({
            q: businessSearch.trim(),
            status: businessStatusFilter,
            limit: 50,
          });
          if (!ignore) {
            setBusinessPayload(data);
            setBusinessReviewNotes(Object.fromEntries(
              (data.data || []).map((item) => [item.userId, item.reviewNote || ''])
            ));
          }
        }

        if (activeTab === 'questions') {
          const data = await fetchAdminQuestions({
            q: questionSearch.trim(),
            limit: 50,
          });
          if (!ignore) {
            setQuestionsPayload(data);
            setQuestionAnswers(Object.fromEntries(
              (data.data || []).map((item) => [item.id, item.answer?.content || ''])
            ));
          }
        }

        if (activeTab === 'reviews') {
          const data = await fetchAdminReviews({
            q: reviewSearch.trim(),
            limit: 50,
          });
          if (!ignore) {
            setReviewsPayload(data);
            setReviewReplies(Object.fromEntries(
              (data.data || []).map((item) => [item.id, item.adminReply?.content || ''])
            ));
          }
        }

        if (activeTab === 'coupons') {
          const data = await fetchAdminCoupons({
            q: couponSearch.trim(),
            limit: 50,
          });
          if (!ignore) setCouponsPayload(data);
        }

        if (activeTab === 'inventory') {
          const data = await fetchAdminInventory({
            q: inventorySearch.trim(),
            limit: 50,
          });
          if (!ignore) {
            setInventoryPayload(data);
            setInventoryDrafts(Object.fromEntries(
              (data.data || []).map((item) => [item.id, {
                stock: item.stock ?? 0,
                reservedStock: item.reservedStock ?? 0,
                soldCount: item.soldCount ?? 0,
                status: item.status || 'in_stock',
                note: item.note || '',
              }])
            ));
          }
        }

        if (activeTab === 'payments') {
          const data = await fetchAdminPayments({
            q: paymentSearch.trim(),
            limit: 50,
          });
          if (!ignore) {
            setPaymentsPayload(data);
            setPaymentDrafts(Object.fromEntries(
              (data.data || []).map((item) => [item.id, {
                status: item.status || 'pending',
                bankReference: item.bankReference || '',
                note: item.note || '',
              }])
            ));
          }
        }

        if (activeTab === 'shipments') {
          const data = await fetchAdminShipments({
            q: shipmentSearch.trim(),
            limit: 50,
          });
          if (!ignore) {
            setShipmentsPayload(data);
            setShipmentDrafts(Object.fromEntries(
              (data.data || []).map((item) => [item.id, {
                carrier: item.carrier || '',
                trackingCode: item.trackingCode || '',
                status: item.status || 'pending',
                receiverName: item.receiverName || '',
                receiverPhone: item.receiverPhone || '',
                note: item.note || '',
              }])
            ));
          }
        }

        if (activeTab === 'returns') {
          const data = await fetchAdminReturns({
            q: returnSearch.trim(),
            status: returnStatusFilter,
            limit: 50,
          });
          if (!ignore) {
            setReturnsPayload(data);
            setReturnNotes(Object.fromEntries(
              (data.data || []).map((item) => [item.id, item.adminNote || ''])
            ));
          }
        }

        if (activeTab === 'support') {
          const data = await fetchAdminSupportRequests({
            q: supportSearch.trim(),
            status: supportStatusFilter,
            limit: 50,
          });
          if (!ignore) {
            setSupportPayload(data);
            setSupportDrafts(Object.fromEntries(
              (data.data || []).map((item) => [item.id, {
                status: item.status || 'new',
                adminNote: item.adminNote || '',
                response: '',
              }])
            ));
          }
        }

        if (activeTab === 'revenue') {
          const data = await fetchAdminRevenue();
          if (!ignore) setRevenuePayload(data);
        }

        if (activeTab === 'audit') {
          const data = await fetchAdminAuditLogs({ limit: 50 });
          if (!ignore) setAuditLogsPayload(data);
        }
      } catch (loadError) {
        if (!ignore) setError(loadError.message || 'Không thể tải dữ liệu admin.');
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadAdminData();
    return () => {
      ignore = true;
    };
  }, [
    activeTab,
    isAdmin,
    orderSearch,
    orderStatusFilter,
    productSearch,
    questionSearch,
    refreshTick,
    reviewSearch,
    userSearch,
    businessSearch,
    businessStatusFilter,
    couponSearch,
    inventorySearch,
    paymentSearch,
    shipmentSearch,
    returnSearch,
    returnStatusFilter,
    supportSearch,
    supportStatusFilter,
  ]);

  const refresh = () => setRefreshTick((value) => value + 1);

  const handleUpdateOrderStatus = async (order, status) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminOrder(order.id || order.orderCode, {
        status,
        statusNote: orderNotes[order.id] || '',
      });
      setMessage('Đã cập nhật trạng thái đơn hàng.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể cập nhật đơn hàng.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOrderPayment = async (order, paymentStatus) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminOrder(order.id || order.orderCode, { paymentStatus });
      setMessage('Đã cập nhật thanh toán đơn hàng.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể cập nhật thanh toán.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOrderNote = async (order) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminOrder(order.id || order.orderCode, {
        adminNote: orderNotes[order.id] || '',
      });
      setMessage('Đã lưu ghi chú đơn hàng.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể lưu ghi chú đơn hàng.');
    } finally {
      setLoading(false);
    }
  };

  const updateProductField = (field, value) => {
    setProductForm((previous) => ({ ...previous, [field]: value }));
  };

  const resetProductForm = () => {
    setProductForm(emptyProductForm);
    setEditingProduct(null);
  };

  const handleProductImageFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError('');
    setMessage('');

    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      if (!dataUrl) return;
      updateProductField('primaryImage', dataUrl);
      setMessage('Đã chọn ảnh sản phẩm.');
    } catch (imageError) {
      setError(imageError.message || 'Không thể chọn ảnh sản phẩm.');
    }
  };

  const handleEditProduct = (product) => {
    const inventoryItem = findInventoryForProduct(product, inventoryItems);
    setEditingProduct({
      ...product,
      inventoryId: inventoryItem?.id,
      inventoryKey: inventoryItem?.key,
    });
    setProductForm(productToForm(product, inventoryItem));
    setActiveTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitProduct = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!productForm.name.trim()) {
      setError('Vui lòng nhập tên sản phẩm.');
      return;
    }

    setLoading(true);
    try {
      const payload = buildProductPayload(productForm);
      let savedProduct;
      if (editingProduct) {
        savedProduct = await updateAdminProduct(editingProduct.mongoId || editingProduct.id || editingProduct.slug, payload);
      } else {
        savedProduct = await createAdminProduct(payload);
      }

      await upsertProductInventory(productForm, savedProduct || payload, editingProduct);
      setMessage(editingProduct ? 'Đã cập nhật sản phẩm và tồn kho.' : 'Đã thêm sản phẩm mới và tạo tồn kho.');
      resetProductForm();
      setActiveTab('products');
      refresh();
    } catch (submitError) {
      setError(submitError.message || 'Không thể lưu sản phẩm.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (product) => {
    const label = product.name || product.slug || product.id;
    if (!window.confirm(`Xóa sản phẩm "${label}"?`)) return;

    setLoading(true);
    setError('');
    try {
      await deleteAdminProduct(product.mongoId || product.id || product.slug);
      setMessage('Đã xóa sản phẩm.');
      refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'Không thể xóa sản phẩm.');
    } finally {
      setLoading(false);
    }
  };

  const updateCouponField = (field, value) => {
    setCouponForm((previous) => ({ ...previous, [field]: value }));
  };

  const toggleCouponAudience = (audience) => {
    setCouponForm((previous) => {
      if (audience === 'all') return { ...previous, audiences: ['all'] };
      const current = (previous.audiences || []).filter((item) => item !== 'all');
      const audiences = current.includes(audience)
        ? current.filter((item) => item !== audience)
        : [...current, audience];
      return { ...previous, audiences: audiences.length ? audiences : ['all'] };
    });
  };

  const resetCouponForm = () => {
    setCouponForm(emptyCouponForm);
    setEditingCoupon(null);
  };

  const handleEditCoupon = (coupon) => {
    setEditingCoupon(coupon);
    setCouponForm(couponToForm(coupon));
    setActiveTab('coupons');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitCoupon = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!couponForm.code.trim()) {
      setError('Vui lòng nhập mã giảm giá.');
      return;
    }

    setLoading(true);
    try {
      const payload = buildCouponPayload(couponForm);
      if (editingCoupon) {
        await updateAdminCoupon(editingCoupon.id || editingCoupon.code, payload);
        setMessage('Đã cập nhật mã giảm giá.');
      } else {
        await createAdminCoupon(payload);
        setMessage('Đã thêm mã giảm giá mới.');
      }
      resetCouponForm();
      setActiveTab('coupons');
      refresh();
    } catch (submitError) {
      setError(submitError.message || 'Không thể lưu mã giảm giá.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickUpdateCouponStatus = async (coupon, status) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminCoupon(coupon.id || coupon.code, { status });
      setMessage('Đã cập nhật trạng thái mã giảm giá.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể cập nhật trạng thái mã giảm giá.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCoupon = async (coupon) => {
    if (!window.confirm(`Xóa mã giảm giá "${coupon.code}"?`)) return;

    setLoading(true);
    setError('');

    try {
      await deleteAdminCoupon(coupon.id || coupon.code);
      if (editingCoupon?.id === coupon.id) resetCouponForm();
      setMessage('Đã xóa mã giảm giá.');
      refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'Không thể xóa mã giảm giá.');
    } finally {
      setLoading(false);
    }
  };

  const updateInventoryDraft = (itemId, field, value) => {
    setInventoryDrafts((previous) => ({
      ...previous,
      [itemId]: {
        ...(previous[itemId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveInventory = async (item) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const draft = inventoryDrafts[item.id] || {};
      await updateAdminInventory(item.id || item.key || item.productId, {
        stock: Number(draft.stock || 0),
        reservedStock: Number(draft.reservedStock || 0),
        soldCount: Number(draft.soldCount || 0),
        status: draft.status || 'in_stock',
        note: draft.note || '',
      });
      setMessage('Đã cập nhật tồn kho.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể cập nhật tồn kho.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInventory = async (item) => {
    if (!window.confirm(`Xóa tồn kho "${item.productName || item.key}"?`)) return;

    setLoading(true);
    setError('');

    try {
      await deleteAdminInventory(item.id || item.key || item.productId);
      setMessage('Đã xóa tồn kho.');
      refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'Không thể xóa tồn kho.');
    } finally {
      setLoading(false);
    }
  };

  const updatePaymentDraft = (paymentId, field, value) => {
    setPaymentDrafts((previous) => ({
      ...previous,
      [paymentId]: {
        ...(previous[paymentId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSavePayment = async (payment) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const draft = paymentDrafts[payment.id] || {};
      await updateAdminPayment(payment.id || payment.transactionId || payment.orderCode, {
        status: draft.status || 'pending',
        bankReference: draft.bankReference || '',
        note: draft.note || '',
      });
      setMessage('Đã cập nhật thanh toán và đồng bộ đơn hàng.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể cập nhật thanh toán.');
    } finally {
      setLoading(false);
    }
  };

  const updateShipmentDraft = (shipmentId, field, value) => {
    setShipmentDrafts((previous) => ({
      ...previous,
      [shipmentId]: {
        ...(previous[shipmentId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveShipment = async (shipment) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const draft = shipmentDrafts[shipment.id] || {};
      await updateAdminShipment(shipment.id || shipment.trackingCode || shipment.orderCode, {
        carrier: draft.carrier || '',
        trackingCode: draft.trackingCode || '',
        status: draft.status || 'pending',
        receiverName: draft.receiverName || '',
        receiverPhone: draft.receiverPhone || '',
        note: draft.note || '',
      });
      setMessage('Đã cập nhật vận chuyển và đồng bộ trạng thái đơn.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể cập nhật vận chuyển.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteShipment = async (shipment) => {
    if (!window.confirm(`Xóa vận đơn "${shipment.trackingCode || shipment.orderCode}"?`)) return;

    setLoading(true);
    setError('');

    try {
      await deleteAdminShipment(shipment.id || shipment.trackingCode || shipment.orderCode);
      setMessage('Đã xóa vận đơn.');
      refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'Không thể xóa vận đơn.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (user, patch) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminUser(user.id, patch);
      setMessage('Đã cập nhật người dùng.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể cập nhật người dùng.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Xóa người dùng "${user.fullName || user.email}"?`)) return;

    setLoading(true);
    setError('');

    try {
      await deleteAdminUser(user.id);
      setMessage('Đã xóa người dùng.');
      refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'Không thể xóa người dùng.');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewBusinessVerification = async (item, status) => {
    const reviewNote = (businessReviewNotes[item.userId] || '').trim();
    if (status === 'rejected' && !reviewNote) {
      setError('Vui lòng nhập lý do từ chối hồ sơ doanh nghiệp.');
      return;
    }

    const actionLabel = status === 'verified' ? 'duyệt' : 'từ chối';
    if (!window.confirm(`Xác nhận ${actionLabel} hồ sơ của "${item.companyName}"?`)) return;

    setLoading(true);
    setError('');
    setMessage('');
    try {
      await updateAdminBusinessVerification(item.userId, {
        status,
        reviewNote,
      });
      setMessage(status === 'verified'
        ? 'Đã duyệt hồ sơ S-Business.'
        : 'Đã từ chối hồ sơ S-Business.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể xử lý hồ sơ doanh nghiệp.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerQuestion = async (question) => {
    const answer = (questionAnswers[question.id] || '').trim();
    if (!answer) {
      setError('Vui lòng nhập nội dung trả lời.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminQuestion(question.id, { answer });
      setMessage('Đã trả lời câu hỏi.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể trả lời câu hỏi.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateQuestionStatus = async (question, status) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminQuestion(question.id, { status });
      setMessage('Đã cập nhật câu hỏi.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể cập nhật câu hỏi.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (question) => {
    if (!window.confirm(`Xóa câu hỏi của "${question.authorName || question.email}"?`)) return;

    setLoading(true);
    setError('');

    try {
      await deleteAdminQuestion(question.id);
      setMessage('Đã xóa câu hỏi.');
      refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'Không thể xóa câu hỏi.');
    } finally {
      setLoading(false);
    }
  };

  const handleReplyReview = async (review) => {
    const reply = (reviewReplies[review.id] || '').trim();
    if (!reply) {
      setError('Vui lòng nhập nội dung phản hồi.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminReview(review.id, {
        reply,
        status: review.status === 'pending' ? 'approved' : review.status,
      });
      setMessage('Đã phản hồi đánh giá.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể phản hồi đánh giá.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateReviewStatus = async (review, status) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminReview(review.id, { status });
      setMessage('Đã cập nhật đánh giá.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể cập nhật đánh giá.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReview = async (review) => {
    if (!window.confirm(`Xóa đánh giá của "${review.authorName || review.email}"?`)) return;

    setLoading(true);
    setError('');

    try {
      await deleteAdminReview(review.id);
      setMessage('Đã xóa đánh giá.');
      refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'Không thể xóa đánh giá.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateReturnStatus = async (returnItem, status) => {
    const adminNote = String(returnNotes[returnItem.id] ?? returnItem.adminNote ?? '').trim();
    if (status === 'rejected' && !adminNote) {
      setError('Vui lòng nhập lý do từ chối trước khi xử lý yêu cầu đổi trả.');
      return;
    }

    const statusLabel = returnStatusOptions.find((item) => item.value === status)?.label || status;
    if (!window.confirm(`Chuyển yêu cầu #${returnItem.returnCode} sang "${statusLabel}"?`)) return;

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const updatedReturn = await updateAdminReturn(returnItem.id || returnItem.returnCode, {
        status,
        adminNote,
      });
      setMessage(
        status === 'completed'
          ? `Hoàn trả thành công${Number(updatedReturn?.refundAmount || 0) > 0 ? ` ${formatCurrency(updatedReturn.refundAmount)}` : ''}. Số tiền tích lũy của khách đã được cập nhật.`
          : 'Đã cập nhật yêu cầu đổi trả.'
      );
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể cập nhật yêu cầu đổi trả.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReturnNote = async (returnItem) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminReturn(returnItem.id || returnItem.returnCode, {
        adminNote: String(returnNotes[returnItem.id] ?? returnItem.adminNote ?? '').trim(),
      });
      setMessage('Đã lưu ghi chú đổi trả.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể lưu ghi chú đổi trả.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReturn = async (returnItem) => {
    if (!window.confirm(`Xóa yêu cầu đổi trả "${returnItem.returnCode}"?`)) return;

    setLoading(true);
    setError('');

    try {
      await deleteAdminReturn(returnItem.id || returnItem.returnCode);
      setMessage('Đã xóa yêu cầu đổi trả.');
      refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'Không thể xóa yêu cầu đổi trả.');
    } finally {
      setLoading(false);
    }
  };

  const updateSupportDraft = (requestId, field, value) => {
    setSupportDrafts((previous) => ({
      ...previous,
      [requestId]: {
        ...(previous[requestId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveSupportRequest = async (supportItem) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const draft = supportDrafts[supportItem.id] || {};
      await updateAdminSupportRequest(supportItem.id || supportItem.requestCode, {
        status: draft.status || supportItem.status || 'new',
        adminNote: draft.adminNote || '',
        response: draft.response?.trim() || supportItem.response || '',
      });
      setMessage(draft.response?.trim()
        ? 'Đã gửi phản hồi cho khách hàng.'
        : 'Đã cập nhật yêu cầu hỗ trợ.');
      refresh();
    } catch (updateError) {
      setError(updateError.message || 'Không thể cập nhật yêu cầu hỗ trợ.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSupportRequest = async (supportItem) => {
    if (!window.confirm(`Xóa yêu cầu hỗ trợ "${supportItem.requestCode}"?`)) return;

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await deleteAdminSupportRequest(supportItem.id || supportItem.requestCode);
      setMessage('Đã xóa yêu cầu hỗ trợ.');
      refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'Không thể xóa yêu cầu hỗ trợ.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    if (onLogout) onLogout();
  };

  if (!isAdmin) {
    return (
      <div className="admin-access-page">
        <div className="admin-access-card">
          <img
            src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/Logo/Logo_CPS.png"
            alt="CellphoneS"
          />
          <h1>Trang quản trị</h1>
          <p>
            Bạn cần đăng nhập bằng tài khoản admin để truy cập dashboard,
            sản phẩm và người dùng.
          </p>
          {currentUser && (
            <div className="admin-access-current-user">
              Đang đăng nhập: <strong>{currentUser.fullName || currentUser.email}</strong>
              <span>{currentUser.role === 'admin' ? 'Quản trị viên' : 'Khách hàng'}</span>
            </div>
          )}
          <div className="admin-access-actions">
            <button type="button" onClick={onGoLogin}>
              Đăng nhập admin
            </button>
            <button type="button" className="outline" onClick={onBackHome}>
              Về trang chủ
            </button>
            {currentUser && (
              <button type="button" className="ghost" onClick={handleLogout}>
                Đăng xuất tài khoản hiện tại
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <button
        type="button"
        className={`admin-sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        aria-label="Đóng menu quản trị"
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`admin-sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
        <a className="admin-logo" href="/" onClick={(event) => {
          event.preventDefault();
          onBackHome();
        }}>
          <span className="admin-logo-mark">S</span>
          <span className="admin-logo-copy">
            <strong>cellphoneS</strong>
            <small>Admin workspace</small>
          </span>
        </a>

        <nav className="admin-nav">
          {tabGroups.map((group) => (
            <div className="admin-nav-group" key={group.id}>
              <span className="admin-nav-heading">{group.label}</span>
              {tabs.filter((tab) => tab.group === group.id).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={activeTab === tab.id ? 'active' : ''}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSidebarOpen(false);
                  }}
                >
                  <AdminIcon name={tab.id} />
                  <span>{tab.label}</span>
                  {activeTab === tab.id && <i aria-hidden="true" />}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="admin-session-card">
          <span className="admin-session-avatar">{adminName.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{adminName}</strong>
            <small>{currentUser?.role === 'admin' ? 'Quản trị viên' : 'Tài khoản quản trị'}</small>
          </div>
          <button type="button" onClick={handleLogout} title="Đăng xuất">↗</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topline">
          <button type="button" className="admin-menu-toggle" onClick={() => setSidebarOpen((open) => !open)}>
            <AdminIcon name="menu" />
          </button>
          <form className="admin-command-search" onSubmit={handleCommandSearch}>
            <AdminIcon name="search" />
            <input
              type="search"
              value={commandSearch}
              onChange={(event) => setCommandSearch(event.target.value)}
              placeholder="Tìm trang quản trị..."
              aria-label="Tìm trang quản trị"
            />
            <kbd>Enter</kbd>
          </form>
          <div className="admin-topline-actions">
            <button type="button" className="admin-icon-button" onClick={refresh} disabled={loading} title="Làm mới dữ liệu">
              <AdminIcon name="refresh" />
            </button>
            <button type="button" className="admin-icon-button admin-notification-button" title="Thông báo">
              <AdminIcon name="bell" />
              <i />
            </button>
            <button type="button" className="admin-account-button" onClick={onBackHome} title="Về trang chủ">
              <span>{adminName.charAt(0).toUpperCase()}</span>
              <div>
                <strong>{adminName}</strong>
                <small>Quản trị viên</small>
              </div>
            </button>
          </div>
        </header>

        <div className="admin-page-heading">
          <div>
            <p>CellphoneS / Quản trị</p>
            <h1>{activeTabLabel}</h1>
          </div>
          <button type="button" onClick={refresh} disabled={loading}>
            <AdminIcon name="refresh" size={18} />
            {loading ? 'Đang tải...' : 'Làm mới dữ liệu'}
          </button>
        </div>

        {message && <div className="admin-alert success">{message}</div>}
        {error && <div className="admin-alert error">{error}</div>}

        {activeTab === 'dashboard' && (
          <section className="admin-section admin-dashboard-section">
            <div className="admin-stat-grid admin-primary-stats">
              <StatCard
                label="Doanh thu tháng"
                value={formatCurrency(stats.revenueMonth || 0)}
                tone="green"
                icon="revenue"
                helper={`${stats.revenueMonthOrders || 0} đơn đã ghi nhận`}
              />
              <StatCard
                label="Tổng đơn hàng"
                value={stats.totalOrders}
                tone="blue"
                icon="orders"
                helper={`${stats.pendingOrders || 0} đơn cần xử lý`}
              />
              <StatCard
                label="Khách hàng"
                value={stats.totalUsers}
                icon="users"
                helper={`${stats.activeUsers || 0} tài khoản hoạt động`}
              />
              <StatCard
                label="Sản phẩm"
                value={stats.totalProducts}
                tone="orange"
                icon="products"
                helper="Đang đồng bộ từ MongoDB"
              />
            </div>

            <div className="admin-dashboard-main-grid">
              <div className="admin-card admin-order-chart-card">
                <div className="admin-card-heading">
                  <div>
                    <h2>Tình hình đơn hàng</h2>
                    <p>Phân bổ trạng thái trên toàn hệ thống</p>
                  </div>
                  <button type="button" onClick={() => setActiveTab('orders')}>Xem đơn hàng</button>
                </div>
                <div className="admin-bar-chart" role="img" aria-label="Biểu đồ trạng thái đơn hàng">
                  {orderStageStats.map((item) => (
                    <div className="admin-bar-column" key={item.id}>
                      <strong>{item.value}</strong>
                      <div className="admin-bar-track">
                        <i
                          className={item.tone}
                          style={{ height: `${Math.max(8, Math.round((item.value / maxOrderStage) * 100))}%` }}
                        />
                      </div>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-card admin-target-card">
                <div className="admin-card-heading">
                  <div>
                    <h2>Tỷ lệ hoàn tất</h2>
                    <p>Đơn giao thành công</p>
                  </div>
                </div>
                <div className="admin-progress-ring" style={{ '--progress': `${Math.min(100, completionRate)}%` }}>
                  <div>
                    <strong>{completionRate}%</strong>
                    <span>hoàn thành</span>
                  </div>
                </div>
                <div className="admin-target-footer">
                  <span><strong>{stats.completedOrders || 0}</strong> thành công</span>
                  <span><strong>{stats.cancelledOrders || 0}</strong> đã hủy</span>
                </div>
              </div>
            </div>

            <div className="admin-card admin-operations-card">
              <div className="admin-card-heading">
                <div>
                  <h2>Chỉ số vận hành</h2>
                  <p>Các mục cần quản trị viên theo dõi</p>
                </div>
              </div>
              <div className="admin-operation-grid">
                {operationalStats.map((item) => (
                  <div className={`admin-operation-item ${item.tone}`} key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value || 0}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="admin-card admin-recent-orders-card">
              <div className="admin-card-heading">
                <div>
                  <h2>Đơn hàng gần đây</h2>
                  <p>Cập nhật mới nhất từ khách hàng</p>
                </div>
                <button type="button" onClick={() => setActiveTab('orders')}>Xem tất cả</button>
              </div>
              <div className="admin-recent-order-table">
                <div className="admin-recent-order-head">
                  <span>Mã đơn</span>
                  <span>Khách hàng</span>
                  <span>Tổng tiền</span>
                  <span>Trạng thái</span>
                </div>
                {(summary?.recentOrders || []).map((order) => (
                  <button type="button" className="admin-recent-order-row" key={order.id || order.orderCode} onClick={() => setActiveTab('orders')}>
                    <strong>#{order.orderCode || order.id}</strong>
                    <span>{order.customer?.fullName || order.customerName || order.customer?.phone || 'Khách hàng'}</span>
                    <b>{formatCurrency(order.totals?.total ?? order.total ?? 0)}</b>
                    <em className={`admin-status ${order.status}`}>{order.statusLabel || order.status || 'Chờ xử lý'}</em>
                  </button>
                ))}
                {!summary?.recentOrders?.length && <p className="admin-empty">Chưa có đơn hàng.</p>}
              </div>
            </div>

            <div className="admin-two-columns admin-dashboard-lists">
              <div className="admin-card">
                <div className="admin-card-heading">
                  <div>
                    <h2>Người dùng mới</h2>
                    <p>Tài khoản vừa đăng ký</p>
                  </div>
                  <button type="button" onClick={() => setActiveTab('users')}>Xem tất cả</button>
                </div>
                <div className="admin-list">
                  {(summary?.recentUsers || []).map((user) => (
                    <div className="admin-list-row" key={user.id}>
                      <span className="admin-list-avatar">{(user.fullName || user.email || 'U').charAt(0).toUpperCase()}</span>
                      <div className="admin-list-content">
                        <strong>{user.fullName || user.email}</strong>
                        <span>{user.email} · {user.phone}</span>
                      </div>
                      <em>{user.role}</em>
                    </div>
                  ))}
                  {!summary?.recentUsers?.length && <p className="admin-empty">Chưa có người dùng.</p>}
                </div>
              </div>

              <div className="admin-card">
                <div className="admin-card-heading">
                  <div>
                    <h2>Sản phẩm cập nhật gần đây</h2>
                    <p>Dữ liệu catalog mới nhất</p>
                  </div>
                  <button type="button" onClick={() => setActiveTab('products')}>Xem tất cả</button>
                </div>
                <div className="admin-list">
                  {(summary?.recentProducts || []).map((product) => (
                    <div className="admin-list-row" key={product.id}>
                      <span className="admin-product-thumb">
                        {product.image ? <img src={product.image} alt="" /> : <AdminIcon name="products" />}
                      </span>
                      <div className="admin-list-content">
                        <strong>{product.name}</strong>
                        <span>{product.sku || product.slug} · {formatCurrency(product.price)}</span>
                      </div>
                      <em>{product.brand || '—'}</em>
                    </div>
                  ))}
                  {!summary?.recentProducts?.length && <p className="admin-empty">Chưa có sản phẩm.</p>}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'orders' && (
          <section className="admin-section">
            <div className="admin-card">
              <div className="admin-card-title-row">
                <div>
                  <h2>Quản lý đơn hàng</h2>
                  <p className="admin-card-subtitle">
                    Theo dõi đơn từ lúc khách đặt COD đến xác nhận, chuẩn bị hàng, giao hàng và hoàn tất.
                  </p>
                </div>
                <div className="admin-order-filters">
                  <input
                    value={orderSearch}
                    onChange={(event) => setOrderSearch(event.target.value)}
                    placeholder="Tìm mã đơn, khách, SĐT, sản phẩm..."
                  />
                  <select
                    value={orderStatusFilter}
                    onChange={(event) => setOrderStatusFilter(event.target.value)}
                  >
                    <option value="all">Tất cả trạng thái</option>
                    {orderStatusOptions.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="admin-order-status-strip">
                {orderStatusOptions.map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    className={orderStatusFilter === status.value ? 'active' : ''}
                    onClick={() => setOrderStatusFilter(status.value)}
                  >
                    <span>{status.label}</span>
                    <strong>{ordersPayload?.statusCounts?.[status.value] || 0}</strong>
                  </button>
                ))}
              </div>

              <div className="admin-order-list">
                {orders.map((order) => {
                  const firstItem = order.items?.[0] || {};
                  const totalQuantity = order.totals?.quantity || order.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
                  const address = order.shippingAddress?.fullAddress
                    || [
                      order.shippingAddress?.addressLine,
                      order.shippingAddress?.ward,
                      order.shippingAddress?.district,
                      order.shippingAddress?.province,
                    ].filter(Boolean).join(', ');

                  return (
                    <article className="admin-order-row" key={order.id || order.orderCode}>
                      <div className="admin-order-head">
                        <div>
                          <strong>#{order.orderCode}</strong>
                          <span>{formatDate(order.createdAt)} · {order.shippingChoice?.label || 'COD'}</span>
                        </div>
                        <em className={`admin-status ${order.status}`}>{order.statusLabel || order.status}</em>
                      </div>

                      <div className="admin-order-body">
                        <img src={firstItem.image || firstItem.thumbnail || firstItem.primaryImage} alt="" />
                        <div>
                          <strong>{firstItem.name || 'Đơn hàng CellphoneS'}</strong>
                          <span>{totalQuantity} sản phẩm · {order.customer?.fullName || 'Khách hàng'} · {order.customer?.phone}</span>
                          <span>{address || 'Chưa có địa chỉ nhận hàng'}</span>
                        </div>
                        <div className="admin-order-money">
                          <span>Tổng tiền</span>
                          <strong>{formatCurrency(order.totals?.total || order.totals?.roundedTotal)}</strong>
                          <small>{order.payment?.methodLabel || 'Thanh toán COD'}</small>
                          {order.payment?.transferContent && (
                            <small>Mã CK: {order.payment.transferContent}</small>
                          )}
                          {order.payment?.bankReference && (
                            <small>GD: {order.payment.bankReference}</small>
                          )}
                        </div>
                      </div>

                      <div className="admin-order-controls">
                        <label>
                          Giai đoạn đơn
                          <select
                            value={order.status || 'pending'}
                            onChange={(event) => handleUpdateOrderStatus(order, event.target.value)}
                          >
                            {orderStatusOptions.map((status) => (
                              <option key={status.value} value={status.value}>{status.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Thanh toán
                          <select
                            value={order.paymentStatus || order.payment?.status || 'unpaid'}
                            onChange={(event) => handleUpdateOrderPayment(order, event.target.value)}
                          >
                            {paymentStatusOptions.map((status) => (
                              <option key={status.value} value={status.value}>{status.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-order-note">
                          Ghi chú admin
                          <textarea
                            value={orderNotes[order.id] || ''}
                            onChange={(event) => setOrderNotes((previous) => ({
                              ...previous,
                              [order.id]: event.target.value,
                            }))}
                            rows="2"
                            placeholder="VD: Đã gọi xác nhận, chờ khách phản hồi..."
                          />
                        </label>
                        <button type="button" onClick={() => handleSaveOrderNote(order)}>
                          Lưu ghi chú
                        </button>
                      </div>

                      <div className="admin-order-timeline">
                        {(order.statusHistory?.length ? order.statusHistory : [{ status: order.status, label: order.statusLabel, changedAt: order.updatedAt }]).map((item, index) => (
                          <div className="admin-order-timeline-item" key={`${order.id}-${item.status}-${index}`}>
                            <span />
                            <div>
                              <strong>{item.label || item.status}</strong>
                              <small>{formatDate(item.changedAt)}</small>
                              {item.note && <p>{item.note}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
                {!orders.length && <p className="admin-empty">Chưa có đơn hàng phù hợp.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'products' && (
          <section className="admin-section admin-products-layout">
            <form className="admin-card admin-product-form" onSubmit={handleSubmitProduct}>
              <div className="admin-card-title-row">
                <h2>{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
                {editingProduct && (
                  <button type="button" className="ghost" onClick={resetProductForm}>Hủy sửa</button>
                )}
              </div>

              <label>
                Tên sản phẩm
                <input
                  value={productForm.name}
                  onChange={(event) => updateProductField('name', event.target.value)}
                  placeholder="VD: iPhone 16 Pro Max 256GB"
                />
              </label>

              <div className="admin-form-grid">
                <label>
                  Slug
                  <input
                    value={productForm.slug}
                    onChange={(event) => updateProductField('slug', event.target.value)}
                    placeholder="iphone-16-pro-max-256gb"
                  />
                </label>
                <label>
                  SKU
                  <input
                    value={productForm.sku}
                    onChange={(event) => updateProductField('sku', event.target.value)}
                    placeholder="IP16PM256"
                  />
                </label>
              </div>

              <div className="admin-form-grid">
                <label>
                  Thương hiệu
                  <input
                    value={productForm.brand}
                    onChange={(event) => updateProductField('brand', event.target.value)}
                    placeholder="Apple"
                  />
                </label>
                <label>
                  Danh mục
                  <input
                    value={productForm.categories}
                    onChange={(event) => updateProductField('categories', event.target.value)}
                    placeholder="Điện thoại, Apple"
                  />
                </label>
              </div>

              <div className="admin-form-grid">
                <label>
                  Giá bán
                  <input
                    type="number"
                    value={productForm.currentPrice}
                    onChange={(event) => updateProductField('currentPrice', event.target.value)}
                    placeholder="29990000"
                  />
                </label>
                <label>
                  Giá gốc
                  <input
                    type="number"
                    value={productForm.originalPrice}
                    onChange={(event) => updateProductField('originalPrice', event.target.value)}
                    placeholder="34990000"
                  />
                </label>
              </div>

              <div className="admin-inline-inventory-box">
                <div>
                  <h3>Tồn kho sản phẩm</h3>
                  <p>Nhập số lượng ở đây, không cần qua tab Tồn kho riêng.</p>
                </div>
                <div className="admin-form-grid">
                  <label>
                    Số lượng tồn
                    <input
                      type="number"
                      min="0"
                      value={productForm.stock}
                      onChange={(event) => updateProductField('stock', event.target.value)}
                      placeholder="100"
                    />
                  </label>
                  <label>
                    Đang giữ chỗ
                    <input
                      type="number"
                      min="0"
                      value={productForm.reservedStock}
                      onChange={(event) => updateProductField('reservedStock', event.target.value)}
                      placeholder="0"
                    />
                  </label>
                </div>
                <div className="admin-form-grid">
                  <label>
                    Đã bán
                    <input
                      type="number"
                      min="0"
                      value={productForm.soldCount}
                      onChange={(event) => updateProductField('soldCount', event.target.value)}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Trạng thái tồn kho
                    <select
                      value={productForm.inventoryStatus}
                      onChange={(event) => updateProductField('inventoryStatus', event.target.value)}
                    >
                      {inventoryStatusOptions.map((status) => (
                        <option key={status.value} value={status.value}>{status.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Ghi chú tồn kho
                  <input
                    value={productForm.inventoryNote}
                    onChange={(event) => updateProductField('inventoryNote', event.target.value)}
                    placeholder="VD: Hàng ở kho HCM, còn 100 máy"
                  />
                </label>
              </div>

              <label className="admin-image-upload">
                Ảnh chính
                {productForm.primaryImage && (
                  <img src={productForm.primaryImage} alt="Xem trước ảnh sản phẩm" />
                )}
                <input
                  value={productForm.primaryImage?.startsWith('data:image/') ? '' : productForm.primaryImage}
                  onChange={(event) => updateProductField('primaryImage', event.target.value)}
                  placeholder="Dán URL ảnh nếu muốn dùng ảnh online"
                />
                <input type="file" accept="image/*" onChange={handleProductImageFileChange} />
                {productForm.primaryImage?.startsWith('data:image/') && (
                  <button
                    type="button"
                    className="admin-clear-image-btn"
                    onClick={() => updateProductField('primaryImage', '')}
                  >
                    Xóa ảnh đã chọn
                  </button>
                )}
              </label>

              <label>
                Mô tả
                <textarea
                  value={productForm.description}
                  onChange={(event) => updateProductField('description', event.target.value)}
                  rows="5"
                  placeholder="Mô tả ngắn, thông tin nổi bật..."
                />
              </label>

              <button type="submit" className="admin-primary-btn" disabled={loading}>
                {editingProduct ? 'Lưu thay đổi' : 'Thêm sản phẩm'}
              </button>
            </form>

            <div className="admin-card admin-table-card">
              <div className="admin-card-title-row">
                <h2>Danh sách sản phẩm</h2>
                <div className="admin-search">
                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Tìm sản phẩm..."
                  />
                </div>
              </div>

              <div className="admin-table">
                {products.map((product) => {
                  const inventoryItem = findInventoryForProduct(product, inventoryItems);
                  return (
                    <div className="admin-product-row" key={product.id}>
                      <img src={product.thumbnail || product.primaryImage || product.image} alt="" />
                      <div>
                        <strong>{product.name}</strong>
                        <span>{product.sku || product.slug} · {product.brand || '—'}</span>
                        <span>
                          Tồn kho: {inventoryItem ? `${inventoryItem.availableStock}/${inventoryItem.stock}` : (product.stock ?? 'Chưa tạo')}
                          {inventoryItem?.status ? ` · ${inventoryItem.status}` : ''}
                        </span>
                        <em>{formatCurrency(product.currentPrice)}</em>
                      </div>
                      <div className="admin-row-actions">
                        <button type="button" onClick={() => handleEditProduct(product)}>Sửa</button>
                        <button type="button" className="danger" onClick={() => handleDeleteProduct(product)}>Xóa</button>
                      </div>
                    </div>
                  );
                })}
                {!products.length && <p className="admin-empty">Không có sản phẩm phù hợp.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'coupons' && (
          <section className="admin-section admin-coupons-layout">
            <form className="admin-card admin-product-form" onSubmit={handleSubmitCoupon}>
              <div className="admin-card-title-row">
                <div>
                  <h2>{editingCoupon ? 'Sửa mã giảm giá' : 'Thêm mã giảm giá'}</h2>
                  <p className="admin-card-subtitle">
                    Tạo mã voucher dùng cho checkout và trang Smember.
                  </p>
                </div>
                {editingCoupon && (
                  <button type="button" className="ghost" onClick={resetCouponForm}>Hủy sửa</button>
                )}
              </div>

              <div className="admin-form-grid">
                <label>
                  Mã giảm giá
                  <input
                    value={couponForm.code}
                    onChange={(event) => updateCouponField('code', event.target.value.toUpperCase())}
                    placeholder="VD: SMEMBER50"
                  />
                </label>
                <label>
                  Trạng thái
                  <select
                    value={couponForm.status}
                    onChange={(event) => updateCouponField('status', event.target.value)}
                  >
                    {couponStatusOptions.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Tên ưu đãi
                <input
                  value={couponForm.name}
                  onChange={(event) => updateCouponField('name', event.target.value)}
                  placeholder="VD: Giảm 50K cho thành viên mới"
                />
              </label>

              <label>
                Mô tả
                <textarea
                  value={couponForm.description}
                  onChange={(event) => updateCouponField('description', event.target.value)}
                  rows="3"
                  placeholder="Mô tả điều kiện áp dụng mã..."
                />
              </label>

              <fieldset className="admin-coupon-audience-fieldset">
                <legend>Đối tượng được sử dụng</legend>
                <div className="admin-coupon-audience-grid">
                  {couponAudienceOptions.map((option) => (
                    <label
                      className={`admin-coupon-audience-option ${couponForm.audiences.includes(option.value) ? 'selected' : ''}`}
                      key={option.value}
                    >
                      <input
                        type="checkbox"
                        checked={couponForm.audiences.includes(option.value)}
                        onChange={() => toggleCouponAudience(option.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.hint}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="admin-coupon-switch-row">
                <input
                  type="checkbox"
                  checked={couponForm.allowWithEducationOffer}
                  onChange={(event) => updateCouponField('allowWithEducationOffer', event.target.checked)}
                />
                <span>
                  <strong>Cho phép cộng với ưu đãi giáo dục</strong>
                  <small>Tắt lựa chọn này nếu mã không được dùng cùng giảm giá S-Student/S-Teacher.</small>
                </span>
              </label>

              <div className="admin-form-grid">
                <label>
                  Loại giảm
                  <select
                    value={couponForm.type}
                    onChange={(event) => updateCouponField('type', event.target.value)}
                  >
                    {couponTypeOptions.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Giá trị
                  <input
                    type="number"
                    min="0"
                    value={couponForm.value}
                    onChange={(event) => updateCouponField('value', event.target.value)}
                    placeholder={couponForm.type === 'percent' ? 'VD: 10' : 'VD: 50000'}
                  />
                </label>
              </div>

              <div className="admin-form-grid">
                <label>
                  Giảm tối đa
                  <input
                    type="number"
                    min="0"
                    value={couponForm.maxDiscount}
                    onChange={(event) => updateCouponField('maxDiscount', event.target.value)}
                    placeholder="VD: 300000"
                  />
                </label>
                <label>
                  Đơn tối thiểu
                  <input
                    type="number"
                    min="0"
                    value={couponForm.minSubtotal}
                    onChange={(event) => updateCouponField('minSubtotal', event.target.value)}
                    placeholder="VD: 1000000"
                  />
                </label>
              </div>

              <div className="admin-form-grid">
                <label>
                  Tổng lượt dùng
                  <input
                    type="number"
                    min="0"
                    value={couponForm.usageLimit}
                    onChange={(event) => updateCouponField('usageLimit', event.target.value)}
                    placeholder="Để trống nếu không giới hạn"
                  />
                </label>
                <label>
                  Lượt/user
                  <input
                    type="number"
                    min="0"
                    value={couponForm.userLimit}
                    onChange={(event) => updateCouponField('userLimit', event.target.value)}
                    placeholder="VD: 1"
                  />
                </label>
              </div>

              <div className="admin-form-grid">
                <label>
                  Bắt đầu
                  <input
                    type="datetime-local"
                    value={couponForm.startsAt}
                    onChange={(event) => updateCouponField('startsAt', event.target.value)}
                  />
                </label>
                <label>
                  Hết hạn
                  <input
                    type="datetime-local"
                    value={couponForm.expiresAt}
                    onChange={(event) => updateCouponField('expiresAt', event.target.value)}
                  />
                </label>
              </div>

              <button type="submit" className="admin-primary-btn" disabled={loading}>
                {editingCoupon ? 'Lưu thay đổi mã' : 'Thêm mã giảm giá'}
              </button>
            </form>

            <div className="admin-card admin-table-card">
              <div className="admin-card-title-row">
                <div>
                  <h2>Danh sách mã giảm giá</h2>
                  <p className="admin-card-subtitle">
                    Bấm Sửa để chỉnh, Bật/Tắt để đổi trạng thái, Xóa để gỡ mã.
                  </p>
                </div>
                <div className="admin-search">
                  <input
                    value={couponSearch}
                    onChange={(event) => setCouponSearch(event.target.value)}
                    placeholder="Tìm mã, tên ưu đãi..."
                  />
                </div>
              </div>

              <div className="admin-table">
                {coupons.map((coupon) => (
                  <div className="admin-list-row admin-coupon-row" key={coupon.id || coupon.code}>
                    <div>
                      <strong>{coupon.code}</strong>
                      <span>{coupon.name || coupon.description || 'Mã giảm giá'}</span>
                      <small>
                        Loại: {coupon.type} · Giá trị: {coupon.type === 'percent' ? `${coupon.value}%` : formatCurrency(coupon.value)}
                        {coupon.maxDiscount ? ` · Tối đa ${formatCurrency(coupon.maxDiscount)}` : ''}
                      </small>
                      <small>
                        Đơn tối thiểu: {formatCurrency(coupon.minSubtotal || 0)} · Đã dùng: {coupon.usedCount || 0}
                        {coupon.usageLimit ? `/${coupon.usageLimit}` : ''} · HSD: {formatDate(coupon.expiresAt)}
                      </small>
                      <div className="admin-coupon-audience-tags">
                        {(coupon.audiences || ['all']).map((audience) => {
                          const option = couponAudienceOptions.find((item) => item.value === audience);
                          return <span key={audience}>{option?.label || audience}</span>;
                        })}
                        {coupon.allowWithEducationOffer === false && <span>Không cộng ưu đãi giáo dục</span>}
                      </div>
                    </div>
                    <div className="admin-coupon-actions">
                      <em className={`admin-status ${coupon.status}`}>{coupon.status}</em>
                      <div className="admin-row-actions">
                        <button type="button" onClick={() => handleEditCoupon(coupon)}>Sửa</button>
                        <button
                          type="button"
                          onClick={() => handleQuickUpdateCouponStatus(
                            coupon,
                            coupon.status === 'active' ? 'inactive' : 'active'
                          )}
                        >
                          {coupon.status === 'active' ? 'Tắt' : 'Bật'}
                        </button>
                        <button type="button" className="danger" onClick={() => handleDeleteCoupon(coupon)}>
                          Xóa
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!coupons.length && <p className="admin-empty">Chưa có mã giảm giá.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'inventory' && (
          <section className="admin-section">
            <div className="admin-card">
              <div className="admin-card-title-row">
                <div>
                  <h2>Quản lý tồn kho</h2>
                  <p className="admin-card-subtitle">Sửa số tồn, số giữ chỗ, số đã bán và trạng thái bán hàng.</p>
                </div>
                <div className="admin-search">
                  <input
                    value={inventorySearch}
                    onChange={(event) => setInventorySearch(event.target.value)}
                    placeholder="Tìm sản phẩm, SKU, key tồn kho..."
                  />
                </div>
              </div>

              <div className="admin-order-list">
                {inventoryItems.map((item) => {
                  const draft = inventoryDrafts[item.id] || {};
                  return (
                    <article className="admin-order-row" key={item.id}>
                      <div className="admin-order-head">
                        <div>
                          <strong>{item.productName || item.productSlug || item.productSku || 'Sản phẩm'}</strong>
                          <span>{item.key}</span>
                        </div>
                        <em className={`admin-status ${draft.status || item.status}`}>{draft.status || item.status}</em>
                      </div>

                      <div className="admin-order-controls admin-compact-controls">
                        <label>
                          Tồn kho
                          <input
                            type="number"
                            min="0"
                            value={draft.stock ?? 0}
                            onChange={(event) => updateInventoryDraft(item.id, 'stock', event.target.value)}
                          />
                        </label>
                        <label>
                          Giữ chỗ
                          <input
                            type="number"
                            min="0"
                            value={draft.reservedStock ?? 0}
                            onChange={(event) => updateInventoryDraft(item.id, 'reservedStock', event.target.value)}
                          />
                        </label>
                        <label>
                          Đã bán
                          <input
                            type="number"
                            min="0"
                            value={draft.soldCount ?? 0}
                            onChange={(event) => updateInventoryDraft(item.id, 'soldCount', event.target.value)}
                          />
                        </label>
                        <label>
                          Trạng thái
                          <select
                            value={draft.status || item.status || 'in_stock'}
                            onChange={(event) => updateInventoryDraft(item.id, 'status', event.target.value)}
                          >
                            {inventoryStatusOptions.map((status) => (
                              <option key={status.value} value={status.value}>{status.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-order-note">
                          Ghi chú
                          <textarea
                            rows="2"
                            value={draft.note || ''}
                            onChange={(event) => updateInventoryDraft(item.id, 'note', event.target.value)}
                            placeholder="VD: còn hàng tại kho HCM..."
                          />
                        </label>
                        <button type="button" onClick={() => handleSaveInventory(item)}>Lưu tồn kho</button>
                        <button type="button" className="danger" onClick={() => handleDeleteInventory(item)}>Xóa</button>
                      </div>
                    </article>
                  );
                })}
                {!inventoryItems.length && <p className="admin-empty">Chưa có dữ liệu tồn kho.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'payments' && (
          <section className="admin-section">
            <div className="admin-card">
              <div className="admin-card-title-row">
                <div>
                  <h2>Quản lý thanh toán</h2>
                  <p className="admin-card-subtitle">Xác nhận chuyển khoản, hoàn tiền hoặc đánh dấu thanh toán lỗi.</p>
                </div>
                <div className="admin-search">
                  <input
                    value={paymentSearch}
                    onChange={(event) => setPaymentSearch(event.target.value)}
                    placeholder="Tìm mã đơn, giao dịch, ngân hàng..."
                  />
                </div>
              </div>

              <div className="admin-order-list">
                {payments.map((payment) => {
                  const draft = paymentDrafts[payment.id] || {};
                  return (
                    <article className="admin-order-row" key={payment.id}>
                      <div className="admin-order-head">
                        <div>
                          <strong>Đơn #{payment.orderCode || '—'}</strong>
                          <span>{payment.transactionId || 'Chưa có mã giao dịch'} · {formatDate(payment.createdAt)}</span>
                        </div>
                        <em className={`admin-status ${draft.status || payment.status}`}>{draft.status || payment.status}</em>
                      </div>

                      <div className="admin-order-body">
                        <div>
                          <strong>{formatCurrency(payment.amount)}</strong>
                          <span>Bank ref: {payment.bankReference || '—'}</span>
                          <span>Ghi chú: {payment.note || '—'}</span>
                        </div>
                      </div>

                      <div className="admin-order-controls admin-compact-controls">
                        <label>
                          Trạng thái thanh toán
                          <select
                            value={draft.status || payment.status || 'pending'}
                            onChange={(event) => updatePaymentDraft(payment.id, 'status', event.target.value)}
                          >
                            {paymentStatusOptions.map((status) => (
                              <option key={status.value} value={status.value}>{status.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Mã giao dịch ngân hàng
                          <input
                            value={draft.bankReference || ''}
                            onChange={(event) => updatePaymentDraft(payment.id, 'bankReference', event.target.value)}
                            placeholder="VD: MBVCB123456"
                          />
                        </label>
                        <label className="admin-order-note">
                          Ghi chú thanh toán
                          <textarea
                            rows="2"
                            value={draft.note || ''}
                            onChange={(event) => updatePaymentDraft(payment.id, 'note', event.target.value)}
                            placeholder="VD: Admin đã đối soát sao kê..."
                          />
                        </label>
                        <button type="button" onClick={() => handleSavePayment(payment)}>Lưu thanh toán</button>
                      </div>
                    </article>
                  );
                })}
                {!payments.length && <p className="admin-empty">Chưa có dữ liệu thanh toán.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'shipments' && (
          <section className="admin-section">
            <div className="admin-card">
              <div className="admin-card-title-row">
                <div>
                  <h2>Quản lý vận chuyển</h2>
                  <p className="admin-card-subtitle">Cập nhật đơn vị vận chuyển, mã vận đơn và trạng thái giao hàng.</p>
                </div>
                <div className="admin-search">
                  <input
                    value={shipmentSearch}
                    onChange={(event) => setShipmentSearch(event.target.value)}
                    placeholder="Tìm mã đơn, mã vận đơn, người nhận..."
                  />
                </div>
              </div>

              <div className="admin-order-list">
                {shipments.map((shipment) => {
                  const draft = shipmentDrafts[shipment.id] || {};
                  return (
                    <article className="admin-order-row" key={shipment.id}>
                      <div className="admin-order-head">
                        <div>
                          <strong>Đơn #{shipment.orderCode}</strong>
                          <span>{shipment.carrier || 'Chưa có ĐVVC'} · {shipment.trackingCode || 'Chưa có mã vận đơn'}</span>
                        </div>
                        <em className={`admin-status ${draft.status || shipment.status}`}>{draft.status || shipment.status}</em>
                      </div>

                      <div className="admin-order-controls admin-compact-controls">
                        <label>
                          Đơn vị vận chuyển
                          <input
                            value={draft.carrier || ''}
                            onChange={(event) => updateShipmentDraft(shipment.id, 'carrier', event.target.value)}
                            placeholder="VD: GHTK, GHN, Viettel Post"
                          />
                        </label>
                        <label>
                          Mã vận đơn
                          <input
                            value={draft.trackingCode || ''}
                            onChange={(event) => updateShipmentDraft(shipment.id, 'trackingCode', event.target.value)}
                            placeholder="VD: CPSGH123456"
                          />
                        </label>
                        <label>
                          Trạng thái giao hàng
                          <select
                            value={draft.status || shipment.status || 'pending'}
                            onChange={(event) => updateShipmentDraft(shipment.id, 'status', event.target.value)}
                          >
                            {shipmentStatusOptions.map((status) => (
                              <option key={status.value} value={status.value}>{status.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Người nhận
                          <input
                            value={draft.receiverName || ''}
                            onChange={(event) => updateShipmentDraft(shipment.id, 'receiverName', event.target.value)}
                            placeholder="Tên người nhận"
                          />
                        </label>
                        <label>
                          SĐT nhận hàng
                          <input
                            value={draft.receiverPhone || ''}
                            onChange={(event) => updateShipmentDraft(shipment.id, 'receiverPhone', event.target.value)}
                            placeholder="Số điện thoại"
                          />
                        </label>
                        <label className="admin-order-note">
                          Ghi chú vận chuyển
                          <textarea
                            rows="2"
                            value={draft.note || ''}
                            onChange={(event) => updateShipmentDraft(shipment.id, 'note', event.target.value)}
                            placeholder="VD: Giao giờ hành chính..."
                          />
                        </label>
                        <button type="button" onClick={() => handleSaveShipment(shipment)}>Lưu vận chuyển</button>
                        <button type="button" className="danger" onClick={() => handleDeleteShipment(shipment)}>Xóa</button>
                      </div>
                    </article>
                  );
                })}
                {!shipments.length && <p className="admin-empty">Chưa có vận đơn.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'returns' && (
          <section className="admin-section">
            <div className="admin-card admin-returns-card">
              <div className="admin-card-title-row">
                <div>
                  <h2>Quản lý đổi trả</h2>
                  <p className="admin-card-subtitle">
                    Yêu cầu khách gửi từ lịch sử mua hàng Smember sẽ xuất hiện tại đây để tiếp nhận và xử lý.
                  </p>
                </div>
                <div className="admin-order-filters">
                  <input
                    value={returnSearch}
                    onChange={(event) => setReturnSearch(event.target.value)}
                    placeholder="Tìm mã đổi trả, mã đơn, sản phẩm, SĐT..."
                  />
                  <select
                    value={returnStatusFilter}
                    onChange={(event) => setReturnStatusFilter(event.target.value)}
                  >
                    <option value="all">Tất cả trạng thái</option>
                    {returnStatusOptions.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="admin-order-status-strip admin-return-status-strip">
                <button
                  type="button"
                  className={returnStatusFilter === 'all' ? 'active' : ''}
                  onClick={() => setReturnStatusFilter('all')}
                >
                  <span>Tất cả</span>
                  <strong>{Object.values(returnsPayload?.statusCounts || {}).reduce((sum, count) => sum + Number(count || 0), 0)}</strong>
                </button>
                {returnStatusOptions.map((status) => (
                  <button
                    type="button"
                    key={status.value}
                    className={returnStatusFilter === status.value ? 'active' : ''}
                    onClick={() => setReturnStatusFilter(status.value)}
                  >
                    <span>{status.label}</span>
                    <strong>{returnsPayload?.statusCounts?.[status.value] || 0}</strong>
                  </button>
                ))}
              </div>

              <div className="admin-order-list admin-return-list">
                {returns.map((returnItem) => (
                  <article className="admin-order-row admin-return-row" key={returnItem.id || returnItem.returnCode}>
                    <div className="admin-order-head">
                      <div>
                        <strong>#{returnItem.returnCode}</strong>
                        <span>Đơn hàng #{returnItem.orderCode} · Gửi ngày {formatDate(returnItem.createdAt)}</span>
                      </div>
                      <em className={`admin-status ${returnItem.status}`}>
                        {returnItem.statusLabel || returnItem.status}
                      </em>
                    </div>

                    <div className="admin-return-content">
                      <div className="admin-return-product">
                        <span className="admin-return-product-image">
                          {returnItem.productImage
                            ? <img src={returnItem.productImage} alt={returnItem.productName || ''} />
                            : <AdminIcon name="products" size={26} />}
                        </span>
                        <div>
                          <strong>{returnItem.productName || returnItem.productSlug || 'Sản phẩm đổi trả'}</strong>
                          <span>{returnItem.productSku || returnItem.productSlug || 'Chưa có SKU'}</span>
                          <small>Khách hàng: {returnItem.customerPhone || 'Chưa có SĐT'}</small>
                        </div>
                      </div>

                      <div className="admin-return-reason">
                        <strong>Lý do khách gửi</strong>
                        <p>{returnItem.reason || 'Khách hàng chưa cung cấp lý do.'}</p>
                        {returnItem.note && <small>{returnItem.note}</small>}
                        {returnItem.status === 'completed' && Number(returnItem.refundAmount || 0) > 0 && (
                          <small className="admin-return-refund-amount">
                            Đã hoàn cho khách: {formatCurrency(returnItem.refundAmount)}
                          </small>
                        )}
                      </div>
                    </div>

                    {returnItem.images?.length > 0 && (
                      <div className="admin-return-evidence">
                        <div>
                          <strong>Ảnh tình trạng khách đính kèm</strong>
                          <span>{returnItem.images.length} ảnh</span>
                        </div>
                        <div className="admin-return-evidence-grid">
                          {returnItem.images.map((image, imageIndex) => (
                            <a
                              href={image}
                              target="_blank"
                              rel="noreferrer"
                              key={`${returnItem.id}-image-${imageIndex}`}
                              title={`Mở ảnh ${imageIndex + 1}`}
                            >
                              <img src={image} alt={`Ảnh đổi trả ${imageIndex + 1}`} />
                              <span>Ảnh {imageIndex + 1}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {returnItem.statusHistory?.length > 0 && (
                      <div className="admin-return-history">
                        {returnItem.statusHistory.map((historyItem, index) => (
                          <div key={`${returnItem.id}-${historyItem.status}-${index}`}>
                            <span />
                            <p>
                              <strong>
                                {returnStatusOptions.find((status) => status.value === historyItem.status)?.label
                                  || historyItem.label
                                  || historyItem.status}
                              </strong>
                              <small>{formatDate(historyItem.changedAt)}</small>
                              {historyItem.note && <em>{historyItem.note}</em>}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="admin-order-controls admin-return-controls">
                      <label>
                        Trạng thái xử lý
                        <select
                          value={returnItem.status || 'pending'}
                          onChange={(event) => handleUpdateReturnStatus(returnItem, event.target.value)}
                        >
                          {returnStatusOptions.map((status) => (
                            <option key={status.value} value={status.value}>{status.label}</option>
                          ))}
                        </select>
                      </label>

                      <label className="admin-order-note">
                        Phản hồi / ghi chú xử lý
                        <textarea
                          value={returnNotes[returnItem.id] ?? returnItem.adminNote ?? ''}
                          onChange={(event) => setReturnNotes((previous) => ({
                            ...previous,
                            [returnItem.id]: event.target.value,
                          }))}
                          rows="2"
                          placeholder="Nhập hướng xử lý; bắt buộc có lý do nếu từ chối..."
                        />
                      </label>

                      <div className="admin-return-actions">
                        {returnItem.status === 'pending' && (
                          <button type="button" className="secondary" onClick={() => handleUpdateReturnStatus(returnItem, 'received')}>
                            Tiếp nhận
                          </button>
                        )}
                        {!['approved', 'completed'].includes(returnItem.status) && (
                          <button type="button" onClick={() => handleUpdateReturnStatus(returnItem, 'approved')}>
                            Duyệt yêu cầu
                          </button>
                        )}
                        {!['rejected', 'completed', 'cancelled'].includes(returnItem.status) && (
                          <button type="button" className="danger-outline" onClick={() => handleUpdateReturnStatus(returnItem, 'rejected')}>
                            Từ chối
                          </button>
                        )}
                        {returnItem.status === 'approved' && (
                          <button type="button" className="success" onClick={() => handleUpdateReturnStatus(returnItem, 'completed')}>
                            Xác nhận hoàn trả
                          </button>
                        )}
                        <button type="button" className="secondary" onClick={() => handleSaveReturnNote(returnItem)}>
                          Lưu ghi chú
                        </button>
                        <button type="button" className="danger ghost-danger" onClick={() => handleDeleteReturn(returnItem)}>
                          Xóa
                        </button>
                      </div>
                    </div>
                  </article>
                ))}

                {!returns.length && (
                  <div className="admin-return-empty">
                    <AdminIcon name="returns" size={32} />
                    <strong>Chưa có yêu cầu đổi trả phù hợp</strong>
                    <span>Yêu cầu mới từ Smember sẽ tự động xuất hiện tại đây.</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'support' && (
          <section className="admin-section">
            <div className="admin-card">
              <div className="admin-card-title-row">
                <div>
                  <h2>Góp ý - Phản hồi - Hỗ trợ</h2>
                  <p className="admin-card-subtitle">
                    Tiếp nhận yêu cầu được gửi trực tiếp từ trang hỗ trợ khách hàng.
                  </p>
                </div>
                <div className="admin-order-filters">
                  <input
                    value={supportSearch}
                    onChange={(event) => setSupportSearch(event.target.value)}
                    placeholder="Tìm mã yêu cầu, khách hàng, email, mã đơn..."
                  />
                  <select
                    value={supportStatusFilter}
                    onChange={(event) => setSupportStatusFilter(event.target.value)}
                  >
                    <option value="all">Tất cả trạng thái</option>
                    {supportStatusOptions.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="admin-order-status-strip">
                {supportStatusOptions.map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    className={supportStatusFilter === status.value ? 'active' : ''}
                    onClick={() => setSupportStatusFilter(status.value)}
                  >
                    <span>{status.label}</span>
                    <strong>{supportPayload?.statusCounts?.[status.value] || 0}</strong>
                  </button>
                ))}
              </div>

              <div className="admin-order-list">
                {supportRequests.map((supportItem) => {
                  const draft = supportDrafts[supportItem.id] || {};
                  const conversation = supportItem.messages?.length
                    ? supportItem.messages
                    : [
                      {
                        id: 'initial',
                        sender: 'customer',
                        senderName: supportItem.fullName || 'Khách hàng',
                        content: supportItem.content,
                        createdAt: supportItem.createdAt,
                      },
                      ...(supportItem.response
                        ? [{
                          id: 'legacy-response',
                          sender: 'admin',
                          senderName: 'CellphoneS',
                          content: supportItem.response,
                          createdAt: supportItem.updatedAt,
                        }]
                        : []),
                    ];

                  return (
                    <article className="admin-order-row admin-support-row" key={supportItem.id || supportItem.requestCode}>
                      <div className="admin-order-head">
                        <div>
                          <strong>#{supportItem.requestCode}</strong>
                          <span>{supportItem.issueType || 'Yêu cầu hỗ trợ'} · {formatDate(supportItem.createdAt)}</span>
                        </div>
                        <em className={`admin-status ${draft.status || supportItem.status}`}>
                          {supportStatusOptions.find((item) => item.value === (draft.status || supportItem.status))?.label
                            || supportItem.statusLabel
                            || supportItem.status}
                        </em>
                      </div>

                      <div className="admin-support-content">
                        <div className="admin-support-contact">
                          <strong>{supportItem.fullName || 'Khách hàng'}</strong>
                          <span>{supportItem.phone || 'Không có SĐT'}</span>
                          <span>{supportItem.email || 'Không có email'}</span>
                          {supportItem.orderCode && <span>Đơn hàng: #{supportItem.orderCode}</span>}
                          <span>
                            Ưu tiên: {supportItem.preferredContact === 'phone' ? 'Điện thoại' : 'Email'}
                          </span>
                        </div>
                        <div className="admin-support-thread">
                          <strong>Trao đổi với khách hàng</strong>
                          <div className="admin-support-thread-list">
                            {conversation.map((item, index) => (
                              <div
                                className={`admin-support-bubble ${item.sender === 'admin' ? 'admin' : 'customer'}`}
                                key={item.id || `${item.sender}-${index}`}
                              >
                                <div>
                                  <strong>{item.senderName || (item.sender === 'admin' ? 'CellphoneS' : 'Khách hàng')}</strong>
                                  <time>{formatDate(item.createdAt)}</time>
                                </div>
                                <p>{item.content}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {supportItem.attachment?.dataUrl && (
                          <a
                            className="admin-support-image-link"
                            href={supportItem.attachment.dataUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              className="admin-support-image"
                              src={supportItem.attachment.dataUrl}
                              alt="Ảnh khách hàng đính kèm"
                            />
                            <span>Xem ảnh đính kèm</span>
                          </a>
                        )}
                      </div>

                      <div className="admin-order-controls admin-support-controls">
                        <label>
                          Trạng thái xử lý
                          <select
                            value={draft.status || supportItem.status || 'new'}
                            onChange={(event) => updateSupportDraft(supportItem.id, 'status', event.target.value)}
                          >
                            {supportStatusOptions.map((status) => (
                              <option key={status.value} value={status.value}>{status.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-order-note">
                          Phản hồi mới cho khách hàng
                          <textarea
                            rows="3"
                            value={draft.response || ''}
                            onChange={(event) => updateSupportDraft(supportItem.id, 'response', event.target.value)}
                            placeholder="Nội dung này sẽ xuất hiện ngay trong trang Liên hệ của khách..."
                          />
                        </label>
                        <label className="admin-order-note">
                          Ghi chú nội bộ
                          <textarea
                            rows="2"
                            value={draft.adminNote || ''}
                            onChange={(event) => updateSupportDraft(supportItem.id, 'adminNote', event.target.value)}
                            placeholder="Ghi chú chỉ dành cho quản trị viên..."
                          />
                        </label>
                        <button type="button" onClick={() => handleSaveSupportRequest(supportItem)}>
                          {draft.response?.trim() ? 'Gửi phản hồi & lưu' : 'Lưu xử lý'}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleDeleteSupportRequest(supportItem)}
                        >
                          Xóa
                        </button>
                      </div>
                    </article>
                  );
                })}

                {!supportRequests.length && <p className="admin-empty">Chưa có yêu cầu hỗ trợ phù hợp.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'revenue' && (
          <section className="admin-section">
            <div className="admin-stat-grid">
              <StatCard label="Doanh thu" value={formatCurrency(revenuePayload?.summary?.revenue || 0)} tone="green" />
              <StatCard label="Số đơn" value={revenuePayload?.summary?.orders || 0} tone="blue" />
              <StatCard label="Số dòng sản phẩm" value={revenuePayload?.summary?.items || 0} tone="orange" />
            </div>

            <div className="admin-card">
              <h2>Doanh thu theo ngày</h2>
              <div className="admin-table">
                {(revenuePayload?.daily || []).map((row) => (
                  <div className="admin-list-row" key={row.date}>
                    <div>
                      <strong>{row.date}</strong>
                      <span>{row.orders} đơn hàng</span>
                    </div>
                    <em>{formatCurrency(row.revenue)}</em>
                  </div>
                ))}
                {!revenuePayload?.daily?.length && <p className="admin-empty">Chưa có dữ liệu doanh thu.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'audit' && (
          <section className="admin-section">
            <div className="admin-card">
              <h2>Nhật ký thao tác admin</h2>
              <div className="admin-table">
                {auditLogs.map((log) => (
                  <div className="admin-list-row" key={log.id}>
                    <div>
                      <strong>{log.action} · {log.targetType}</strong>
                      <span>Target: {log.targetId}</span>
                      <small>{log.actorEmail || log.actorRole || 'admin'} · {formatDate(log.createdAt)}</small>
                    </div>
                    <em>{log.actorRole}</em>
                  </div>
                ))}
                {!auditLogs.length && <p className="admin-empty">Chưa có nhật ký thao tác.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'business' && (
          <section className="admin-section">
            <div className="admin-card">
              <div className="admin-card-title-row">
                <div>
                  <h2>Duyệt hồ sơ S-Business</h2>
                  <p className="admin-card-subtitle">
                    Kiểm tra thông tin và giấy đăng ký doanh nghiệp trước khi cấp quyền S-Business.
                  </p>
                </div>
                <div className="admin-order-filters">
                  <input
                    value={businessSearch}
                    onChange={(event) => setBusinessSearch(event.target.value)}
                    placeholder="Tìm công ty, MST, email, người đại diện..."
                  />
                  <select
                    value={businessStatusFilter}
                    onChange={(event) => setBusinessStatusFilter(event.target.value)}
                  >
                    <option value="all">Tất cả trạng thái</option>
                    {businessStatusOptions.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="admin-order-status-strip">
                {businessStatusOptions.map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    className={businessStatusFilter === status.value ? 'active' : ''}
                    onClick={() => setBusinessStatusFilter(status.value)}
                  >
                    <span>{status.label}</span>
                    <strong>{businessPayload?.statusCounts?.[status.value] || 0}</strong>
                  </button>
                ))}
              </div>

              <div className="admin-order-list">
                {businessVerifications.map((item) => (
                  <article className="admin-order-row admin-business-row" key={item.userId}>
                    <div className="admin-order-head">
                      <div>
                        <strong>{item.companyName || 'Doanh nghiệp chưa có tên'}</strong>
                        <span>Mã số thuế: {item.taxCode || '—'} · Gửi ngày {formatDate(item.submittedAt)}</span>
                      </div>
                      <em className={`admin-status ${item.status}`}>{item.statusLabel || item.status}</em>
                    </div>

                    <div className="admin-business-content">
                      <div className="admin-business-details">
                        <strong>Thông tin doanh nghiệp</strong>
                        <span>Địa chỉ: {item.companyAddress || '—'}</span>
                        <span>Đại diện: {item.representativeName || '—'} · {item.position || '—'}</span>
                        <span>Email: {item.email || '—'}</span>
                        <span>Số điện thoại: {item.phone || '—'}</span>
                        <small>Tài khoản gửi: {item.fullName || '—'} · {item.accountEmail || '—'} · {item.accountPhone || '—'}</small>
                        {item.reviewedAt && (
                          <small>Đã xử lý: {formatDate(item.reviewedAt)} · {item.reviewedBy?.email || 'admin'}</small>
                        )}
                      </div>

                      {item.registrationDocument ? (
                        <a
                          className="admin-business-document-link"
                          href={item.registrationDocument}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img src={item.registrationDocument} alt="Giấy chứng nhận đăng ký doanh nghiệp" />
                          <span>Xem giấy đăng ký doanh nghiệp</span>
                        </a>
                      ) : (
                        <div className="admin-business-document-missing">Không có ảnh hồ sơ</div>
                      )}
                    </div>

                    <div className="admin-order-controls admin-business-controls">
                      <label className="admin-order-note">
                        Ghi chú duyệt / lý do từ chối
                        <textarea
                          rows="3"
                          value={businessReviewNotes[item.userId] || ''}
                          onChange={(event) => setBusinessReviewNotes((previous) => ({
                            ...previous,
                            [item.userId]: event.target.value,
                          }))}
                          placeholder="Nhập lý do nếu từ chối hoặc ghi chú khi duyệt..."
                        />
                      </label>

                      {item.status !== 'verified' && (
                        <button type="button" onClick={() => handleReviewBusinessVerification(item, 'verified')}>
                          Duyệt S-Business
                        </button>
                      )}
                      {item.status !== 'rejected' && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleReviewBusinessVerification(item, 'rejected')}
                        >
                          Từ chối hồ sơ
                        </button>
                      )}
                    </div>
                  </article>
                ))}

                {!businessVerifications.length && (
                  <p className="admin-empty">Không có hồ sơ doanh nghiệp phù hợp.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'users' && (
          <section className="admin-section">
            <div className="admin-card">
              <div className="admin-card-title-row">
                <h2>Kiểm tra người dùng</h2>
                <div className="admin-search">
                  <input
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Tìm tên, email, số điện thoại..."
                  />
                </div>
              </div>

              <div className="admin-users-table">
                {users.map((user) => (
                  <div className="admin-user-row" key={user.id}>
                    <div>
                      <strong>{user.fullName || 'Chưa có tên'}</strong>
                      <span>{user.email} · {user.phone}</span>
                      <small>
                        Tạo: {formatDate(user.createdAt)} · Đăng nhập cuối: {formatDate(user.lastLoginAt)}
                      </small>
                    </div>
                    <div className="admin-user-badges">
                      <em>{user.role || 'customer'}</em>
                      <em className={user.status === 'blocked' ? 'blocked' : 'active'}>
                        {user.status || 'active'}
                      </em>
                      {user.emailVerified && <em className="verified">verified</em>}
                    </div>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        onClick={() => handleUpdateUser(user, {
                          status: user.status === 'blocked' ? 'active' : 'blocked',
                        })}
                      >
                        {user.status === 'blocked' ? 'Mở khóa' : 'Khóa'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateUser(user, {
                          role: user.role === 'admin' ? 'customer' : 'admin',
                        })}
                      >
                        {user.role === 'admin' ? 'Gỡ admin' : 'Lên admin'}
                      </button>
                      <button type="button" className="danger" onClick={() => handleDeleteUser(user)}>
                        Xóa
                      </button>
                    </div>
                  </div>
                ))}
                {!users.length && <p className="admin-empty">Chưa có người dùng phù hợp.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'questions' && (
          <section className="admin-section">
            <div className="admin-card">
              <div className="admin-card-title-row">
                <h2>Quản lý hỏi đáp sản phẩm</h2>
                <div className="admin-search">
                  <input
                    value={questionSearch}
                    onChange={(event) => setQuestionSearch(event.target.value)}
                    placeholder="Tìm sản phẩm, khách, câu hỏi..."
                  />
                </div>
              </div>

              <div className="admin-interaction-list">
                {questions.map((question) => (
                  <article className="admin-interaction-row" key={question.id}>
                    <div className="admin-interaction-head">
                      <div>
                        <strong>{question.productName || question.productSlug}</strong>
                        <span>{question.authorName || question.email || 'Khách hàng'} · {formatDate(question.createdAt)}</span>
                      </div>
                      <em className={`admin-status ${question.status}`}>{question.status}</em>
                    </div>
                    <p className="admin-interaction-content">{question.question}</p>
                    <label className="admin-reply-box">
                      Trả lời của CellphoneS
                      <textarea
                        value={questionAnswers[question.id] || ''}
                        onChange={(event) => setQuestionAnswers((previous) => ({
                          ...previous,
                          [question.id]: event.target.value,
                        }))}
                        rows="3"
                        placeholder="Nhập câu trả lời để hiển thị ngoài trang sản phẩm..."
                      />
                    </label>
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => handleAnswerQuestion(question)}>
                        Trả lời
                      </button>
                      <button type="button" onClick={() => handleUpdateQuestionStatus(question, 'pending')}>
                        Chờ
                      </button>
                      <button type="button" onClick={() => handleUpdateQuestionStatus(question, 'hidden')}>
                        Ẩn
                      </button>
                      <button type="button" className="danger" onClick={() => handleDeleteQuestion(question)}>
                        Xóa
                      </button>
                    </div>
                  </article>
                ))}
                {!questions.length && <p className="admin-empty">Chưa có câu hỏi phù hợp.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'reviews' && (
          <section className="admin-section">
            <div className="admin-card">
              <div className="admin-card-title-row">
                <h2>Quản lý đánh giá</h2>
                <div className="admin-search">
                  <input
                    value={reviewSearch}
                    onChange={(event) => setReviewSearch(event.target.value)}
                    placeholder="Tìm sản phẩm, khách, nội dung..."
                  />
                </div>
              </div>

              <div className="admin-interaction-list">
                {reviews.map((review) => (
                  <article className="admin-interaction-row" key={review.id}>
                    <div className="admin-interaction-head">
                      <div>
                        <strong>{review.productName || review.productSlug}</strong>
                        <span>{review.authorName || review.email || 'Khách hàng'} · {formatDate(review.createdAt)}</span>
                      </div>
                      <em className={`admin-status ${review.status}`}>{review.rating}★ · {review.status}</em>
                    </div>
                    <p className="admin-interaction-content">{review.content}</p>
                    <label className="admin-reply-box">
                      Phản hồi đánh giá
                      <textarea
                        value={reviewReplies[review.id] || ''}
                        onChange={(event) => setReviewReplies((previous) => ({
                          ...previous,
                          [review.id]: event.target.value,
                        }))}
                        rows="3"
                        placeholder="Nhập phản hồi của CellphoneS..."
                      />
                    </label>
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => handleReplyReview(review)}>
                        Phản hồi
                      </button>
                      <button type="button" onClick={() => handleUpdateReviewStatus(review, 'approved')}>
                        Duyệt
                      </button>
                      <button type="button" onClick={() => handleUpdateReviewStatus(review, 'hidden')}>
                        Ẩn
                      </button>
                      <button type="button" className="danger" onClick={() => handleDeleteReview(review)}>
                        Xóa
                      </button>
                    </div>
                  </article>
                ))}
                {!reviews.length && <p className="admin-empty">Chưa có đánh giá phù hợp.</p>}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
