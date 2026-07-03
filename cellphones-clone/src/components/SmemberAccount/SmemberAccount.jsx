import { useEffect, useMemo, useState } from 'react';
import { formatPrice } from '../../data/mockData';
import { fetchMyOrders } from '../../services/apiOrders';
import './SmemberAccount.css';

const statusLabels = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  packing: 'Đang chuẩn bị hàng',
  ready_for_pickup: 'Sẵn sàng nhận tại cửa hàng',
  shipping: 'Đang giao hàng',
  completed: 'Đã hoàn tất',
  cancelled: 'Đã hủy',
};

const menuItems = [
  { id: 'overview', label: 'Tổng quan', icon: '⌂' },
  { id: 'orders', label: 'Lịch sử mua hàng', icon: '▤' },
  { id: 'profile', label: 'Thông tin tài khoản', icon: '⚙' },
  { id: 'addresses', label: 'Sổ địa chỉ', icon: '⌖' },
  { id: 'warranty', label: 'Tra cứu bảo hành', icon: '♙' },
  { id: 'support', label: 'Góp ý - Phản hồi - Hỗ trợ', icon: '✉' },
];

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

function getOrderQuantity(order) {
  return Number(order?.totals?.quantity || 0)
    || (order?.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
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
                  <small>{formatDate(item.changedAt)}</small>
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

export default function SmemberAccount({ currentUser, onGoLogin, onGoHome, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser) return undefined;

    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetchMyOrders(controller.signal)
      .then(setOrders)
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError.message || 'Không thể tải lịch sử đơn hàng.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [currentUser]);

  const stats = useMemo(() => {
    const totalSpent = orders.reduce((sum, order) => sum + getOrderTotal(order), 0);
    return {
      totalOrders: orders.length,
      totalSpent,
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
            <p>Lịch sử mua hàng và trạng thái đơn chỉ hiển thị cho tài khoản đã đăng nhập.</p>
            <button type="button" onClick={onGoLogin}>Đăng nhập ngay</button>
          </div>
        </div>
      </section>
    );
  }

  const displayName = currentUser.fullName || currentUser.username || currentUser.email || 'Khách hàng CellphoneS';

  return (
    <section className="smember-account-page">
      <div className="container smember-account-container">
        <div className="smember-profile-hero">
          <div className="smember-profile-main">
            <div className="smember-avatar">
              <img src="https://cellphones.com.vn/media/wysiwyg/ant-smile.png" alt="" />
            </div>
            <div>
              <h1>{displayName}</h1>
              <p>{maskPhone(currentUser.phone)}</p>
              <div className="smember-badges">
                <span>S-NEW</span>
                <span>{currentUser.customerType === 'student' ? 'S-Student' : 'Smember'}</span>
              </div>
              <small>Cập nhật tài khoản từ MongoDB Smember.</small>
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
          {['Hạng thành viên', 'Mã giảm giá', 'Lịch sử mua hàng', 'Sổ địa chỉ', 'S-Student & S-Teacher', 'Liên kết tài khoản'].map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setActiveTab(item === 'Lịch sử mua hàng' ? 'orders' : item === 'Sổ địa chỉ' ? 'addresses' : 'overview')}
            >
              {item}
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
            {loading && <div className="smember-alert">Đang tải dữ liệu tài khoản từ MongoDB...</div>}

            {activeTab === 'overview' && (
              <>
                <div className="smember-info-banners">
                  <div>
                    <span>ⓘ</span>
                    Đăng ký Tân sinh viên để nhận mã giảm giá đến 10%.
                    <button type="button">Đăng ký ngay</button>
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

                  <div className="smember-panel smember-voucher-panel">
                    <h2>Ưu đãi của bạn</h2>
                    <div className="smember-voucher">
                      <span>🎁</span>
                      <div>
                        <strong>Mừng sinh nhật khách Snew</strong>
                        <p>Giảm 50.000đ cho đơn từ 100.000đ</p>
                        <small>HSD: 23:59 08/07/2026</small>
                      </div>
                    </div>
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
                {orders.length ? (
                  orders.map((order) => <OrderCard order={order} key={order.id || order.orderCode} />)
                ) : (
                  <p className="smember-empty">Chưa có đơn hàng trong tài khoản này.</p>
                )}
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="smember-panel">
                <h2>Thông tin tài khoản</h2>
                <dl className="smember-profile-fields">
                  <dt>Họ và tên</dt>
                  <dd>{displayName}</dd>
                  <dt>Số điện thoại</dt>
                  <dd>{currentUser.phone || 'Chưa cập nhật'}</dd>
                  <dt>Email</dt>
                  <dd>{currentUser.email || 'Chưa cập nhật'}</dd>
                  <dt>Loại tài khoản</dt>
                  <dd>{currentUser.customerType || 'normal'}</dd>
                  <dt>Vai trò</dt>
                  <dd>{currentUser.role || 'customer'}</dd>
                </dl>
                <p className="smember-note">
                  Admin có thể kiểm tra, khóa/mở khóa và nâng quyền tài khoản này trong tab Người dùng của dashboard.
                </p>
              </div>
            )}

            {activeTab === 'addresses' && (
              <div className="smember-panel">
                <h2>Sổ địa chỉ</h2>
                <p className="smember-empty">Địa chỉ sẽ được tự động ghi nhận từ các đơn hàng đã đặt.</p>
                {orders.slice(0, 5).map((order) => (
                  <div className="smember-address-row" key={`address-${order.id || order.orderCode}`}>
                    <strong>{order.receiver?.fullName || order.customer?.fullName}</strong>
                    <span>{order.shippingAddress?.fullAddress || [
                      order.shippingAddress?.addressLine,
                      order.shippingAddress?.ward,
                      order.shippingAddress?.district,
                      order.shippingAddress?.province,
                    ].filter(Boolean).join(', ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
