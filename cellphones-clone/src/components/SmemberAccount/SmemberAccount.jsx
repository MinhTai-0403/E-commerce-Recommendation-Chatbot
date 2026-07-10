import { useEffect, useMemo, useState } from 'react';
import { formatPrice } from '../../data/mockData';
import { changeSmemberPassword, updateCurrentSmember } from '../../services/apiAuth';
import {
  createCustomerAddress,
  deleteCustomerAddress,
  fetchCustomerAddresses,
  fetchCustomerInvoices,
  fetchCustomerNotifications,
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

const menuItems = [
  { id: 'overview', label: 'Tổng quan', icon: '⌂' },
  { id: 'orders', label: 'Lịch sử mua hàng', icon: '▤' },
  { id: 'profile', label: 'Thông tin tài khoản', icon: '⚙' },
  { id: 'addresses', label: 'Sổ địa chỉ', icon: '⌖' },
  { id: 'wishlist', label: 'Sản phẩm yêu thích', icon: '♡' },
  { id: 'notifications', label: 'Thông báo', icon: '✉' },
  { id: 'warranty', label: 'Tra cứu bảo hành', icon: '♙' },
  { id: 'invoices', label: 'Hóa đơn điện tử', icon: '▧' },
  { id: 'support', label: 'Góp ý - Phản hồi - Hỗ trợ', icon: '✉' },
];

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

function getOrderTotal(order) {
  return Number(order?.totals?.total || order?.totals?.roundedTotal || 0);
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

function OrderCard({ order }) {
  const [expanded, setExpanded] = useState(false);
  const firstItem = order.items?.[0] || {};
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

  return (
    <article className="smember-order-card">
      <div className="smember-order-top">
        <div>
          <span>Đơn hàng: <strong>#{order.orderCode}</strong></span>
          <span>Ngày đặt hàng: <strong>{formatDate(order.createdAt)}</strong></span>
        </div>
        <em className={`smember-order-status ${order.status || 'pending'}`}>
          {order.statusLabel || statusLabels[order.status] || order.status}
        </em>
      </div>

      <div className="smember-order-main">
        <img src={firstItem.image || firstItem.thumbnail || firstItem.primaryImage} alt="" />
        <div>
          <strong>{firstItem.name || 'Đơn hàng CellphoneS'}</strong>
          <span>{getOrderQuantity(order)} sản phẩm · {order.shippingChoice?.label || 'COD'}</span>
          <small>{address || 'Địa chỉ nhận hàng sẽ được cập nhật khi xử lý đơn.'}</small>
        </div>
        <div className="smember-order-total">
          <span>Tổng thanh toán</span>
          <strong>{formatPrice(getOrderTotal(order))}</strong>
          <button type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Thu gọn' : 'Xem chi tiết'} ›
          </button>
        </div>
      </div>

      {expanded && (
        <div className="smember-order-detail">
          <div className="smember-order-items">
            {(order.items || []).map((item) => (
              <div key={item.id || item.slug || item.name}>
                <span>{item.name}</span>
                <strong>{item.quantity || 1} × {formatPrice(item.price || item.currentPrice)}</strong>
              </div>
            ))}
          </div>
          <div className="smember-status-timeline">
            {history.map((item, index) => (
              <div className="smember-status-node" key={`${order.id}-${item.status}-${index}`}>
                <span />
                <div>
                  <strong>{item.label || statusLabels[item.status] || item.status}</strong>
                  <small>{formatDate(item.changedAt || item.time)}</small>
                  {item.note && <p>{item.note}</p>}
                </div>
              </div>
            ))}
          </div>
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
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [orders, setOrders] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [warranties, setWarranties] = useState([]);
  const [invoices, setInvoices] = useState([]);
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
      fetchCustomerWarranties(),
      fetchCustomerInvoices(),
    ])
      .then((results) => {
        if (controller.signal.aborted) return;
        const [ordersResult, addressesResult, wishlistResult, notificationsResult, warrantiesResult, invoicesResult] = results;
        if (ordersResult.status === 'fulfilled') setOrders(ordersResult.value);
        if (addressesResult.status === 'fulfilled') setAddresses(addressesResult.value);
        if (wishlistResult.status === 'fulfilled') setWishlist(wishlistResult.value);
        if (notificationsResult.status === 'fulfilled') setNotifications(notificationsResult.value);
        if (warrantiesResult.status === 'fulfilled') setWarranties(warrantiesResult.value);
        if (invoicesResult.status === 'fulfilled') setInvoices(invoicesResult.value);

        const rejected = results.find((item) => item.status === 'rejected');
        if (rejected) setError(rejected.reason?.message || 'Không thể tải đầy đủ dữ liệu tài khoản.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [currentUser]);

  const stats = useMemo(() => {
    const eligibleOrders = orders.filter(isOrderEligibleForMemberStats);
    const totalSpent = eligibleOrders.reduce((sum, order) => sum + getOrderTotal(order), 0);
    const totalOrders = eligibleOrders.length;
    const points = Math.floor(totalSpent / 100000);
    const memberRank = getRankLabel(totalSpent >= 20000000 ? 'S-VIP' : totalSpent >= 3000000 ? 'S-MEM' : 'S-NEW');

    return {
      totalOrders,
      totalSpent,
      points,
      memberRank,
      recentOrders: orders.slice(0, 3),
    };
  }, [orders]);

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

  const handleAvatarFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError('');
    setSuccess('');

    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      if (!dataUrl) return;
      setProfileForm((form) => ({ ...form, avatar: dataUrl }));
      setSuccess('Đã chọn ảnh avatar. Bấm Lưu thông tin để lưu vào MongoDB.');
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
                <span>{currentUser.customerType === 'student' ? 'S-Student' : 'Smember'}</span>
              </div>
              <small>{stats.points.toLocaleString('vi-VN')} điểm tích lũy từ đơn hàng.</small>
            </div>
          </div>

          <div className="smember-profile-stat">
            <span>🛒</span>
            <strong>{stats.totalOrders}</strong>
            <p>Tổng số đơn hàng đã mua</p>
          </div>

          <div className="smember-profile-stat money">
            <span>₫</span>
            <strong>{formatPrice(stats.totalSpent)}</strong>
            <p>Tổng tiền tích lũy</p>
          </div>

          <div className="smember-channel-card">
            <p>Bạn đang ở kênh thành viên</p>
            <strong>CellphoneS</strong>
            <span>cellphones.com.vn</span>
          </div>
        </div>

        <div className="smember-top-tabs">
          {[
            ['overview', 'Hạng thành viên'],
            ['orders', 'Lịch sử mua hàng'],
            ['addresses', 'Sổ địa chỉ'],
            ['wishlist', 'Yêu thích'],
            ['profile', 'Liên kết tài khoản'],
          ].map(([id, label]) => (
            <button type="button" key={id} onClick={() => setActiveTab(id)}>
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
                className={activeTab === item.id ? 'active' : ''}
                onClick={() => setActiveTab(item.id)}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
            <button type="button" className="logout" onClick={onLogout}>
              <span>↪</span>
              Đăng xuất
            </button>
          </aside>

          <div className="smember-content">
            {error && <div className="smember-alert error">{error}</div>}
            {success && <div className="smember-alert success">{success}</div>}
            {loading && <div className="smember-alert">Đang tải dữ liệu tài khoản từ MongoDB...</div>}

            {activeTab === 'overview' && (
              <>
                <div className="smember-info-banners">
                  <div>
                    <span>ⓘ</span>
                    Hạng hiện tại của bạn là <strong>{stats.memberRank}</strong>. Mã giảm giá chỉ áp dụng khi nhập ở bước thanh toán.
                    <button type="button" onClick={() => setActiveTab('orders')}>Xem đơn hàng</button>
                  </div>
                  <div>
                    <span>ⓘ</span>
                    Thêm địa chỉ để đặt đơn hàng nhanh hơn.
                    <button type="button" onClick={() => setActiveTab('addresses')}>Thêm địa chỉ</button>
                  </div>
                </div>

                <div className="smember-overview-grid">
                  <div className="smember-panel">
                    <div className="smember-panel-head">
                      <h2>Đơn hàng gần đây</h2>
                      <button type="button" onClick={() => setActiveTab('orders')}>Xem tất cả ›</button>
                    </div>
                    {stats.recentOrders.length ? (
                      stats.recentOrders.map((order) => <OrderCard order={order} key={order.id || order.orderCode} />)
                    ) : (
                      <p className="smember-empty">Bạn chưa có đơn hàng nào.</p>
                    )}
                  </div>
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
                  <OrderCard order={order} key={order.id || order.orderCode} />
                )) : <p className="smember-empty">Chưa có đơn hàng trong tài khoản này.</p>}
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
                        <small>
                          Khi chọn ảnh từ máy, hệ thống tự nén ảnh rồi lưu vào MongoDB. Chuỗi base64 sẽ không hiện trong ô nhập.
                        </small>
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
