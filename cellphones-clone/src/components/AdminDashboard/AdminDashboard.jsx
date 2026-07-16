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
  deleteAdminUser,
  fetchAdminAuditLogs,
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
  fetchAdminUsers,
  updateAdminCoupon,
  updateAdminInventory,
  updateAdminOrder,
  updateAdminPayment,
  updateAdminProduct,
  updateAdminQuestion,
  updateAdminReturn,
  updateAdminReview,
  updateAdminShipment,
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

function StatCard({ label, value, tone }) {
  return (
    <div className={`admin-stat-card ${tone || ''}`}>
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
    </div>
  );
}

export default function AdminDashboard({ currentUser, onBackHome, onLogout, onGoLogin }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [summary, setSummary] = useState(null);
  const [ordersPayload, setOrdersPayload] = useState(null);
  const [productsPayload, setProductsPayload] = useState(null);
  const [usersPayload, setUsersPayload] = useState(null);
  const [questionsPayload, setQuestionsPayload] = useState(null);
  const [reviewsPayload, setReviewsPayload] = useState(null);
  const [couponsPayload, setCouponsPayload] = useState(null);
  const [inventoryPayload, setInventoryPayload] = useState(null);
  const [paymentsPayload, setPaymentsPayload] = useState(null);
  const [shipmentsPayload, setShipmentsPayload] = useState(null);
  const [returnsPayload, setReturnsPayload] = useState(null);
  const [revenuePayload, setRevenuePayload] = useState(null);
  const [auditLogsPayload, setAuditLogsPayload] = useState(null);

  const [couponSearch, setCouponSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [shipmentSearch, setShipmentSearch] = useState('');
  const [returnSearch, setReturnSearch] = useState('');
  const [returnNotes, setReturnNotes] = useState({});
  const [inventoryDrafts, setInventoryDrafts] = useState({});
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [shipmentDrafts, setShipmentDrafts] = useState({});
  const [productSearch, setProductSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderNotes, setOrderNotes] = useState({});
  const [userSearch, setUserSearch] = useState('');
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
  const questions = questionsPayload?.data || [];
  const reviews = reviewsPayload?.data || [];
  const coupons = couponsPayload?.data || [];
  const inventoryItems = inventoryPayload?.data || [];
  const payments = paymentsPayload?.data || [];
  const shipments = shipmentsPayload?.data || [];
  const returns = returnsPayload?.data || [];
  const auditLogs = auditLogsPayload?.data || [];
  const stats = summary?.cards || {};
  const isAdmin = currentUser?.role === 'admin';
  const adminName = currentUser?.fullName || currentUser?.email || currentUser?.username || 'Quản trị viên';

  const tabs = useMemo(() => [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'orders', label: 'Đơn hàng' },
    { id: 'products', label: 'Sản phẩm' },
    { id: 'users', label: 'Người dùng' },
    { id: 'questions', label: 'Hỏi đáp' },
    { id: 'reviews', label: 'Đánh giá' },
    { id: 'coupons', label: 'Mã giảm giá' },
    { id: 'inventory', label: 'Tồn kho' },
    { id: 'payments', label: 'Thanh toán' },
    { id: 'shipments', label: 'Vận chuyển' },
    { id: 'returns', label: 'Đổi trả' },
    { id: 'revenue', label: 'Doanh thu' },
    { id: 'audit', label: 'Nhật ký' },
  ], []);

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
            limit: 50,
          });
          if (!ignore) {
            setReturnsPayload(data);
            setReturnNotes(Object.fromEntries(
              (data.data || []).map((item) => [item.id, item.adminNote || ''])
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
    couponSearch,
    inventorySearch,
    paymentSearch,
    shipmentSearch,
    returnSearch,
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
      setMessage('Đã chọn ảnh sản phẩm. Bấm Thêm/Lưu để lưu vào MongoDB.');
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
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await updateAdminReturn(returnItem.id || returnItem.returnCode, {
        status,
        adminNote: returnNotes[returnItem.id] || '',
      });
      setMessage('Đã cập nhật yêu cầu đổi trả.');
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
        adminNote: returnNotes[returnItem.id] || '',
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
              <span>Role: {currentUser.role || 'customer'}</span>
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
      <aside className="admin-sidebar">
        <a className="admin-logo" href="/" onClick={(event) => {
          event.preventDefault();
          onBackHome();
        }}>
          <img
            src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/Logo/Logo_CPS.png"
            alt="CellphoneS"
          />
          <span>Admin</span>
        </a>

        <nav className="admin-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="admin-session-card">
          <span>Đang dùng</span>
          <strong>{adminName}</strong>
          <small>{currentUser?.role ? `Role: ${currentUser.role}` : 'Local admin mode'}</small>
          <button type="button" onClick={handleLogout}>Đăng xuất</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topline">
          <div>
            <p>CellphoneS Clone</p>
            <h1>Trang quản trị tổng</h1>
          </div>
          <div className="admin-topline-actions">
            <button type="button" onClick={refresh} disabled={loading}>
              {loading ? 'Đang tải...' : 'Làm mới'}
            </button>
            <button type="button" className="outline" onClick={onBackHome}>
              Về trang chủ
            </button>
          </div>
        </header>

        {message && <div className="admin-alert success">{message}</div>}
        {error && <div className="admin-alert error">{error}</div>}

        {activeTab === 'dashboard' && (
          <section className="admin-section">
            <div className="admin-stat-grid">
              <StatCard label="Tổng sản phẩm" value={stats.totalProducts} />
              <StatCard label="Tổng đơn hàng" value={stats.totalOrders} tone="green" />
              <StatCard label="Đơn cần xử lý" value={stats.pendingOrders} tone="orange" />
              <StatCard label="Đang giao" value={stats.shippingOrders} tone="blue" />
              <StatCard label="Tổng người dùng" value={stats.totalUsers} />
              <StatCard label="User active" value={stats.activeUsers} tone="green" />
              <StatCard label="User bị khóa" value={stats.blockedUsers} tone="orange" />
              <StatCard label="OTP đang chờ" value={stats.pendingOtps} tone="blue" />
              <StatCard label="Đánh giá" value={stats.totalReviews} tone="green" />
              <StatCard label="Câu hỏi chờ" value={stats.pendingQuestions} tone="orange" />
            </div>

            <div className="admin-two-columns">
              <div className="admin-card">
                <h2>Người dùng mới</h2>
                <div className="admin-list">
                  {(summary?.recentUsers || []).map((user) => (
                    <div className="admin-list-row" key={user.id}>
                      <div>
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
                <h2>Sản phẩm cập nhật gần đây</h2>
                <div className="admin-list">
                  {(summary?.recentProducts || []).map((product) => (
                    <div className="admin-list-row" key={product.id}>
                      <div>
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
                <small>Ảnh chọn từ máy sẽ được tự nén rồi lưu vào MongoDB trong field primaryImage/images.</small>
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
                <p>Chọn một hoặc nhiều nhóm. Điều kiện được kiểm tra lại ở backend khi thanh toán.</p>
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
            <div className="admin-card">
              <div className="admin-card-title-row">
                <div>
                  <h2>Quản lý đổi trả</h2>
                  <p className="admin-card-subtitle">
                    Tiếp nhận, duyệt, từ chối hoặc hoàn tất yêu cầu đổi trả của khách hàng.
                  </p>
                </div>
                <div className="admin-search">
                  <input
                    value={returnSearch}
                    onChange={(event) => setReturnSearch(event.target.value)}
                    placeholder="Tìm mã đổi trả, mã đơn, sản phẩm, SĐT..."
                  />
                </div>
              </div>

              <div className="admin-order-list">
                {returns.map((returnItem) => (
                  <article className="admin-order-row" key={returnItem.id || returnItem.returnCode}>
                    <div className="admin-order-head">
                      <div>
                        <strong>#{returnItem.returnCode}</strong>
                        <span>Đơn hàng #{returnItem.orderCode} · {formatDate(returnItem.createdAt)}</span>
                      </div>
                      <em className={`admin-status ${returnItem.status}`}>{returnItem.statusLabel || returnItem.status}</em>
                    </div>

                    <div className="admin-order-body">
                      <div>
                        <strong>{returnItem.productName || returnItem.productSlug || 'Sản phẩm đổi trả'}</strong>
                        <span>SĐT khách: {returnItem.customerPhone || '—'}</span>
                        <span>Lý do: {returnItem.reason || '—'}</span>
                        {returnItem.note && <span>Ghi chú khách: {returnItem.note}</span>}
                      </div>
                    </div>

                    <div className="admin-order-controls">
                      <label>
                        Trạng thái đổi trả
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
                        Ghi chú admin
                        <textarea
                          value={returnNotes[returnItem.id] || ''}
                          onChange={(event) => setReturnNotes((previous) => ({
                            ...previous,
                            [returnItem.id]: event.target.value,
                          }))}
                          rows="2"
                          placeholder="VD: Đã gọi khách, chờ gửi sản phẩm về..."
                        />
                      </label>

                      <button type="button" onClick={() => handleUpdateReturnStatus(returnItem, 'approved')}>
                        Duyệt
                      </button>
                      <button type="button" onClick={() => handleUpdateReturnStatus(returnItem, 'rejected')}>
                        Từ chối
                      </button>
                      <button type="button" onClick={() => handleUpdateReturnStatus(returnItem, 'completed')}>
                        Hoàn tất
                      </button>
                      <button type="button" onClick={() => handleSaveReturnNote(returnItem)}>
                        Lưu ghi chú
                      </button>

                      <button type="button" className="danger" onClick={() => handleDeleteReturn(returnItem)}>
                        Xóa
                      </button>
                    </div>
                  </article>
                ))}

                {!returns.length && <p className="admin-empty">Chưa có yêu cầu đổi trả.</p>}
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
