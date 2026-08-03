import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createSupportRequest,
  getMySupportRequests,
  getStoredSupportTickets,
  getStoredSupportToken,
  getSupportRequest,
  sendSupportMessage,
} from '../../services/apiSupport';
import './ContactPage.css';

const ISSUE_TYPES = [
  ['order', 'Đơn hàng & giao nhận'],
  ['product', 'Tư vấn sản phẩm'],
  ['payment', 'Thanh toán & hoàn tiền'],
  ['warranty', 'Bảo hành & đổi trả'],
  ['account', 'Tài khoản Smember'],
  ['feedback', 'Góp ý về dịch vụ'],
  ['other', 'Vấn đề khác'],
];

const STATUS_META = {
  new: ['Mới tiếp nhận', 'new'],
  in_progress: ['Đang xử lý', 'processing'],
  waiting_customer: ['Chờ bạn phản hồi', 'waiting'],
  resolved: ['Đã giải quyết', 'resolved'],
  closed: ['Đã đóng', 'closed'],
};

const EMPTY_FORM = {
  issueType: '',
  fullName: '',
  phone: '',
  email: '',
  orderCode: '',
  preferredContact: 'email',
  content: '',
  attachment: null,
};

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getCurrentUserName(user) {
  return user?.fullName || user?.displayName || user?.name || user?.username || '';
}

function getInitials(name = '') {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  return (words.at(-1)?.[0] || words[0]?.[0] || 'C').toUpperCase();
}

