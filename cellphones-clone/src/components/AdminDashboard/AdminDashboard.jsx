import { useEffect, useMemo, useState } from 'react';
import {
  createAdminProduct,
  deleteAdminProduct,
  deleteAdminQuestion,
  deleteAdminReview,
  deleteAdminUser,
  fetchAdminOrders,
  fetchAdminProducts,
  fetchAdminQuestions,
  fetchAdminReviews,
  fetchAdminSummary,
  fetchAdminUsers,
  updateAdminOrder,
  updateAdminProduct,
  updateAdminQuestion,
  updateAdminReview,
  updateAdminUser,
} from '../../services/apiAdmin';
import { clearAuthSession } from '../../services/apiAuth';
import './AdminDashboard.css';

const emptyProductForm = {
  name: '',
  slug: '',
  sku: '',
  brand: '',
  currentPrice: '',
  originalPrice: '',
  categories: '',
  primaryImage: '',
  description: '',
};

const orderStatusOptions = [
  { value: 'pending', label: 'Chờ xác nhận' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'packing', label: 'Đang chuẩn bị hàng' },
  { value: 'ready_for_pickup', label: 'Sẵn sàng nhận tại cửa hàng' },
  { value: 'shipping', label: 'Đang giao hàng' },
  { value: 'completed', label: 'Đã hoàn tất' },
  { value: 'cancelled', label: 'Đã hủy' },
];

const paymentStatusOptions = [
  { value: 'unpaid', label: 'Chưa thanh toán' },
  { value: 'paid', label: 'Đã thanh toán' },
  { value: 'refunded', label: 'Đã hoàn tiền' },
  { value: 'failed', label: 'Thanh toán lỗi' },
];

function formatCurrency(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return 'Liên hệ';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(value) {
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

function productToForm(product) {
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
  };
}

function buildProductPayload(form) {
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
    availability: { status: 'InStock', raw: 'Còn hàng' },
  };
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

  const orders = ordersPayload?.data || [];
  const products = productsPayload?.data || [];
  const users = usersPayload?.data || [];
  const questions = questionsPayload?.data || [];
  const reviews = reviewsPayload?.data || [];
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
  ], []);

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
          const data = await fetchAdminProducts({
            q: productSearch.trim(),
            include: 'details',
          });
          if (!ignore) setProductsPayload(data);
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
  }, [activeTab, isAdmin, orderSearch, orderStatusFilter, productSearch, questionSearch, refreshTick, reviewSearch, userSearch]);

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

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setProductForm(productToForm(product));
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
      if (editingProduct) {
        await updateAdminProduct(editingProduct.mongoId || editingProduct.id || editingProduct.slug, payload);
        setMessage('Đã cập nhật sản phẩm.');
      } else {
        await createAdminProduct(payload);
        setMessage('Đã thêm sản phẩm mới.');
      }
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

              <label>
                Ảnh chính
                <input
                  value={productForm.primaryImage}
                  onChange={(event) => updateProductField('primaryImage', event.target.value)}
                  placeholder="https://..."
                />
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
                {products.map((product) => (
                  <div className="admin-product-row" key={product.id}>
                    <img src={product.thumbnail || product.primaryImage || product.image} alt="" />
                    <div>
                      <strong>{product.name}</strong>
                      <span>{product.sku || product.slug} · {product.brand || '—'}</span>
                      <em>{formatCurrency(product.currentPrice)}</em>
                    </div>
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => handleEditProduct(product)}>Sửa</button>
                      <button type="button" className="danger" onClick={() => handleDeleteProduct(product)}>Xóa</button>
                    </div>
                  </div>
                ))}
                {!products.length && <p className="admin-empty">Không có sản phẩm phù hợp.</p>}
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
