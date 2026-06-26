import { useEffect, useMemo, useState } from 'react';
import {
  createAdminProduct,
  deleteAdminProduct,
  deleteAdminUser,
  fetchAdminProducts,
  fetchAdminSummary,
  fetchAdminUsers,
  updateAdminProduct,
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
  const [productsPayload, setProductsPayload] = useState(null);
  const [usersPayload, setUsersPayload] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [editingProduct, setEditingProduct] = useState(null);

  const products = productsPayload?.data || [];
  const users = usersPayload?.data || [];
  const stats = summary?.cards || {};
  const isAdmin = currentUser?.role === 'admin';
  const adminName = currentUser?.fullName || currentUser?.email || currentUser?.username || 'Quản trị viên';

  const tabs = useMemo(() => [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'products', label: 'Sản phẩm' },
    { id: 'users', label: 'Người dùng' },
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
  }, [activeTab, isAdmin, productSearch, refreshTick, userSearch]);

  const refresh = () => setRefreshTick((value) => value + 1);

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
              <StatCard label="Tổng người dùng" value={stats.totalUsers} />
              <StatCard label="User active" value={stats.activeUsers} tone="green" />
              <StatCard label="User bị khóa" value={stats.blockedUsers} tone="orange" />
              <StatCard label="OTP đang chờ" value={stats.pendingOtps} tone="blue" />
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
      </main>
    </div>
  );
}