function createInitialForm(user) {
  return {
    ...EMPTY_FORM,
    fullName: getCurrentUserName(user),
    email: user?.email || '',
    phone: user?.phone || user?.phoneNumber || '',
  };
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error('Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('Ảnh quá lớn. Vui lòng chọn ảnh dưới 5MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc ảnh đã chọn.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('File ảnh không hợp lệ.'));
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        const size = Math.floor((((dataUrl.split(',')[1] || '').length) * 3) / 4);
        if (size > 1_100_000) {
          reject(new Error('Ảnh sau khi xử lý vẫn quá lớn. Vui lòng chọn ảnh khác.'));
          return;
        }
        resolve({
          name: file.name || 'anh-dinh-kem.jpg',
          type: 'image/jpeg',
          size,
          dataUrl,
        });
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export default function ContactPage({ currentUser, onGoHome }) {
  const [form, setForm] = useState(() => createInitialForm(currentUser));
  const [requests, setRequests] = useState([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedRequest = useMemo(
    () => requests.find((item) => item.requestCode === selectedCode) || null,
    [requests, selectedCode],
  );

  const upsertRequests = useCallback((items = []) => {
    setRequests((previous) => {
      const byCode = new Map(previous.map((item) => [item.requestCode, item]));
      items.filter(Boolean).forEach((item) => {
        byCode.set(item.requestCode, {
          ...(byCode.get(item.requestCode) || {}),
          ...item,
        });
      });
      return [...byCode.values()].sort(
        (left, right) => new Date(right.updatedAt || right.createdAt || 0)
          - new Date(left.updatedAt || left.createdAt || 0),
      );
    });
  }, []);

  const loadRequests = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoadingRequests(true);
    const trackedTickets = getStoredSupportTickets();
    const tasks = trackedTickets.map((ticket) => (
      getSupportRequest(ticket.requestCode, ticket.trackingToken)
        .then((payload) => payload.data)
        .catch(() => null)
    ));
    if (currentUser) {
      tasks.push(
        getMySupportRequests()
          .then((payload) => payload.data || [])
          .catch(() => []),
      );
    }

    const settled = await Promise.all(tasks);
    upsertRequests(settled.flat().filter(Boolean));
    setLoadingRequests(false);
  }, [currentUser, upsertRequests]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadRequests(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  useEffect(() => {
    if (!selectedCode) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const payload = await getSupportRequest(
          selectedCode,
          getStoredSupportToken(selectedCode),
        );
        upsertRequests([payload.data]);
      } catch {
        // Keep the last successful state; a manual refresh remains available.
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [selectedCode, upsertRequests]);

  const updateForm = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const handleFileChange = async (event) => {
    setError('');
    try {
      const attachment = await readImage(event.target.files?.[0]);
      updateForm('attachment', attachment);
    } catch (fileError) {
      event.target.value = '';
      updateForm('attachment', null);
      setError(fileError.message);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const payload = await createSupportRequest(form);
      upsertRequests([payload.data]);
      setSelectedCode(payload.data.requestCode);
      setSuccess(`Đã gửi yêu cầu #${payload.data.requestCode}. CellphoneS sẽ phản hồi ngay tại trang này.`);
      setForm((previous) => ({
        ...EMPTY_FORM,
        fullName: previous.fullName,
        phone: previous.phone,
        email: previous.email,
        preferredContact: previous.preferredContact,
      }));
    } catch (submitError) {
      setError(submitError.message || 'Không thể gửi yêu cầu hỗ trợ.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendFollowUp = async (event) => {
    event.preventDefault();
    if (!selectedRequest || !followUp.trim()) return;
    setLoading(true);
    setError('');
    try {
      const payload = await sendSupportMessage(
        selectedRequest.requestCode,
        followUp,
        getStoredSupportToken(selectedRequest.requestCode),
      );
      upsertRequests([payload.data]);
      setFollowUp('');
      setSuccess('Đã gửi nội dung bổ sung tới bộ phận hỗ trợ.');
    } catch (followUpError) {
      setError(followUpError.message || 'Không thể gửi nội dung bổ sung.');
    } finally {
      setLoading(false);
    }
  };

  const selectedStatus = STATUS_META[selectedRequest?.status] || [
    selectedRequest?.statusLabel || 'Đang xử lý',
    'processing',
  ];

  return (
    <section className="contact-page">
      <div className="contact-container">
        <nav className="contact-breadcrumb" aria-label="Breadcrumb">
          <a href="/" onClick={(event) => {
            if (!onGoHome) return;
            event.preventDefault();
            onGoHome();
          }}>
            Trang chủ
          </a>
          <span>/</span>
          <strong>Liên hệ</strong>
        </nav>

        <div className="contact-hero">
          <div>
            <span className="contact-eyebrow">CELL­PHONES LUÔN LẮNG NGHE</span>
            <h1>Chúng tôi có thể hỗ trợ gì cho bạn?</h1>
            <p>
              Gửi yêu cầu một lần, nhận mã theo dõi và trao đổi trực tiếp với nhân viên
              CellphoneS ngay trên trang này.
            </p>
            <div className="contact-hero-points">
              <span>✓ Lưu yêu cầu an toàn</span>
              <span>✓ Theo dõi trạng thái</span>
              <span>✓ Nhận phản hồi từ admin</span>
            </div>
          </div>
          <div className="contact-hero-mark" aria-hidden="true">
            <span>S</span>
            <small>Hỗ trợ tận tâm</small>
          </div>
        </div>

        <div className="contact-channel-grid">
          <a href="tel:18002097" className="contact-channel-card">
            <span className="contact-channel-icon">☎</span>
            <div><small>Mua hàng & bảo hành</small><strong>1800 2097</strong><em>7h30 - 22h00</em></div>
          </a>
          <a href="tel:18002063" className="contact-channel-card">
            <span className="contact-channel-icon">♧</span>
            <div><small>Phản ánh dịch vụ</small><strong>1800 2063</strong><em>8h00 - 21h30</em></div>
          </a>
          <a href="/tra-cuu-don-hang" className="contact-channel-card">
            <span className="contact-channel-icon">▣</span>
            <div><small>Đơn hàng của bạn</small><strong>Tra cứu đơn</strong><em>Cập nhật theo thời gian thực</em></div>
          </a>
          <a href="/cua-hang-gan-ban" className="contact-channel-card">
            <span className="contact-channel-icon">⌖</span>
            <div><small>Hỗ trợ trực tiếp</small><strong>Cửa hàng gần bạn</strong><em>Xem chỉ đường</em></div>
          </a>
        </div>

        {(error || success) && (
          <div className={`contact-alert ${error ? 'error' : 'success'}`} role="status">
            {error || success}
          </div>
        )}

        <div className="contact-workspace">
          <div className="contact-form-card">
            <div className="contact-card-heading">
              <div>
                <span>GỬI YÊU CẦU</span>
                <h2>Liên hệ với CellphoneS</h2>
              </div>
              <small>Phản hồi được lưu trong mục Theo dõi bên cạnh</small>
            </div>

            <form className="contact-form" onSubmit={handleSubmit}>
              <label className="contact-field full">
                <span>Nhóm vấn đề *</span>
                <select
                  value={form.issueType}
                  onChange={(event) => updateForm('issueType', event.target.value)}
                  required
                >
                  <option value="">Chọn nội dung cần hỗ trợ</option>
                  {ISSUE_TYPES.map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="contact-field">
                <span>Họ và tên *</span>
                <input
                  value={form.fullName}
                  onChange={(event) => updateForm('fullName', event.target.value)}
                  placeholder="Nhập họ và tên"
                  required
                />
              </label>
              <label className="contact-field">
                <span>Số điện thoại</span>
                <input
                  value={form.phone}
                  onChange={(event) => updateForm('phone', event.target.value)}
                  placeholder="Ví dụ: 0901234567"
                  inputMode="tel"
                />
              </label>
              <label className="contact-field">
                <span>Email</span>
                <input
                  value={form.email}
                  onChange={(event) => updateForm('email', event.target.value)}
                  placeholder="Email nhận phản hồi"
                  type="email"
                />
              </label>
              <label className="contact-field">
                <span>Mã đơn hàng (nếu có)</span>
                <input
                  value={form.orderCode}
                  onChange={(event) => updateForm('orderCode', event.target.value)}
                  placeholder="Ví dụ: CPS2026..."
                />
              </label>

              <fieldset className="contact-preference">
                <legend>Ưu tiên liên hệ qua</legend>
                <label>
                  <input
                    type="radio"
                    name="preferredContact"
                    checked={form.preferredContact === 'email'}
                    onChange={() => updateForm('preferredContact', 'email')}
                  />
                  Email
                </label>
                <label>
                  <input
                    type="radio"
                    name="preferredContact"
                    checked={form.preferredContact === 'phone'}
                    onChange={() => updateForm('preferredContact', 'phone')}
                  />
                  Điện thoại
                </label>
              </fieldset>

              <label className="contact-field full">
                <span>Nội dung cần hỗ trợ *</span>
                <textarea
                  value={form.content}
                  onChange={(event) => updateForm('content', event.target.value)}
                  placeholder="Mô tả vấn đề càng rõ, CellphoneS càng hỗ trợ bạn nhanh hơn..."
                  rows="6"
                  minLength="10"
                  required
                />
              </label>

              <label className="contact-upload full">
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
                <span className="contact-upload-icon">＋</span>
                <strong>{form.attachment?.name || 'Thêm ảnh minh họa'}</strong>
                <small>JPG, PNG, WEBP · tối đa 5MB</small>
              </label>

              <button className="contact-submit full" type="submit" disabled={loading}>
                {loading ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu hỗ trợ'}
              </button>
              <p className="contact-form-note full">
                Số điện thoại hoặc email là bắt buộc để CellphoneS phản hồi đúng người.
              </p>
            </form>
          </div>

          <aside className="contact-tracking-card">
            <div className="contact-card-heading">
              <div>
                <span>THEO DÕI</span>
                <h2>Yêu cầu của bạn</h2>
              </div>
              <button type="button" onClick={() => loadRequests()} disabled={loadingRequests}>
                Làm mới
              </button>
            </div>

            {loadingRequests ? (
              <div className="contact-ticket-loading">
                <i />
                <i />
                <i />
              </div>
            ) : requests.length ? (
              <div className="contact-ticket-list">
                {requests.map((item) => {
                  const status = STATUS_META[item.status] || [item.statusLabel, 'processing'];
                  return (
                    <button
                      type="button"
                      className={selectedCode === item.requestCode ? 'active' : ''}
                      onClick={() => setSelectedCode(item.requestCode)}
                      key={item.requestCode}
                    >
                      <span>
                        <strong>#{item.requestCode}</strong>
                        <small>{item.issueType || 'Yêu cầu hỗ trợ'} · {formatDate(item.createdAt)}</small>
                      </span>
                      <em className={status[1]}>{status[0]}</em>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="contact-ticket-empty">
                <span>✉</span>
                <strong>Chưa có yêu cầu nào</strong>
                <p>Yêu cầu sau khi gửi sẽ xuất hiện tại đây, kể cả khi bạn chưa đăng nhập.</p>
              </div>
            )}

            {selectedRequest && (
              <div className="contact-conversation">
                <div className="contact-conversation-head">
                  <div>
                    <strong>#{selectedRequest.requestCode}</strong>
                    <small>Cập nhật {formatDate(selectedRequest.updatedAt || selectedRequest.createdAt)}</small>
                  </div>
                  <em className={selectedStatus[1]}>{selectedStatus[0]}</em>
                </div>

                <div className="contact-message-list">
                  {(selectedRequest.messages || []).map((message, index) => (
                    <div
                      className={`contact-message ${message.sender === 'admin' ? 'admin' : 'customer'}`}
                      key={message.id || `${message.sender}-${index}`}
                    >
                      <span className="contact-message-avatar">
                        {message.sender === 'admin' ? 'S' : getInitials(message.senderName)}
                      </span>
                      <div>
                        <strong>{message.senderName || (message.sender === 'admin' ? 'CellphoneS' : 'Bạn')}</strong>
                        <p>{message.content}</p>
                        <small>{formatDate(message.createdAt)}</small>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedRequest.status !== 'closed' && (
                  <form className="contact-follow-up" onSubmit={handleSendFollowUp}>
                    <textarea
                      value={followUp}
                      onChange={(event) => setFollowUp(event.target.value)}
                      rows="3"
                      placeholder="Bổ sung thông tin hoặc trả lời nhân viên..."
                    />
                    <button type="submit" disabled={loading || !followUp.trim()}>
                      Gửi phản hồi
                    </button>
                  </form>
                )}
              </div>
            )}
          </aside>
        </div>

        <div className="contact-promise">
          <div><strong>Minh bạch</strong><span>Mọi phản hồi đều có lịch sử và thời gian xử lý.</span></div>
          <div><strong>Bảo mật</strong><span>Khách vãng lai dùng mã riêng, Smember xác thực bằng tài khoản.</span></div>
          <div><strong>Liên tục</strong><span>Bạn có thể bổ sung nội dung cho đến khi yêu cầu được đóng.</span></div>
        </div>
      </div>
    </section>
  );
}
