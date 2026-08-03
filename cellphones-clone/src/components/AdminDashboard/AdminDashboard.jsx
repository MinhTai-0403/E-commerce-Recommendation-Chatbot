import { useEffect, useMemo, useState } from 'react';
import {
  createAdminCoupon,
  createAdminProduct,
  deleteAdminCoupon,
  deleteAdminProduct,
  deleteAdminQuestion,
  deleteAdminReturn,
  deleteAdminReview,
  deleteAdminSupportRequest,
  deleteAdminUser,
  fetchAdminAuditLogs,
  fetchAdminBusinessVerifications,
  fetchAdminCoupons,
  fetchAdminInventory,
  fetchAdminProducts,
  fetchAdminQuestions,
  fetchAdminReturns,
  fetchAdminRevenue,
  fetchAdminReviews,
  fetchAdminSummary,
  fetchAdminSupportRequests,
  fetchAdminUsers,
  updateAdminBusinessVerification,
  updateAdminCoupon,
  updateAdminInventory,
  updateAdminProduct,
  updateAdminQuestion,
  updateAdminReturn,
  updateAdminReview,
  updateAdminSupportRequest,
  updateAdminUser,
} from '../../services/apiAdmin';
import { clearAuthSession } from '../../services/apiAuth';
import {
  buildCouponPayload,
  buildProductPayload,
  couponAudienceOptions,
  couponDistributionOptions,
  couponStatusOptions,
  couponToForm,
  couponTypeOptions,
  emptyCouponForm,
  emptyProductForm,
  formatCurrency,
  formatDate,
  formatMoney,
  productToForm,
  returnStatusOptions,
  returnStatusTransitions,
  supportStatusOptions,
} from './adminDashboardUtils';
import AdminOrdersWorkspace from './AdminOrdersWorkspace';
import './AdminDashboard.css';

