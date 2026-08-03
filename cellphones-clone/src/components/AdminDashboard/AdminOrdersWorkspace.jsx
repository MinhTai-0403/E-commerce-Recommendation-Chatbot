import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAdminOrders, updateAdminOrder } from '../../services/apiAdmin';
import {
  formatCurrency,
  formatDate,
  orderStatusOptions,
  paymentStatusOptions,
  shipmentStatusOptions,
} from './adminDashboardUtils';
import './AdminOrdersWorkspace.css';

const PAGE_SIZE = 20;
const BULK_SAFE_STATUSES = new Set(['confirmed', 'packing', 'ready_for_pickup', 'cancelled']);
const SHIPMENT_TRANSITIONS = {
  pending: ['ready', 'shipping', 'cancelled'],
  ready: ['shipping', 'delivered', 'cancelled'],
  shipping: ['delivered', 'failed', 'cancelled', 'returned'],
  failed: ['ready', 'shipping', 'cancelled', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

const ORDER_ACTION_LABELS = {
  confirmed: 'Xác nhận đơn',
  packing: 'Bắt đầu chuẩn bị',
  ready_for_pickup: 'Sẵn sàng nhận',
  shipping: 'Bàn giao vận chuyển',
  completed: 'Xác nhận hoàn tất',
  cancelled: 'Hủy đơn',
};

const STATUS_LABELS = Object.fromEntries(orderStatusOptions.map((item) => [item.value, item.label]));
const PAYMENT_LABELS = Object.fromEntries(paymentStatusOptions.map((item) => [item.value, item.label]));
const SHIPMENT_LABELS = Object.fromEntries(shipmentStatusOptions.map((item) => [item.value, item.label]));

function isPickupOrder(order = {}) {
  return /nhận tại cửa hàng|pickup|store/i.test([
    order.shippingChoice?.label,
    order.shippingChoice?.method,
    order.shippingChoice?.type,
  ].filter(Boolean).join(' '));
}

function getOrderAddress(order = {}) {
  return order.shippingAddress?.fullAddress || [
    order.shippingAddress?.addressLine,
    order.shippingAddress?.ward,
    order.shippingAddress?.district,
    order.shippingAddress?.province,
  ].filter(Boolean).join(', ');
}

function getOrderQuantity(order = {}) {
  return Number(order.totals?.quantity) || (order.items || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
}

function getAgeLabel(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time)) return 'Không rõ thời gian';
  const hours = Math.max(0, Math.round((Date.now() - time) / 3_600_000));
  if (hours < 1) return 'Vừa tạo';
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function buildOrderDraft(order = {}) {
  return {
    adminNote: order.adminNote || '',
    paymentStatus: order.paymentStatus || order.payment?.status || 'unpaid',
    bankReference: order.payment?.bankReference || '',
    paymentNote: order.payment?.adminNote || '',
    carrier: order.shippingChoice?.carrier || '',
    trackingCode: order.shippingChoice?.trackingCode || '',
    shipmentStatus: order.shippingChoice?.shipmentStatus || 'pending',
    shippingNote: order.shippingChoice?.adminNote || '',
  };
}

function ProductThumb({ item = {} }) {
  const [failedSource, setFailedSource] = useState('');
  const source = item.image || item.thumbnail || item.primaryImage || '';
  const malformedCatalogRoot = /\/media\/catalog\/product\/?$/i.test(source);

  if (!source || source === failedSource || malformedCatalogRoot) {
    return <span className="admin-order-product-fallback">SP</span>;
  }

  return <img src={source} alt="" onError={() => setFailedSource(source)} />;
}

function StatusBadge({ type = 'order', value = '' }) {
  const labels = type === 'payment'
    ? PAYMENT_LABELS
    : type === 'shipment'
      ? SHIPMENT_LABELS
      : STATUS_LABELS;
  return (
    <span className={`admin-order-badge ${type} ${value || 'unknown'}`}>
      {labels[value] || value || 'Chưa xác định'}
    </span>
  );
}

function OrderAttention({ flags = [], compact = false }) {
  if (!flags.length) return compact ? null : <p className="admin-order-clean">Không phát hiện bất thường.</p>;

  return (
    <div className={`admin-order-attention ${compact ? 'compact' : ''}`}>
      {flags.map((flag) => (
        <span className={flag.severity || 'warning'} key={flag.code}>{flag.label}</span>
      ))}
    </div>
  );
}

export default function AdminOrdersWorkspace() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [shipmentStatus, setShipmentStatus] = useState('all');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [detailTab, setDetailTab] = useState('overview');
  const [draft, setDraft] = useState({});
  const [dirtySections, setDirtySections] = useState({});
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const selectedOrderIdRef = useRef('');
  const dirtyRef = useRef(false);
  const dirty = Object.values(dirtySections).some(Boolean);

  const orders = useMemo(() => payload?.data || [], [payload]);
  const pagination = payload?.pagination || { page: 1, total: 0, totalPages: 1 };
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchAdminOrders({
      q: search,
      status,
      paymentStatus,
      shipmentStatus,
      attention: attentionOnly ? 'true' : '',
      page,
      limit: PAGE_SIZE,
    }, controller.signal)
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError('');
        setLastSyncedAt(new Date());
        const nextOrders = data.data || [];
        const nextOrder = nextOrders.find((item) => item.id === selectedOrderIdRef.current) || nextOrders[0] || null;
        const nextOrderId = nextOrder?.id || '';
        selectedOrderIdRef.current = nextOrderId;
        setSelectedOrderId(nextOrderId);
        setSelectedIds((current) => current.filter((id) => nextOrders.some((item) => item.id === id)));
        if (!dirtyRef.current) setDraft(buildOrderDraft(nextOrder));
      })
      .catch((loadError) => {
        if (!active || loadError.name === 'AbortError') return;
        setError(loadError.message || 'Không thể tải danh sách đơn hàng.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attentionOnly, page, paymentStatus, reloadTick, search, shipmentStatus, status]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!dirty && !saving) setReloadTick((value) => value + 1);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [dirty, saving]);

  const selectedOrders = useMemo(
    () => orders.filter((order) => selectedIds.includes(order.id)),
    [orders, selectedIds],
  );
  const bulkStatusOptions = useMemo(() => {
    if (!selectedOrders.length) return [];
    return selectedOrders.reduce((shared, order, index) => {
      const next = order.nextStatuses || [];
      const safeNext = next.filter((value) => BULK_SAFE_STATUSES.has(value));
      return index === 0 ? safeNext : shared.filter((value) => safeNext.includes(value));
    }, []);
  }, [selectedOrders]);

  const updateDraft = (section, field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirtySections((current) => ({ ...current, [section]: true }));
    dirtyRef.current = true;
  };

  const refresh = () => {
    setLoading(true);
    setReloadTick((value) => value + 1);
  };

  const saveOrder = async (section, body) => {
    if (!selectedOrder) return;
    setSaving(section);
    setError('');
    setMessage('');
    try {
      await updateAdminOrder(selectedOrder.id || selectedOrder.orderCode, {
        ...body,
        expectedUpdatedAt: selectedOrder.updatedAt,
      });
      if (['note', 'payment', 'shipping'].includes(section)) {
        const nextDirtySections = { ...dirtySections, [section]: false };
        dirtyRef.current = Object.values(nextDirtySections).some(Boolean);
        setDirtySections(nextDirtySections);
      }
      setMessage('Đã lưu thay đổi và đồng bộ dữ liệu liên quan.');
      refresh();
    } catch (saveError) {
      setError(saveError.message || 'Không thể cập nhật đơn hàng.');
      if (saveError.status === 409) refresh();
    } finally {
      setSaving('');
    }
  };

  const handleOrderAction = async (nextStatus) => {
    if (!selectedOrder) return;
    const pickup = isPickupOrder(selectedOrder);
    const body = {
      status: nextStatus,
      statusNote: draft.adminNote || `Admin chuyển đơn sang ${STATUS_LABELS[nextStatus] || nextStatus}.`,
    };

    if (nextStatus === 'shipping') {
      if (!draft.carrier || !draft.trackingCode) {
        setDetailTab('operations');
        setError('Nhập đơn vị vận chuyển và mã vận đơn trước khi bàn giao.');
        return;
      }
      Object.assign(body, {
        carrier: draft.carrier,
        trackingCode: draft.trackingCode,
        shipmentStatus: 'shipping',
      });
    }
    if (nextStatus === 'completed' && !pickup) {
      if (!draft.carrier || !draft.trackingCode) {
        setDetailTab('operations');
        setError('Đơn giao tận nơi cần đủ thông tin vận đơn trước khi hoàn tất.');
        return;
      }
      Object.assign(body, {
        carrier: draft.carrier,
        trackingCode: draft.trackingCode,
        shipmentStatus: 'delivered',
      });
    }

    if (nextStatus === 'cancelled' && !window.confirm('Hủy đơn sẽ giải phóng tồn kho và hoàn lại voucher. Tiếp tục?')) return;
    await saveOrder('status', body);
  };

  const handleBulkUpdate = async () => {
    if (!bulkStatus || !selectedOrders.length) return;
    if (!window.confirm(`Cập nhật ${selectedOrders.length} đơn sang "${STATUS_LABELS[bulkStatus]}"?`)) return;
    setSaving('bulk');
    setError('');
    setMessage('');
    try {
      const results = await Promise.allSettled(selectedOrders.map((order) => updateAdminOrder(order.id || order.orderCode, {
        status: bulkStatus,
        statusNote: 'Cập nhật hàng loạt từ trang quản trị.',
        expectedUpdatedAt: order.updatedAt,
      })));
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - successCount;
      setSelectedIds([]);
      setBulkStatus('');
      if (failedCount) {
        setError(`${failedCount} đơn chưa thể cập nhật do dữ liệu đã thay đổi hoặc chưa đủ điều kiện.`);
      }
      if (successCount) setMessage(`Đã cập nhật ${successCount} đơn hàng.`);
      refresh();
    } catch (bulkError) {
      setError(bulkError.message || 'Không thể cập nhật hàng loạt.');
      refresh();
    } finally {
      setSaving('');
    }
  };

  const toggleSelected = (orderId) => {
    setSelectedIds((current) => (
      current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]
    ));
  };

  const selectOrder = (order) => {
    if (order.id === selectedOrderId) {
      setDetailOpen(true);
      return;
    }
    if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Chuyển sang đơn khác?')) return;
    dirtyRef.current = false;
    setDirtySections({});
    selectedOrderIdRef.current = order.id;
    setSelectedOrderId(order.id);
    setDraft(buildOrderDraft(order));
    setDetailOpen(true);
    setDetailTab('overview');
    setError('');
    setMessage('');
  };

  const discardChanges = () => {
    if (!selectedOrder) return;
    setDraft(buildOrderDraft(selectedOrder));
    setDirtySections({});
    dirtyRef.current = false;
    setMessage('Đã bỏ các thay đổi chưa lưu.');
  };

  const visibleShipmentOptions = useMemo(() => {
    const current = draft.shipmentStatus || 'pending';
    const allowed = new Set([current, ...(SHIPMENT_TRANSITIONS[current] || [])]);
    return shipmentStatusOptions.filter((item) => allowed.has(item.value));
  }, [draft.shipmentStatus]);

  return (
    <section className="admin-orders-v2" aria-busy={loading}>
      <header className="admin-orders-toolbar">
        <div>
          <h2>Trung tâm xử lý đơn hàng</h2>
          <p>Ưu tiên ngoại lệ, xử lý theo bước và tự đồng bộ mỗi 30 giây.</p>
        </div>
        <div className="admin-orders-sync">
          <span>{lastSyncedAt ? `Đồng bộ ${lastSyncedAt.toLocaleTimeString('vi-VN')}` : 'Đang kết nối'}</span>
          <button type="button" onClick={refresh} disabled={loading || dirty} aria-label="Làm mới đơn hàng">↻</button>
        </div>
      </header>

      <div className="admin-orders-queues" aria-label="Hàng đợi đơn hàng">
        <button type="button" disabled={dirty} className={!attentionOnly && status === 'all' ? 'active' : ''} onClick={() => { setAttentionOnly(false); setStatus('all'); setPage(1); }}>
          <span>Tất cả</span><strong>{pagination.total || 0}</strong>
        </button>
        <button type="button" disabled={dirty} className={attentionOnly ? 'active attention' : 'attention'} onClick={() => { setAttentionOnly(true); setStatus('all'); setPage(1); }}>
          <span>Cần chú ý</span><strong>{payload?.attentionCount || 0}</strong>
        </button>
        {orderStatusOptions.map((item) => (
          <button
            type="button"
            key={item.value}
            disabled={dirty}
            className={!attentionOnly && status === item.value ? 'active' : ''}
            onClick={() => { setAttentionOnly(false); setStatus(item.value); setPage(1); }}
          >
            <span>{item.label}</span><strong>{payload?.statusCounts?.[item.value] || 0}</strong>
          </button>
        ))}
      </div>

      <div className="admin-orders-filters">
        <label className="admin-orders-search">
          <span>Tìm kiếm</span>
          <input disabled={dirty} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Mã đơn, khách hàng, SĐT, SKU..." />
        </label>
        <label>
          <span>Thanh toán</span>
          <select disabled={dirty} value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value); setPage(1); }}>
            <option value="all">Tất cả</option>
            {paymentStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span>Giao nhận</span>
          <select disabled={dirty} value={shipmentStatus} onChange={(event) => { setShipmentStatus(event.target.value); setPage(1); }}>
            <option value="all">Tất cả</option>
            {shipmentStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="admin-orders-feedback error" role="alert">{error}</div>}
      {message && <div className="admin-orders-feedback success" role="status">{message}</div>}

      {selectedIds.length > 0 && (
        <div className="admin-orders-bulk">
          <strong>{selectedIds.length} đơn đã chọn</strong>
          <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>
            <option value="">Chọn bước tiếp theo</option>
            {bulkStatusOptions.map((value) => <option value={value} key={value}>{STATUS_LABELS[value]}</option>)}
          </select>
          <button type="button" disabled={dirty || !bulkStatus || saving === 'bulk'} onClick={handleBulkUpdate}>Áp dụng</button>
          <button type="button" className="ghost" onClick={() => setSelectedIds([])}>Bỏ chọn</button>
        </div>
      )}

      <div className="admin-orders-layout">
        <section className="admin-orders-list-panel" aria-label="Danh sách đơn hàng">
          <div className="admin-orders-list-head">
            <span>Đơn hàng</span>
            <span>Nghiệp vụ</span>
            <span>Tổng tiền</span>
          </div>
          <div className="admin-orders-list">
            {orders.map((order) => {
              const firstItem = order.items?.[0] || {};
              return (
                <div className={`admin-order-list-row ${selectedOrder?.id === order.id ? 'active' : ''}`} key={order.id}>
                  <label className="admin-order-select" aria-label={`Chọn đơn ${order.orderCode}`}>
                    <input type="checkbox" checked={selectedIds.includes(order.id)} onChange={() => toggleSelected(order.id)} />
                  </label>
                  <button type="button" className="admin-order-list-main" onClick={() => selectOrder(order)}>
                    <ProductThumb item={firstItem} />
                    <span className="admin-order-list-copy">
                      <span className="admin-order-list-code">#{order.orderCode}</span>
                      <strong>{order.customer?.fullName || order.receiver?.fullName || 'Khách hàng'}</strong>
                      <small>{getOrderQuantity(order)} sản phẩm · {getAgeLabel(order.createdAt)}</small>
                      <OrderAttention flags={order.attentionFlags} compact />
                    </span>
                    <span className="admin-order-list-state">
                      <StatusBadge value={order.status} />
                      <StatusBadge type="payment" value={order.paymentStatus} />
                    </span>
                    <strong className="admin-order-list-total">{formatCurrency(order.totals?.total || order.totals?.roundedTotal)}</strong>
                  </button>
                </div>
              );
            })}
            {!loading && !orders.length && <p className="admin-orders-empty">Không có đơn phù hợp với bộ lọc.</p>}
            {loading && !orders.length && <p className="admin-orders-empty">Đang tải đơn hàng...</p>}
          </div>
          <footer className="admin-orders-pagination">
            <span>{pagination.total || 0} đơn · Trang {pagination.page || 1}/{Math.max(1, pagination.totalPages || 1)}</span>
            <div>
              <button type="button" disabled={dirty || page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button>
              <button type="button" disabled={dirty || page >= (pagination.totalPages || 1) || loading} onClick={() => setPage((value) => value + 1)}>›</button>
            </div>
          </footer>
        </section>

        <aside className={`admin-order-detail-panel ${detailOpen ? 'open' : ''}`} aria-label="Chi tiết đơn hàng">
          {selectedOrder ? (
            <>
              <header className="admin-order-detail-head">
                <div>
                  <small>{formatDate(selectedOrder.createdAt)}</small>
                  <h3>#{selectedOrder.orderCode}</h3>
                </div>
                <div>
                  <StatusBadge value={selectedOrder.status} />
                  <button type="button" className="admin-order-detail-close" onClick={() => setDetailOpen(false)} aria-label="Đóng chi tiết">×</button>
                </div>
              </header>

              <OrderAttention flags={selectedOrder.attentionFlags} />

              <div className="admin-order-next-actions">
                {dirty && (
                  <div className="admin-order-unsaved">
                    <strong>Có thay đổi chưa lưu</strong>
                    <button type="button" disabled={Boolean(saving)} onClick={discardChanges}>Bỏ thay đổi</button>
                  </div>
                )}
                <span>Bước tiếp theo</span>
                <div>
                  {(selectedOrder.nextStatuses || []).map((nextStatus) => (
                    <button
                      type="button"
                      key={nextStatus}
                      className={nextStatus === 'cancelled' ? 'danger ghost' : ''}
                      disabled={Boolean(saving) || dirty}
                      onClick={() => handleOrderAction(nextStatus)}
                    >
                      {ORDER_ACTION_LABELS[nextStatus] || STATUS_LABELS[nextStatus]}
                    </button>
                  ))}
                  {!selectedOrder.nextStatuses?.length && <em>Đơn đã ở trạng thái kết thúc</em>}
                </div>
              </div>

              <nav className="admin-order-detail-tabs" aria-label="Nội dung đơn hàng">
                {[
                  ['overview', 'Tổng quan'],
                  ['operations', 'Nghiệp vụ'],
                  ['history', `Lịch sử (${selectedOrder.statusHistory?.length || 0})`],
                ].map(([id, label]) => (
                  <button type="button" key={id} className={detailTab === id ? 'active' : ''} onClick={() => setDetailTab(id)}>{label}</button>
                ))}
              </nav>

              <div className="admin-order-detail-body">
                {detailTab === 'overview' && (
                  <div className="admin-order-overview">
                    <section>
                      <h4>Khách nhận hàng</h4>
                      <strong>{selectedOrder.receiver?.fullName || selectedOrder.customer?.fullName || 'Khách hàng'}</strong>
                      <p>{selectedOrder.receiver?.phone || selectedOrder.customer?.phone || 'Chưa có số điện thoại'}</p>
                      <p>{isPickupOrder(selectedOrder) ? selectedOrder.shippingChoice?.label : getOrderAddress(selectedOrder) || 'Chưa có địa chỉ'}</p>
                    </section>
                    <section>
                      <h4>Sản phẩm</h4>
                      <div className="admin-order-items">
                        {(selectedOrder.items || []).map((item, index) => (
                          <div key={item.id || item.slug || index}>
                            <ProductThumb item={item} />
                            <span><strong>{item.name || 'Sản phẩm'}</strong><small>{item.sku || item.slug || 'Không có SKU'} · SL {item.quantity || 1}</small></span>
                            <b>{formatCurrency(item.totalPrice || Number(item.price || item.currentPrice || 0) * Number(item.quantity || 1))}</b>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="admin-order-totals-v2">
                      <h4>Thanh toán</h4>
                      <p><span>Phương thức</span><strong>{selectedOrder.payment?.methodLabel || selectedOrder.paymentMethod}</strong></p>
                      <p><span>Trạng thái</span><StatusBadge type="payment" value={selectedOrder.paymentStatus} /></p>
                      <p className="total"><span>Tổng cộng</span><strong>{formatCurrency(selectedOrder.totals?.total || selectedOrder.totals?.roundedTotal)}</strong></p>
                    </section>
                    <section>
                      <h4>Ghi chú nội bộ</h4>
                      <textarea rows="3" value={draft.adminNote || ''} onChange={(event) => updateDraft('note', 'adminNote', event.target.value)} placeholder="Kết quả gọi xác nhận, yêu cầu đặc biệt..." />
                      <button type="button" disabled={Boolean(saving)} onClick={() => saveOrder('note', { adminNote: draft.adminNote || '' })}>Lưu ghi chú</button>
                    </section>
                  </div>
                )}

                {detailTab === 'operations' && (
                  <div className="admin-order-operations-v2">
                    <section>
                      <header><div><h4>Thanh toán</h4><p>{selectedOrder.payment?.methodLabel || 'Chưa xác định phương thức'}</p></div><StatusBadge type="payment" value={selectedOrder.paymentStatus} /></header>
                      <label>Trạng thái<select value={draft.paymentStatus || 'unpaid'} onChange={(event) => updateDraft('payment', 'paymentStatus', event.target.value)}>{paymentStatusOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
                      <label>Mã giao dịch / đối soát<input value={draft.bankReference || ''} onChange={(event) => updateDraft('payment', 'bankReference', event.target.value)} placeholder="Mã ngân hàng hoặc mã đối soát" /></label>
                      <label>Ghi chú thanh toán<textarea rows="2" value={draft.paymentNote || ''} onChange={(event) => updateDraft('payment', 'paymentNote', event.target.value)} /></label>
                      <button type="button" disabled={Boolean(saving)} onClick={() => saveOrder('payment', {
                        paymentStatus: draft.paymentStatus,
                        bankReference: draft.bankReference || '',
                        paymentNote: draft.paymentNote || '',
                      })}>Lưu thanh toán</button>
                    </section>

                    <section>
                      <header><div><h4>{isPickupOrder(selectedOrder) ? 'Nhận tại cửa hàng' : 'Vận chuyển'}</h4><p>{selectedOrder.shippingChoice?.label || 'Giao hàng'}</p></div>{!isPickupOrder(selectedOrder) && <StatusBadge type="shipment" value={draft.shipmentStatus || 'pending'} />}</header>
                      {!isPickupOrder(selectedOrder) && (
                        <>
                          <div className="admin-order-field-pair">
                            <label>Đơn vị vận chuyển<input value={draft.carrier || ''} onChange={(event) => updateDraft('shipping', 'carrier', event.target.value)} placeholder="GHN, GHTK, Viettel Post..." /></label>
                            <label>Mã vận đơn<input value={draft.trackingCode || ''} onChange={(event) => updateDraft('shipping', 'trackingCode', event.target.value)} placeholder="Mã theo dõi" /></label>
                          </div>
                          <label>Trạng thái giao nhận<select value={draft.shipmentStatus || 'pending'} onChange={(event) => updateDraft('shipping', 'shipmentStatus', event.target.value)}>{visibleShipmentOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
                        </>
                      )}
                      <label>Ghi chú giao nhận<textarea rows="2" value={draft.shippingNote || ''} onChange={(event) => updateDraft('shipping', 'shippingNote', event.target.value)} /></label>
                      <button type="button" disabled={Boolean(saving)} onClick={() => saveOrder('shipping', {
                        carrier: draft.carrier || '',
                        trackingCode: draft.trackingCode || '',
                        shipmentStatus: draft.shipmentStatus || 'pending',
                        shippingNote: draft.shippingNote || '',
                      })}>Lưu giao nhận</button>
                    </section>
                  </div>
                )}

                {detailTab === 'history' && (
                  <div className="admin-order-history-v2">
                    {(selectedOrder.statusHistory || []).slice().reverse().map((item, index) => (
                      <div key={`${item.status}-${item.changedAt}-${index}`}>
                        <span />
                        <section>
                          <strong>{item.label || STATUS_LABELS[item.status] || item.status}</strong>
                          <small>{formatDate(item.changedAt)}</small>
                          {item.note && <p>{item.note}</p>}
                        </section>
                      </div>
                    ))}
                    {!selectedOrder.statusHistory?.length && <p>Chưa có lịch sử trạng thái.</p>}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="admin-order-detail-empty">Chọn một đơn để xem và xử lý.</div>
          )}
        </aside>
      </div>
    </section>
  );
}