function isUsableAdminImage(value) {
  return Boolean(value) && !/\/media\/catalog\/product\/?$/i.test(value);
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
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
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

function useDebouncedValue(value, delay = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debouncedValue;
}

function AdminPagination({ pagination, onPageChange, noun = 'bản ghi', disabled = false }) {
  const page = Number(pagination?.page || 1);
  const totalPages = Math.max(1, Number(pagination?.totalPages || 1));
  const total = Number(pagination?.total || 0);

  if (totalPages <= 1 && total === 0) return null;

  const changePage = (nextPage) => {
    onPageChange(nextPage);
    document.querySelector('.admin-page-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="admin-pagination" aria-label={`Phân trang ${noun}`}>
      <span>Trang <strong>{page}</strong>/{totalPages} · {total.toLocaleString('vi-VN')} {noun}</span>
      <div>
        <button
          type="button"
          className="admin-icon-button"
          onClick={() => changePage(Math.max(1, page - 1))}
          disabled={disabled || page <= 1}
          aria-label="Trang trước"
          title="Trang trước"
        >
          <AdminIcon name="chevronLeft" size={18} />
        </button>
        <button
          type="button"
          className="admin-icon-button"
          onClick={() => changePage(Math.min(totalPages, page + 1))}
          disabled={disabled || page >= totalPages}
          aria-label="Trang sau"
          title="Trang sau"
        >
          <AdminIcon name="chevronRight" size={18} />
        </button>
      </div>
    </nav>
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
  const [productsPayload, setProductsPayload] = useState(null);
  const [usersPayload, setUsersPayload] = useState(null);
  const [businessPayload, setBusinessPayload] = useState(null);
  const [questionsPayload, setQuestionsPayload] = useState(null);
  const [reviewsPayload, setReviewsPayload] = useState(null);
  const [couponsPayload, setCouponsPayload] = useState(null);
  const [inventoryPayload, setInventoryPayload] = useState(null);
  const [returnsPayload, setReturnsPayload] = useState(null);
  const [supportPayload, setSupportPayload] = useState(null);
  const [revenuePayload, setRevenuePayload] = useState(null);
  const [auditLogsPayload, setAuditLogsPayload] = useState(null);

  const [couponSearch, setCouponSearch] = useState('');
  const [couponPage, setCouponPage] = useState(1);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [returnSearch, setReturnSearch] = useState('');
  const [returnPage, setReturnPage] = useState(1);
  const [returnStatusFilter, setReturnStatusFilter] = useState('all');
  const [returnNotes, setReturnNotes] = useState({});
  const [supportSearch, setSupportSearch] = useState('');
  const [supportPage, setSupportPage] = useState(1);
  const [supportStatusFilter, setSupportStatusFilter] = useState('all');
  const [supportDrafts, setSupportDrafts] = useState({});
  const [inventoryDrafts, setInventoryDrafts] = useState({});
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [businessSearch, setBusinessSearch] = useState('');
  const [businessPage, setBusinessPage] = useState(1);
  const [businessStatusFilter, setBusinessStatusFilter] = useState('pending');
  const [businessReviewNotes, setBusinessReviewNotes] = useState({});
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionPage, setQuestionPage] = useState(1);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewPage, setReviewPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [questionAnswers, setQuestionAnswers] = useState({});
  const [reviewReplies, setReviewReplies] = useState({});
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productEditorOpen, setProductEditorOpen] = useState(false);
  const [couponForm, setCouponForm] = useState(emptyCouponForm);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [couponEditorOpen, setCouponEditorOpen] = useState(false);

  const debouncedProductSearch = useDebouncedValue(productSearch);
  const debouncedUserSearch = useDebouncedValue(userSearch);
  const debouncedBusinessSearch = useDebouncedValue(businessSearch);
  const debouncedQuestionSearch = useDebouncedValue(questionSearch);
  const debouncedReviewSearch = useDebouncedValue(reviewSearch);
  const debouncedCouponSearch = useDebouncedValue(couponSearch);
  const debouncedInventorySearch = useDebouncedValue(inventorySearch);
  const debouncedReturnSearch = useDebouncedValue(returnSearch);
  const debouncedSupportSearch = useDebouncedValue(supportSearch);

  const products = productsPayload?.data || [];
  const users = usersPayload?.data || [];
  const businessVerifications = businessPayload?.data || [];
  const questions = questionsPayload?.data || [];
  const reviews = reviewsPayload?.data || [];
  const coupons = couponsPayload?.data || [];
  const inventoryItems = inventoryPayload?.data || [];
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
  const notificationCount = Number(stats.pendingOrders || 0)
    + Number(stats.pendingReturns || 0)
    + Number(stats.pendingQuestions || 0)
    + Number(stats.pendingBusinessVerifications || 0);
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
    const controller = new AbortController();

    async function loadAdminData() {
      if (!isAdmin) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        if (activeTab === 'dashboard') {
          const data = await fetchAdminSummary(controller.signal);
          if (!ignore) setSummary(data);
        }

        if (activeTab === 'products') {
          const data = await fetchAdminProducts({
            q: debouncedProductSearch.trim(),
            include: 'details',
            page: productPage,
            limit: 12,
          }, controller.signal);
          if (!ignore) setProductsPayload(data);
        }

        if (activeTab === 'users') {
          const data = await fetchAdminUsers({
            q: debouncedUserSearch.trim(),
            page: userPage,
            limit: 12,
          }, controller.signal);
          if (!ignore) setUsersPayload(data);
        }

        if (activeTab === 'business') {
          const data = await fetchAdminBusinessVerifications({
            q: debouncedBusinessSearch.trim(),
            status: businessStatusFilter,
            page: businessPage,
            limit: 10,
          }, controller.signal);
          if (!ignore) {
            setBusinessPayload(data);
            setBusinessReviewNotes(Object.fromEntries(
              (data.data || []).map((item) => [item.userId, item.reviewNote || ''])
            ));
          }
        }

        if (activeTab === 'questions') {
          const data = await fetchAdminQuestions({
            q: debouncedQuestionSearch.trim(),
            page: questionPage,
            limit: 8,
          }, controller.signal);
          if (!ignore) {
            setQuestionsPayload(data);
            setQuestionAnswers(Object.fromEntries(
              (data.data || []).map((item) => [item.id, item.answer?.content || ''])
            ));
          }
        }

        if (activeTab === 'reviews') {
          const data = await fetchAdminReviews({
            q: debouncedReviewSearch.trim(),
            page: reviewPage,
            limit: 8,
          }, controller.signal);
          if (!ignore) {
            setReviewsPayload(data);
            setReviewReplies(Object.fromEntries(
              (data.data || []).map((item) => [item.id, item.adminReply?.content || ''])
            ));
          }
        }

        if (activeTab === 'coupons') {
          const data = await fetchAdminCoupons({
            q: debouncedCouponSearch.trim(),
            page: couponPage,
            limit: 10,
          }, controller.signal);
          if (!ignore) setCouponsPayload(data);
        }

        if (activeTab === 'inventory') {
          const data = await fetchAdminInventory({
            q: debouncedInventorySearch.trim(),
            page: inventoryPage,
            limit: 12,
          }, controller.signal);
          if (!ignore) {
            setInventoryPayload(data);
            setInventoryDrafts(Object.fromEntries(
              (data.data || []).map((item) => [item.id, {
                stock: item.stock ?? 0,
                status: item.status || 'in_stock',
                note: item.note || '',
              }])
            ));
          }
        }


        if (activeTab === 'returns') {
          const data = await fetchAdminReturns({
            q: debouncedReturnSearch.trim(),
            status: returnStatusFilter,
            page: returnPage,
            limit: 10,
          }, controller.signal);
          if (!ignore) {
            setReturnsPayload(data);
            setReturnNotes(Object.fromEntries(
              (data.data || []).map((item) => [item.id, item.adminNote || ''])
            ));
          }
        }

        if (activeTab === 'support') {
          const data = await fetchAdminSupportRequests({
            q: debouncedSupportSearch.trim(),
            status: supportStatusFilter,
            page: supportPage,
            limit: 10,
          }, controller.signal);
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
          const data = await fetchAdminRevenue({}, controller.signal);
          if (!ignore) setRevenuePayload(data);
        }

        if (activeTab === 'audit') {
          const data = await fetchAdminAuditLogs({ page: auditPage, limit: 15 }, controller.signal);
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
      controller.abort();
    };
  }, [
    activeTab,
    isAdmin,
    debouncedProductSearch,
    productPage,
    debouncedQuestionSearch,
    questionPage,
    refreshTick,
    debouncedReviewSearch,
    reviewPage,
    debouncedUserSearch,
    userPage,
    debouncedBusinessSearch,
    businessPage,
    businessStatusFilter,
    debouncedCouponSearch,
    couponPage,
    debouncedInventorySearch,
    inventoryPage,
    debouncedReturnSearch,
    returnPage,
    returnStatusFilter,
    debouncedSupportSearch,
    supportPage,
    supportStatusFilter,
    auditPage,
  ]);

  const refresh = () => setRefreshTick((value) => value + 1);

  const updateProductField = (field, value) => {
    setProductForm((previous) => ({ ...previous, [field]: value }));
  };

  const resetProductForm = () => {
    setProductForm(emptyProductForm);
    setEditingProduct(null);
    setProductEditorOpen(false);
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
    setEditingProduct(product);
    setProductForm(productToForm(product));
    setProductEditorOpen(true);
    setActiveTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitProduct = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const requiredProductFields = [
      ['name', 'tên sản phẩm'],
      ['slug', 'slug'],
      ['sku', 'SKU'],
      ['brand', 'thương hiệu'],
      ['categories', 'danh mục'],
    ];
    const missingProductField = requiredProductFields.find(([field]) => !String(productForm[field] || '').trim());
    if (missingProductField) {
      setError(`Vui lòng nhập ${missingProductField[1]}.`);
      return;
    }

    const currentPrice = Number(productForm.currentPrice);
    const originalPrice = productForm.originalPrice === '' ? null : Number(productForm.originalPrice);
    if (!Number.isFinite(currentPrice) || currentPrice < 0) {
      setError('Giá bán phải là số không âm.');
      return;
    }
    if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice < currentPrice)) {
      setError('Giá niêm yết phải lớn hơn hoặc bằng giá bán.');
      return;
    }

    setLoading(true);
    try {
      const payload = buildProductPayload(productForm);
      if (editingProduct) {
        await updateAdminProduct(editingProduct.mongoId || editingProduct.id || editingProduct.slug, payload);
      } else {
        await createAdminProduct(payload);
      }

      setMessage(editingProduct ? 'Đã cập nhật thông tin sản phẩm.' : 'Đã thêm sản phẩm mới. Hãy thiết lập số lượng tại trang Tồn kho.');
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
    setCouponEditorOpen(false);
  };

  const handleEditCoupon = (coupon) => {
    setEditingCoupon(coupon);
    setCouponForm(couponToForm(coupon));
    setCouponEditorOpen(true);
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

    if (!couponForm.name.trim()) {
      setError('Vui lòng nhập tên chương trình giảm giá.');
      return;
    }

    const couponValue = Number(couponForm.value);
    if (couponForm.type === 'percent' && (!Number.isFinite(couponValue) || couponValue <= 0 || couponValue > 100)) {
      setError('Mức giảm phần trăm phải từ 1 đến 100%.');
      return;
    }
    if (couponForm.type === 'fixed' && (!Number.isFinite(couponValue) || couponValue <= 0)) {
      setError('Số tiền giảm cố định phải lớn hơn 0.');
      return;
    }

    const nonNegativeFields = [
      ['minSubtotal', 'Giá trị đơn tối thiểu'],
      ['maxDiscount', 'Mức giảm tối đa'],
    ];
    const invalidNonNegative = nonNegativeFields.find(([field]) => (
      couponForm[field] !== '' && (!Number.isFinite(Number(couponForm[field])) || Number(couponForm[field]) < 0)
    ));
    if (invalidNonNegative) {
      setError(`${invalidNonNegative[1]} phải là số không âm.`);
      return;
    }

    const limitFields = [
      ['usageLimit', 'Tổng lượt sử dụng'],
      ['userLimit', 'Lượt dùng mỗi người'],
    ];
    const invalidLimit = limitFields.find(([field]) => (
      couponForm[field] !== '' && (!Number.isInteger(Number(couponForm[field])) || Number(couponForm[field]) < 1)
    ));
    if (invalidLimit) {
      setError(`${invalidLimit[1]} phải là số nguyên lớn hơn 0.`);
      return;
    }

    if (couponForm.startsAt && couponForm.expiresAt && new Date(couponForm.startsAt) >= new Date(couponForm.expiresAt)) {
      setError('Thời gian kết thúc phải sau thời gian bắt đầu.');
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
    const statusLabel = couponStatusOptions.find((item) => item.value === status)?.label || status;
    if (!window.confirm(`Chuyển mã "${coupon.code}" sang trạng thái "${statusLabel}"?`)) return;

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
    const draft = inventoryDrafts[item.id] || {};
    const stock = Number(draft.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      setError('Tồn thực tế phải là số nguyên không âm.');
      return;
    }
    if (stock < Number(item.reservedStock || 0)) {
      setError(`Tồn thực tế không thể thấp hơn ${Number(item.reservedStock || 0)} sản phẩm đang giữ chỗ.`);
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminInventory(item.id || item.key || item.productId, {
        stock,
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

  const handleUpdateUser = async (user, patch) => {
    const label = user.fullName || user.email || user.id;
    const action = patch.status
      ? (patch.status === 'blocked' ? 'khóa' : 'mở khóa')
      : (patch.role === 'admin' ? 'cấp quyền admin cho' : 'gỡ quyền admin của');
    if (!window.confirm(`Xác nhận ${action} "${label}"?`)) return;

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
    if (!window.confirm(`Xóa vĩnh viễn người dùng "${user.fullName || user.email}"? Hành động này không thể hoàn tác.`)) return;

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
    if (question.status === status) return;
    const statusLabel = status === 'hidden' ? 'ẩn' : 'đưa về chờ xử lý';
    if (!window.confirm(`Xác nhận ${statusLabel} câu hỏi này?`)) return;

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
    if (review.status === status) return;
    const statusLabel = status === 'approved' ? 'duyệt' : 'ẩn';
    if (!window.confirm(`Xác nhận ${statusLabel} đánh giá này?`)) return;

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
    const draft = supportDrafts[supportItem.id] || {};
    const response = String(draft.response || '').trim();
    const adminNote = String(draft.adminNote || '').trim();
    let status = draft.status || supportItem.status || 'new';
    if (response && ['new', 'in_progress'].includes(status)) status = 'waiting_customer';

    const hasChanges = response
      || adminNote !== String(supportItem.adminNote || '').trim()
      || status !== supportItem.status;
    if (!hasChanges) {
      setError('Chưa có thay đổi nào để lưu.');
      return;
    }

    if (['resolved', 'closed'].includes(status) && !response && !supportItem.response) {
      setError('Vui lòng nhập phản hồi trước khi hoàn tất yêu cầu hỗ trợ.');
      return;
    }

    if (status === 'closed' && supportItem.status !== 'closed'
      && !window.confirm(`Đóng yêu cầu hỗ trợ "${supportItem.requestCode}"?`)) return;

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminSupportRequest(supportItem.id || supportItem.requestCode, {
        status,
        adminNote,
        response: response || supportItem.response || '',
      });
      setMessage(response
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
            <button
              type="button"
              className="admin-icon-button admin-notification-button"
              title={`${notificationCount} việc cần xử lý`}
              aria-label={`${notificationCount} việc cần xử lý`}
              onClick={() => setActiveTab('dashboard')}
            >
              <AdminIcon name="bell" />
              {notificationCount > 0 && <i />}
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
                        {isUsableAdminImage(product.image) ? <img src={product.image} alt="" /> : <AdminIcon name="products" />}
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

        {activeTab === 'orders' && <AdminOrdersWorkspace />}

        {activeTab === 'products' && (
          <section className={`admin-section admin-products-layout ${productEditorOpen ? '' : 'list-only'}`}>
            {productEditorOpen && <form className="admin-card admin-product-form" onSubmit={handleSubmitProduct}>
              <div className="admin-card-title-row">
                <h2>{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
                <button type="button" className="ghost" onClick={resetProductForm}>
                  {editingProduct ? 'Hủy sửa' : 'Đóng'}
                </button>
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

              <label className="admin-product-inventory-policy">
                <input
                  type="checkbox"
                  checked={productForm.manageInventory !== false}
                  onChange={(event) => updateProductField('manageInventory', event.target.checked)}
                />
                <span>
                  <strong>Quản lý tồn kho cho sản phẩm này</strong>
                  <small>
                    Số lượng, giữ chỗ và đã bán được quản lý riêng tại trang Tồn kho để tránh lệch dữ liệu.
                  </small>
                </span>
              </label>

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
            </form>}

            <div className="admin-card admin-table-card">
              <div className="admin-card-title-row">
                <h2>Danh sách sản phẩm</h2>
                <div className="admin-card-title-actions">
                  <button type="button" onClick={() => {
                    setProductForm(emptyProductForm);
                    setEditingProduct(null);
                    setProductEditorOpen(true);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}>
                    Thêm sản phẩm
                  </button>
                  <div className="admin-search">
                    <input
                      value={productSearch}
                      onChange={(event) => {
                        setProductSearch(event.target.value);
                        setProductPage(1);
                      }}
                      placeholder="Tìm sản phẩm..."
                    />
                  </div>
                </div>
              </div>

              <div className="admin-table">
                {products.map((product) => {
                  const inventoryItem = product.inventorySummary;
                  return (
                    <div className="admin-product-row" key={product.id}>
                      {isUsableAdminImage(product.thumbnail || product.primaryImage || product.image)
                        ? <img src={product.thumbnail || product.primaryImage || product.image} alt="" />
                        : <AdminIcon name="products" />}
                      <div>
                        <strong>{product.name}</strong>
                        <span>{product.sku || product.slug} · {product.brand || '—'}</span>
                        <span>
                          {product.manageInventory === false
                            ? 'Không theo dõi tồn kho'
                            : inventoryItem
                              ? `Khả dụng ${inventoryItem.availableStock} · Tồn thực tế ${inventoryItem.stock} · Giữ chỗ ${inventoryItem.reservedStock}`
                              : 'Chưa thiết lập tồn kho'}
                        </span>
                        <em>{formatCurrency(product.currentPrice)}</em>
                      </div>
                      <div className="admin-row-actions">
                        <button type="button" onClick={() => handleEditProduct(product)}>Sửa</button>
                        {product.manageInventory !== false && (
                          <button
                            type="button"
                            onClick={() => {
                              setInventorySearch(product.sku || product.slug || product.name || '');
                              setInventoryPage(1);
                              setActiveTab('inventory');
                            }}
                          >
                            Tồn kho
                          </button>
                        )}
                        <button type="button" className="danger" onClick={() => handleDeleteProduct(product)}>Xóa</button>
                      </div>
                    </div>
                  );
                })}
                {!products.length && <p className="admin-empty">{loading ? 'Đang tải sản phẩm...' : 'Không có sản phẩm phù hợp.'}</p>}
              </div>
              <AdminPagination
                pagination={productsPayload?.pagination}
                onPageChange={setProductPage}
                noun="sản phẩm"
                disabled={loading}
              />
            </div>
          </section>
        )}

        {activeTab === 'coupons' && (
          <section className={`admin-section admin-coupons-layout ${couponEditorOpen ? '' : 'list-only'}`}>
            {couponEditorOpen && <form className="admin-card admin-product-form" onSubmit={handleSubmitCoupon}>
              <div className="admin-card-title-row">
                <div>
                  <h2>{editingCoupon ? 'Sửa mã giảm giá' : 'Thêm mã giảm giá'}</h2>
                  <p className="admin-card-subtitle">
                    Tạo mã ưu đãi. Mã không tự vào tài khoản; người dùng phải nhập để nhận vào kho voucher.
                  </p>
                </div>
                <button type="button" className="ghost" onClick={resetCouponForm}>
                  {editingCoupon ? 'Hủy sửa' : 'Đóng'}
                </button>
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

              <div className="admin-form-grid">
                <label>
                  Tên ưu đãi
                  <input
                    value={couponForm.name}
                    onChange={(event) => updateCouponField('name', event.target.value)}
                    placeholder="VD: Giảm 10% cho thành viên mới"
                  />
                </label>
                <label>
                  Cách nhận mã
                  <select
                    value={couponForm.distributionMode || 'manual_claim'}
                    onChange={(event) => updateCouponField('distributionMode', event.target.value)}
                  >
                    {couponDistributionOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <small>
                    {couponDistributionOptions.find((option) => option.value === couponForm.distributionMode)?.hint
                      || couponDistributionOptions[0].hint}
                  </small>
                </label>
              </div>

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
                  {couponForm.type === 'percent' ? 'Phần trăm giảm (%)' : 'Giá trị giảm'}
                  <input
                    type="number"
                    min={couponForm.type === 'percent' ? '1' : '0'}
                    max={couponForm.type === 'percent' ? '100' : undefined}
                    step={couponForm.type === 'percent' ? '1' : '1000'}
                    value={couponForm.value}
                    onChange={(event) => updateCouponField('value', event.target.value)}
                    placeholder={couponForm.type === 'percent' ? 'VD: 10' : 'VD: 50000'}
                  />
                  {couponForm.type === 'percent' && <small>Nhập từ 1 đến 100%. Có thể giới hạn bằng “Giảm tối đa”.</small>}
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
                    min="1"
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
            </form>}

            <div className="admin-card admin-table-card">
              <div className="admin-card-title-row">
                <div>
                  <h2>Danh sách mã giảm giá</h2>
                  <p className="admin-card-subtitle">
                    Bấm Sửa để chỉnh, Bật/Tắt để đổi trạng thái, Xóa để gỡ mã.
                  </p>
                </div>
                <div className="admin-card-title-actions">
                  <button type="button" onClick={() => {
                    setCouponForm(emptyCouponForm);
                    setEditingCoupon(null);
                    setCouponEditorOpen(true);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}>
                    Thêm mã
                  </button>
                  <div className="admin-search">
                    <input
                      value={couponSearch}
                      onChange={(event) => {
                        setCouponSearch(event.target.value);
                        setCouponPage(1);
                      }}
                      placeholder="Tìm mã, tên ưu đãi..."
                    />
                  </div>
                </div>
              </div>

              <div className="admin-table">
                {coupons.map((coupon) => (
                  <div className="admin-list-row admin-coupon-row" key={coupon.id || coupon.code}>
                    <div>
                      <strong>{coupon.code}</strong>
                      <span>{coupon.name || coupon.description || 'Mã giảm giá'}</span>
                      <small>
                        Loại: {coupon.type} · Giá trị: {coupon.type === 'percent' ? `${coupon.value}%` : formatMoney(coupon.value)}
                        {coupon.maxDiscount ? ` · Tối đa ${formatMoney(coupon.maxDiscount)}` : ''}
                      </small>
                      <small>
                        Đơn tối thiểu: {formatMoney(coupon.minSubtotal || 0)} · Đã dùng: {coupon.usedCount || 0}
                        {coupon.usageLimit ? `/${coupon.usageLimit}` : ''} · HSD: {formatDate(coupon.expiresAt)}
                      </small>
                      <div className="admin-coupon-audience-tags">
                        {(coupon.audiences || ['all']).map((audience) => {
                          const option = couponAudienceOptions.find((item) => item.value === audience);
                          return <span key={audience}>{option?.label || audience}</span>;
                        })}
                        {coupon.allowWithEducationOffer === false && <span>Không cộng ưu đãi giáo dục</span>}
                        <span>
                          {coupon.distributionMode === 'checkout_only'
                            ? 'Nhận tại thanh toán'
                            : 'Người dùng nhập mã để nhận'}
                        </span>
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
                {!coupons.length && <p className="admin-empty">{loading ? 'Đang tải mã giảm giá...' : 'Chưa có mã giảm giá.'}</p>}
              </div>
              <AdminPagination
                pagination={couponsPayload?.pagination}
                onPageChange={setCouponPage}
                noun="mã giảm giá"
                disabled={loading}
              />
            </div>
          </section>
        )}

        {activeTab === 'inventory' && (
          <section className="admin-section">
            <div className="admin-card">
              <div className="admin-card-title-row">
                <div>
                  <h2>Quản lý tồn kho</h2>
                  <p className="admin-card-subtitle">
                    Chỉ điều chỉnh tồn thực tế. Có thể bán = tồn thực tế − đang giữ chỗ; giữ chỗ và đã bán được cập nhật tự động theo đơn hàng.
                  </p>
                </div>
                <div className="admin-search">
                  <input
                    value={inventorySearch}
                    onChange={(event) => {
                      setInventorySearch(event.target.value);
                      setInventoryPage(1);
                    }}
                    placeholder="Tìm sản phẩm, SKU, thương hiệu, danh mục..."
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
                          <strong>{item.productName || item.productSlug || item.productSku || 'Sản phẩm chưa xác định'}</strong>
                          <span>
                            {[item.productSku, item.variantName, item.colorName].filter(Boolean).join(' · ') || item.key}
                          </span>
                          <small>{item.key}</small>
                        </div>
                        <em className={`admin-status ${draft.status || item.status}`}>{draft.status || item.status}</em>
                      </div>

                      <div className="admin-inventory-metrics">
                        <div>
                          <span>Tồn thực tế</span>
                          <strong>{Number(draft.stock ?? item.stock ?? 0)}</strong>
                        </div>
                        <div>
                          <span>Đang giữ chỗ</span>
                          <strong>{Number(item.reservedStock || 0)}</strong>
                        </div>
                        <div>
                          <span>Có thể bán</span>
                          <strong>{Math.max(0, Number(draft.stock ?? item.stock ?? 0) - Number(item.reservedStock || 0))}</strong>
                        </div>
                        <div>
                          <span>Đã bán</span>
                          <strong>{Number(item.soldCount || 0)}</strong>
                        </div>
                      </div>

                      <div className="admin-order-controls admin-compact-controls admin-inventory-controls">
                        <label>
                          Điều chỉnh tồn thực tế
                          <input
                            type="number"
                            min={Number(item.reservedStock || 0)}
                            value={draft.stock ?? item.stock ?? 0}
                            onChange={(event) => updateInventoryDraft(item.id, 'stock', event.target.value)}
                          />
                          <small>Không thể thấp hơn số lượng đang giữ chỗ ({Number(item.reservedStock || 0)}).</small>
                        </label>
                        <label>
                          Trạng thái bán hàng
                          <select
                            value={(draft.status || item.status) === 'inactive' ? 'inactive' : 'in_stock'}
                            onChange={(event) => updateInventoryDraft(item.id, 'status', event.target.value)}
                          >
                            <option value="in_stock">Đang bán — tự tính theo số lượng</option>
                            <option value="inactive">Ngừng bán</option>
                          </select>
                        </label>
                        <label className="admin-order-note">
                          Ghi chú
                          <textarea
                            rows="2"
                            value={draft.note || ''}
                            onChange={(event) => updateInventoryDraft(item.id, 'note', event.target.value)}
                            placeholder="VD: hàng tại kho HCM, chờ nhập thêm..."
                          />
                        </label>
                        <button type="button" onClick={() => handleSaveInventory(item)}>Lưu điều chỉnh</button>
                      </div>
                    </article>
                  );
                })}
                {!inventoryItems.length && <p className="admin-empty">{loading ? 'Đang tải tồn kho...' : 'Không có sản phẩm phù hợp để quản lý tồn kho.'}</p>}
              </div>

              <AdminPagination
                pagination={inventoryPayload?.pagination}
                onPageChange={setInventoryPage}
                noun="sản phẩm"
                disabled={loading}
              />
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
                    onChange={(event) => {
                      setReturnSearch(event.target.value);
                      setReturnPage(1);
                    }}
                    placeholder="Tìm mã đổi trả, mã đơn, sản phẩm, SĐT..."
                  />
                  <select
                    value={returnStatusFilter}
                    onChange={(event) => {
                      setReturnStatusFilter(event.target.value);
                      setReturnPage(1);
                    }}
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
                  onClick={() => {
                    setReturnStatusFilter('all');
                    setReturnPage(1);
                  }}
                >
                  <span>Tất cả</span>
                  <strong>{Object.values(returnsPayload?.statusCounts || {}).reduce((sum, count) => sum + Number(count || 0), 0)}</strong>
                </button>
                {returnStatusOptions.map((status) => (
                  <button
                    type="button"
                    key={status.value}
                    className={returnStatusFilter === status.value ? 'active' : ''}
                    onClick={() => {
                      setReturnStatusFilter(status.value);
                      setReturnPage(1);
                    }}
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
                          {returnStatusOptions.filter((status) => (
                            status.value === returnItem.status
                            || (returnStatusTransitions[returnItem.status] || []).includes(status.value)
                          )).map((status) => (
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
                        {['pending', 'received'].includes(returnItem.status) && (
                          <button type="button" onClick={() => handleUpdateReturnStatus(returnItem, 'approved')}>
                            Duyệt yêu cầu
                          </button>
                        )}
                        {['pending', 'received'].includes(returnItem.status) && (
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
                        <button
                          type="button"
                          className="danger ghost-danger"
                          disabled={loading || !['pending', 'cancelled'].includes(returnItem.status)}
                          title={['pending', 'cancelled'].includes(returnItem.status) ? 'Xóa yêu cầu' : 'Yêu cầu đã xử lý cần được giữ lại để đối soát'}
                          onClick={() => handleDeleteReturn(returnItem)}
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  </article>
                ))}

                {!returns.length && (
                  <div className="admin-return-empty">
                    <AdminIcon name="returns" size={32} />
                    <strong>{loading ? 'Đang tải yêu cầu đổi trả...' : 'Chưa có yêu cầu đổi trả phù hợp'}</strong>
                    {!loading && <span>Yêu cầu mới từ Smember sẽ tự động xuất hiện tại đây.</span>}
                  </div>
                )}
              </div>
              <AdminPagination
                pagination={returnsPayload?.pagination}
                onPageChange={setReturnPage}
                noun="yêu cầu"
                disabled={loading}
              />
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
                    onChange={(event) => {
                      setSupportSearch(event.target.value);
                      setSupportPage(1);
                    }}
                    placeholder="Tìm mã yêu cầu, khách hàng, email, mã đơn..."
                  />
                  <select
                    value={supportStatusFilter}
                    onChange={(event) => {
                      setSupportStatusFilter(event.target.value);
                      setSupportPage(1);
                    }}
                  >
                    <option value="all">Tất cả trạng thái</option>
                    {supportStatusOptions.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="admin-order-status-strip">
                <button
                  type="button"
                  className={supportStatusFilter === 'all' ? 'active' : ''}
                  onClick={() => {
                    setSupportStatusFilter('all');
                    setSupportPage(1);
                  }}
                >
                  Tất cả <strong>{Object.values(supportPayload?.statusCounts || {}).reduce((sum, value) => sum + Number(value || 0), 0)}</strong>
                </button>
                {supportStatusOptions.map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    className={supportStatusFilter === status.value ? 'active' : ''}
                    onClick={() => {
                      setSupportStatusFilter(status.value);
                      setSupportPage(1);
                    }}
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
                          disabled={loading || supportItem.status !== 'new'}
                          title={supportItem.status === 'new' ? 'Xóa yêu cầu' : 'Yêu cầu đã xử lý cần được giữ lại trong lịch sử'}
                          onClick={() => handleDeleteSupportRequest(supportItem)}
                        >
                          Xóa
                        </button>
                      </div>
                    </article>
                  );
                })}

                {!supportRequests.length && <p className="admin-empty">{loading ? 'Đang tải yêu cầu...' : 'Chưa có yêu cầu hỗ trợ phù hợp.'}</p>}
              </div>
              <AdminPagination
                pagination={supportPayload?.pagination}
                onPageChange={setSupportPage}
                noun="yêu cầu"
                disabled={loading}
              />
            </div>
          </section>
        )}

        {activeTab === 'revenue' && (
          <section className="admin-section">
            <div className="admin-stat-grid">
              <StatCard label="Doanh thu" value={formatMoney(revenuePayload?.summary?.revenue || 0)} tone="green" />
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
                    <em>{formatMoney(row.revenue)}</em>
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
                {!auditLogs.length && <p className="admin-empty">{loading ? 'Đang tải nhật ký...' : 'Chưa có nhật ký thao tác.'}</p>}
              </div>
              <AdminPagination
                pagination={auditLogsPayload?.pagination}
                onPageChange={setAuditPage}
                noun="sự kiện"
                disabled={loading}
              />
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
                    onChange={(event) => {
                      setBusinessSearch(event.target.value);
                      setBusinessPage(1);
                    }}
                    placeholder="Tìm công ty, MST, email, người đại diện..."
                  />
                  <select
                    value={businessStatusFilter}
                    onChange={(event) => {
                      setBusinessStatusFilter(event.target.value);
                      setBusinessPage(1);
                    }}
                  >
                    <option value="all">Tất cả trạng thái</option>
                    {businessStatusOptions.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="admin-order-status-strip">
                <button
                  type="button"
                  className={businessStatusFilter === 'all' ? 'active' : ''}
                  onClick={() => {
                    setBusinessStatusFilter('all');
                    setBusinessPage(1);
                  }}
                >
                  Tất cả <strong>{Object.values(businessPayload?.statusCounts || {}).reduce((sum, value) => sum + Number(value || 0), 0)}</strong>
                </button>
                {businessStatusOptions.map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    className={businessStatusFilter === status.value ? 'active' : ''}
                    onClick={() => {
                      setBusinessStatusFilter(status.value);
                      setBusinessPage(1);
                    }}
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
                  <p className="admin-empty">{loading ? 'Đang tải hồ sơ...' : 'Không có hồ sơ doanh nghiệp phù hợp.'}</p>
                )}
              </div>
              <AdminPagination
                pagination={businessPayload?.pagination}
                onPageChange={setBusinessPage}
                noun="hồ sơ"
                disabled={loading}
              />
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
                    onChange={(event) => {
                      setUserSearch(event.target.value);
                      setUserPage(1);
                    }}
                    placeholder="Tìm tên, email, số điện thoại..."
                  />
                </div>
              </div>

              <div className="admin-users-table">
                {users.map((user) => {
                  const isCurrentUser = String(user.id) === String(currentUser?.id || currentUser?._id || '');
                  return (
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
                      {isCurrentUser && <em className="verified">Bạn</em>}
                      <em className={user.status === 'blocked' ? 'blocked' : 'active'}>
                        {user.status || 'active'}
                      </em>
                      {user.emailVerified && <em className="verified">verified</em>}
                    </div>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        disabled={loading || (isCurrentUser && user.status !== 'blocked')}
                        onClick={() => handleUpdateUser(user, {
                          status: user.status === 'blocked' ? 'active' : 'blocked',
                        })}
                      >
                        {user.status === 'blocked' ? 'Mở khóa' : 'Khóa'}
                      </button>
                      <button
                        type="button"
                        disabled={loading || (isCurrentUser && user.role === 'admin')}
                        onClick={() => handleUpdateUser(user, {
                          role: user.role === 'admin' ? 'customer' : 'admin',
                        })}
                      >
                        {user.role === 'admin' ? 'Gỡ admin' : 'Lên admin'}
                      </button>
                      <button type="button" className="danger" disabled={loading || isCurrentUser} onClick={() => handleDeleteUser(user)}>
                        Xóa
                      </button>
                    </div>
                  </div>
                  );
                })}
                {!users.length && <p className="admin-empty">{loading ? 'Đang tải người dùng...' : 'Chưa có người dùng phù hợp.'}</p>}
              </div>
              <AdminPagination
                pagination={usersPayload?.pagination}
                onPageChange={setUserPage}
                noun="người dùng"
                disabled={loading}
              />
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
                    onChange={(event) => {
                      setQuestionSearch(event.target.value);
                      setQuestionPage(1);
                    }}
                    placeholder="Tìm sản phẩm, khách, câu hỏi..."
                  />
                </div>
              </div>

              <div className="admin-interaction-list">
                {questions.map((question) => (
                  <details className="admin-interaction-row" key={question.id}>
                    <summary className="admin-interaction-summary">
                      <div className="admin-interaction-head">
                        <div>
                          <strong>{question.productName || question.productSlug}</strong>
                          <span>{question.authorName || question.email || 'Khách hàng'} · {formatDate(question.createdAt)}</span>
                        </div>
                        <em className={`admin-status ${question.status}`}>{question.status}</em>
                      </div>
                      <p className="admin-interaction-content">{question.question}</p>
                    </summary>
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
                  </details>
                ))}
                {!questions.length && <p className="admin-empty">{loading ? 'Đang tải câu hỏi...' : 'Chưa có câu hỏi phù hợp.'}</p>}
              </div>
              <AdminPagination
                pagination={questionsPayload?.pagination}
                onPageChange={setQuestionPage}
                noun="câu hỏi"
                disabled={loading}
              />
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
                    onChange={(event) => {
                      setReviewSearch(event.target.value);
                      setReviewPage(1);
                    }}
                    placeholder="Tìm sản phẩm, khách, nội dung..."
                  />
                </div>
              </div>

              <div className="admin-interaction-list">
                {reviews.map((review) => (
                  <details className="admin-interaction-row" key={review.id}>
                    <summary className="admin-interaction-summary">
                      <div className="admin-interaction-head">
                        <div>
                          <strong>{review.productName || review.productSlug}</strong>
                          <span>{review.authorName || review.email || 'Khách hàng'} · {formatDate(review.createdAt)}</span>
                        </div>
                        <em className={`admin-status ${review.status}`}>{review.rating}★ · {review.status}</em>
                      </div>
                      <p className="admin-interaction-content">{review.content}</p>
                    </summary>
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
                  </details>
                ))}
                {!reviews.length && <p className="admin-empty">{loading ? 'Đang tải đánh giá...' : 'Chưa có đánh giá phù hợp.'}</p>}
              </div>
              <AdminPagination
                pagination={reviewsPayload?.pagination}
                onPageChange={setReviewPage}
                noun="đánh giá"
                disabled={loading}
              />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
