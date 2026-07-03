import { useMemo, useState } from 'react';
import './CheckoutPage.css';
import { formatPrice } from '../../data/mockData';
import { createOrder } from '../../services/apiOrders';

const VIETNAM_PROVINCES = [
  'An Giang',
  'Bà Rịa - Vũng Tàu',
  'Bạc Liêu',
  'Bắc Giang',
  'Bắc Kạn',
  'Bắc Ninh',
  'Bến Tre',
  'Bình Định',
  'Bình Dương',
  'Bình Phước',
  'Bình Thuận',
  'Cà Mau',
  'Cần Thơ',
  'Cao Bằng',
  'Đà Nẵng',
  'Đắk Lắk',
  'Đắk Nông',
  'Điện Biên',
  'Đồng Nai',
  'Đồng Tháp',
  'Gia Lai',
  'Hà Giang',
  'Hà Nam',
  'Hà Nội',
  'Hà Tĩnh',
  'Hải Dương',
  'Hải Phòng',
  'Hậu Giang',
  'Hòa Bình',
  'Hồ Chí Minh',
  'Hưng Yên',
  'Khánh Hòa',
  'Kiên Giang',
  'Kon Tum',
  'Lai Châu',
  'Lâm Đồng',
  'Lạng Sơn',
  'Lào Cai',
  'Long An',
  'Nam Định',
  'Nghệ An',
  'Ninh Bình',
  'Ninh Thuận',
  'Phú Thọ',
  'Phú Yên',
  'Quảng Bình',
  'Quảng Nam',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Quảng Trị',
  'Sóc Trăng',
  'Sơn La',
  'Tây Ninh',
  'Thái Bình',
  'Thái Nguyên',
  'Thanh Hóa',
  'Thừa Thiên Huế',
  'Tiền Giang',
  'Trà Vinh',
  'Tuyên Quang',
  'Vĩnh Long',
  'Vĩnh Phúc',
  'Yên Bái',
];

const LOCATION_DATA = {
  'Hồ Chí Minh': {
    districts: {
      'Quận 1': ['Phường Bến Nghé', 'Phường Bến Thành', 'Phường Cầu Kho', 'Phường Cô Giang'],
      'Quận 3': ['Phường 1', 'Phường 2', 'Phường 3', 'Phường Võ Thị Sáu'],
      'Quận 7': ['Phường Tân Phong', 'Phường Tân Phú', 'Phường Phú Mỹ'],
      'Bình Thạnh': ['Phường 1', 'Phường 2', 'Phường 3', 'Phường 15'],
      'Gò Vấp': ['Phường 1', 'Phường 3', 'Phường 5', 'Phường 17'],
      'Thủ Đức': ['Phường Linh Trung', 'Phường Linh Chiểu', 'Phường Hiệp Bình Chánh'],
      'Quận 10': ['Phường 1', 'Phường 2', 'Phường 3', 'Phường 4'],
    },
  },
  'Hà Nội': {
    districts: {
      'Ba Đình': ['Phường Điện Biên', 'Phường Đội Cấn', 'Phường Kim Mã'],
      'Cầu Giấy': ['Phường Dịch Vọng', 'Phường Nghĩa Đô', 'Phường Trung Hòa'],
      'Đống Đa': ['Phường Cát Linh', 'Phường Láng Hạ', 'Phường Ô Chợ Dừa'],
      'Hoàn Kiếm': ['Phường Hàng Bạc', 'Phường Hàng Bài', 'Phường Tràng Tiền'],
      'Thanh Xuân': ['Phường Nhân Chính', 'Phường Khương Trung', 'Phường Thanh Xuân Trung'],
    },
  },
  'Đà Nẵng': {
    districts: {
      'Hải Châu': ['Phường Hải Châu 1', 'Phường Hải Châu 2', 'Phường Thạch Thang'],
      'Thanh Khê': ['Phường Chính Gián', 'Phường Tân Chính', 'Phường Xuân Hà'],
      'Sơn Trà': ['Phường An Hải Bắc', 'Phường An Hải Đông', 'Phường Phước Mỹ'],
    },
  },
};

const todayLabel = () => {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
};

const getShippingEta = (type) => (
  type === 'standard'
    ? `Giao thông thường: trước 21 giờ ngày ${todayLabel()}`
    : `Giao siêu tốc: trước 16 giờ 30 phút ngày ${todayLabel()}`
);

const normalizePhone = (value = '') => String(value).replace(/[^\d]/g, '').slice(0, 10);
const padQuantity = (value) => String(Number(value || 0)).padStart(2, '0');

const initialForm = {
  customerFullName: '',
  customerPhone: '',
  customerEmail: '',
  fulfillmentMethod: 'store',
  province: '',
  district: '',
  ward: '',
  storeLocation: '',
  addressLine: '',
  shippingType: 'express',
  note: '',
  marketingOptIn: true,
  companyInvoice: false,
  educationOffer: false,
  termsAccepted: true,
};

function CheckoutStepper({ step }) {
  return (
    <div className="checkout-stepper">
      <div className={`checkout-step ${step === 'info' ? 'active' : 'done'}`}>
        <span>1</span>
        <strong>Thông tin</strong>
      </div>
      <div className={`checkout-step ${step === 'payment' ? 'active' : ''}`}>
        <span>2</span>
        <strong>Thanh toán</strong>
      </div>
    </div>
  );
}

function CheckoutProduct({ item }) {
  const quantity = Number(item.quantity || 1);
  const currentPrice = Number(item.currentPrice || item.price || 0);
  const originalPrice = Number(item.originalPrice || currentPrice || 0);
  const optionText = [
    item.selectedOptions?.variantName,
    item.selectedOptions?.colorName,
  ].filter(Boolean).join(' - ');

  return (
    <article className="checkout-product">
      <div className="checkout-product-image">
        {item.image ? <img src={item.image} alt={item.name} /> : <span>CellphoneS</span>}
      </div>
      <div className="checkout-product-info">
        <h3>{item.name}{optionText ? ` - ${optionText}` : ''}</h3>
        <div className="checkout-product-prices">
          <strong>{currentPrice ? formatPrice(currentPrice) : 'Liên hệ'}</strong>
          {originalPrice > currentPrice && <span>{formatPrice(originalPrice)}</span>}
        </div>
        <p>Số lượng: {quantity}</p>
      </div>
    </article>
  );
}

function SummaryRows({ summary, educationDiscount, total }) {
  return (
    <div className="checkout-summary-box">
      <div className="checkout-summary-row">
        <span>Số lượng sản phẩm</span>
        <strong>{padQuantity(summary.totalQuantity)}</strong>
      </div>
      <div className="checkout-summary-row">
        <span>Tổng tiền hàng</span>
        <strong>{formatPrice(summary.originalSubtotal || summary.subtotal || 0)}</strong>
      </div>
      <div className="checkout-summary-row">
        <span>Phí vận chuyển</span>
        <strong>Miễn phí</strong>
      </div>
      {(summary.discount || 0) > 0 && (
        <div className="checkout-summary-row discount">
          <span>Giảm giá trực tiếp</span>
          <strong>- {formatPrice(summary.discount)}</strong>
        </div>
      )}
      {educationDiscount > 0 && (
        <div className="checkout-summary-row discount">
          <span>Giảm giá S-STUDENT</span>
          <strong>- {formatPrice(educationDiscount)}</strong>
        </div>
      )}
      <div className="checkout-summary-total">
        <div>
          <span>Tổng tiền</span>
          <small>Đã gồm VAT và được làm tròn</small>
        </div>
        <strong>{formatPrice(total)}</strong>
      </div>
    </div>
  );
}

export default function CheckoutPage({ cart, currentUser, onGoCart, onGoHome, onGoAccount, onClearCart }) {
  const items = cart?.items || [];
  const summary = cart?.summary || {};
  const [step, setStep] = useState('info');
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const isStorePickup = form.fulfillmentMethod === 'store';
  const educationDiscount = form.educationOffer ? Math.min(300000, summary.subtotal || 0) : 0;
  const total = Math.max(0, Number(summary.subtotal || 0) - educationDiscount);
  const shippingOptions = useMemo(() => ([
    { type: 'express', label: getShippingEta('express') },
    { type: 'standard', label: getShippingEta('standard') },
  ]), []);
  const districtOptions = useMemo(() => (
    Object.keys(LOCATION_DATA[form.province]?.districts || {})
  ), [form.province]);
  const wardOptions = useMemo(() => (
    LOCATION_DATA[form.province]?.districts?.[form.district] || []
  ), [form.province, form.district]);

  const updateField = (field, value) => {
    setForm((previous) => {
      const next = {
        ...previous,
        [field]: field.includes('Phone') ? normalizePhone(value) : value,
      };

      if (field === 'fulfillmentMethod') {
        next.storeLocation = '';
        next.addressLine = '';
      }
      if (field === 'province') {
        next.district = '';
        next.ward = '';
        next.storeLocation = '';
      }
      if (field === 'district') {
        next.ward = '';
        next.storeLocation = '';
      }
      if (field === 'educationOffer' && value) {
        next.companyInvoice = false;
      }

      return next;
    });
  };

  const validateInfo = () => {
    if (!items.length) return 'Giỏ hàng đang trống.';
    if (!form.customerFullName.trim()) return 'Vui lòng nhập họ tên khách hàng.';
    if (!/^0\d{9}$/.test(form.customerPhone)) return 'Số điện thoại cần gồm 10 chữ số và bắt đầu bằng 0.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail)) return 'Vui lòng nhập email hợp lệ.';
    if (!form.province || !form.district) return 'Vui lòng chọn Tỉnh / Thành phố và Quận / Huyện.';
    if (isStorePickup && !form.storeLocation.trim()) return 'Vui lòng nhập / chọn cửa hàng nhận hàng.';
    if (!isStorePickup && (!form.ward || !form.addressLine.trim())) {
      return 'Vui lòng nhập đầy đủ Phường / Xã và địa chỉ chi tiết.';
    }
    return '';
  };

  const goPaymentStep = () => {
    const validationError = validateInfo();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setStep('payment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submitOrder = async () => {
    const validationError = validateInfo();
    if (validationError) {
      setError(validationError);
      setStep('info');
      return;
    }
    if (!form.termsAccepted) {
      setError('Bạn cần đồng ý với Điều khoản sử dụng trước khi đặt hàng.');
      return;
    }

    const selectedShipping = shippingOptions.find((item) => item.type === form.shippingType) || shippingOptions[0];
    const shippingChoice = isStorePickup
      ? {
          type: 'store',
          label: 'Nhận tại cửa hàng',
          etaText: 'CellphoneS sẽ thông báo khi đơn sẵn sàng nhận tại cửa hàng.',
          fee: 0,
        }
      : {
          type: form.shippingType,
          label: selectedShipping.type === 'express' ? 'Giao siêu tốc' : 'Giao thông thường',
          etaText: selectedShipping.label,
          fee: 0,
        };

    setSubmitting(true);
    setError('');
    try {
      const order = await createOrder({
        cart,
        items,
        customer: {
          fullName: form.customerFullName,
          phone: form.customerPhone,
          email: form.customerEmail,
          memberTier: 'S-NEW',
        },
        receiver: {
          fullName: form.customerFullName,
          phone: form.customerPhone,
        },
        shippingAddress: {
          province: form.province,
          district: form.district,
          ward: isStorePickup ? '' : form.ward,
          addressLine: isStorePickup ? form.storeLocation : form.addressLine,
        },
        shippingChoice,
        marketingOptIn: form.marketingOptIn,
        educationOffer: form.educationOffer,
        companyInvoice: {
          requested: form.educationOffer ? false : form.companyInvoice,
        },
        paymentMethod: 'cod',
        note: form.note,
        termsAccepted: form.termsAccepted,
        gifts: ['Tặng Túi phụ kiện phiên bản CellphoneS'],
        clearCart: true,
      });

      setCreatedOrder(order);
      await onClearCart?.();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (orderError) {
      setError(orderError.message || 'Không thể đặt hàng, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const receiveAddressText = isStorePickup
    ? [form.storeLocation, form.district, form.province].filter(Boolean).join(', ')
    : [form.addressLine, form.ward, form.district, form.province].filter(Boolean).join(', ');

  if (createdOrder) {
    return (
      <section className="checkout-page">
        <div className="container checkout-container">
          <div className="checkout-success-card">
            <img src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/chibi2.png" alt="" />
            <h1>Đặt hàng thành công</h1>
            <p>Mã đơn hàng của bạn là <strong>{createdOrder.orderCode}</strong>.</p>
            <p>Phương thức thanh toán: <strong>Thanh toán khi nhận hàng (COD)</strong></p>
            <p>Tổng tiền: <strong>{formatPrice(createdOrder.totals?.total || total)}</strong></p>
            <div className="checkout-success-actions">
              {currentUser && onGoAccount && (
                <button type="button" onClick={onGoAccount}>Xem lịch sử mua hàng</button>
              )}
              <button type="button" onClick={onGoHome}>Về trang chủ</button>
              <button type="button" className="secondary" onClick={onGoCart}>Quay lại giỏ hàng</button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="checkout-page">
        <div className="container checkout-container">
          <div className="checkout-empty-card">
            <h1>Không có sản phẩm để đặt hàng</h1>
            <p>Giỏ hàng của bạn đang trống, hãy chọn sản phẩm trước nhé.</p>
            <button type="button" onClick={onGoHome}>Tiếp tục mua sắm</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="checkout-page">
      <div className="container checkout-container">
        <CheckoutStepper step={step} />
        {error && <div className="checkout-alert">{error}</div>}

        <div className="checkout-layout">
          <div className="checkout-main-card">
            <button type="button" className="checkout-back-btn" onClick={step === 'info' ? onGoCart : () => setStep('info')}>
              ← {step === 'info' ? 'Quay lại giỏ hàng' : 'Sửa thông tin'}
            </button>

            {step === 'info' ? (
              <>
                <h1>Thông tin</h1>
                <div className="checkout-products">
                  {items.map((item) => <CheckoutProduct item={item} key={item.id} />)}
                </div>

                <div className="checkout-gift-box">
                  <strong>QUÀ TẶNG GIỚI HẠN</strong>
                  <span>Tặng Túi phụ kiện phiên bản CellphoneS</span>
                </div>

                <section className="checkout-form-section">
                  <h2>Thông tin khách hàng</h2>
                  <div className="checkout-form-grid">
                    <label>
                      Họ và tên
                      <input value={form.customerFullName} onChange={(event) => updateField('customerFullName', event.target.value)} placeholder="Nhập họ và tên" />
                    </label>
                    <label>
                      Số điện thoại
                      <input value={form.customerPhone} onChange={(event) => updateField('customerPhone', event.target.value)} placeholder="Nhập số điện thoại" />
                    </label>
                    <label className="full">
                      Email
                      <input value={form.customerEmail} onChange={(event) => updateField('customerEmail', event.target.value)} placeholder="Nhập email nhận hóa đơn VAT" />
                      <small>(*) Hóa đơn VAT sẽ được gửi qua email này</small>
                    </label>
                  </div>
                  <label className="checkout-check-row">
                    <input type="checkbox" checked={form.marketingOptIn} onChange={(event) => updateField('marketingOptIn', event.target.checked)} />
                    <span>Nhận email thông báo và ưu đãi từ CellphoneS</span>
                  </label>
                </section>

                <section className="checkout-form-section">
                  <h2>Thông tin nhận hàng</h2>
                  <div className="checkout-fulfillment-tabs">
                    <label className={form.fulfillmentMethod === 'store' ? 'active' : ''}>
                      <input type="radio" name="fulfillmentMethod" checked={form.fulfillmentMethod === 'store'} onChange={() => updateField('fulfillmentMethod', 'store')} />
                      <span>Nhận tại cửa hàng</span>
                    </label>
                    <label className={form.fulfillmentMethod === 'delivery' ? 'active' : ''}>
                      <input type="radio" name="fulfillmentMethod" checked={form.fulfillmentMethod === 'delivery'} onChange={() => updateField('fulfillmentMethod', 'delivery')} />
                      <span>Giao hàng tận nơi</span>
                    </label>
                  </div>

                  <div className="checkout-location-grid">
                    <label>
                      <span>TỈNH / THÀNH PHỐ</span>
                      <select value={form.province} onChange={(event) => updateField('province', event.target.value)}>
                        <option value="">Chọn Tỉnh / Thành phố</option>
                        {VIETNAM_PROVINCES.map((province) => (
                          <option value={province} key={province}>{province}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>QUẬN / HUYỆN</span>
                      {districtOptions.length > 0 ? (
                        <select value={form.district} onChange={(event) => updateField('district', event.target.value)} disabled={!form.province}>
                          <option value="">Chọn Quận / Huyện</option>
                          {districtOptions.map((district) => (
                            <option value={district} key={district}>{district}</option>
                          ))}
                        </select>
                      ) : (
                        <input value={form.district} onChange={(event) => updateField('district', event.target.value)} placeholder="Nhập Quận / Huyện" disabled={!form.province} />
                      )}
                    </label>
                    <label>
                      <span>PHƯỜNG / XÃ</span>
                      {wardOptions.length > 0 ? (
                        <select value={form.ward} onChange={(event) => updateField('ward', event.target.value)} disabled={!form.district || isStorePickup}>
                          <option value="">Chọn Phường / Xã</option>
                          {wardOptions.map((ward) => (
                            <option value={ward} key={ward}>{ward}</option>
                          ))}
                        </select>
                      ) : (
                        <input value={form.ward} onChange={(event) => updateField('ward', event.target.value)} placeholder="Nhập Phường / Xã" disabled={!form.district || isStorePickup} />
                      )}
                    </label>
                    <label>
                      <span>{isStorePickup ? 'CỬA HÀNG' : 'ĐỊA CHỈ CHI TIẾT'}</span>
                      <input
                        value={isStorePickup ? form.storeLocation : form.addressLine}
                        onChange={(event) => updateField(isStorePickup ? 'storeLocation' : 'addressLine', event.target.value)}
                        placeholder={isStorePickup ? 'Nhập / chọn cửa hàng CellphoneS' : 'Nhập số nhà, tên đường'}
                      />
                    </label>
                  </div>

                  {!isStorePickup && (
                    <div className="checkout-shipping-options">
                      {shippingOptions.map((option) => (
                        <label key={option.type} className={form.shippingType === option.type ? 'active' : ''}>
                          <input type="radio" name="shippingType" checked={form.shippingType === option.type} onChange={() => updateField('shippingType', option.type)} />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <label className="checkout-note">
                    Ghi chú khác (nếu có)
                    <textarea value={form.note} onChange={(event) => updateField('note', event.target.value)} rows={3} />
                  </label>

                  <div className="checkout-radio-panel">
                    <p>Quý khách có muốn xuất hóa đơn công ty không?</p>
                    <label>
                      <input type="radio" checked={form.companyInvoice} disabled={form.educationOffer} onChange={() => updateField('companyInvoice', true)} />
                      Có
                    </label>
                    <label>
                      <input type="radio" checked={!form.companyInvoice} onChange={() => updateField('companyInvoice', false)} />
                      Không
                    </label>
                    {form.educationOffer && (
                      <small>Đơn hàng có áp dụng ưu đãi giáo dục (S-Student/S-Teacher) không hỗ trợ xuất hóa đơn VAT công ty.</small>
                    )}
                  </div>

                  <label className="checkout-check-row education">
                    <input type="checkbox" checked={form.educationOffer} onChange={(event) => updateField('educationOffer', event.target.checked)} />
                    <span>Đơn hàng áp dụng ưu đãi giáo dục S-Student/S-Teacher</span>
                  </label>
                </section>

                <button type="button" className="checkout-primary-btn" onClick={goPaymentStep}>
                  Tiếp tục
                </button>
              </>
            ) : (
              <>
                <h1>Thanh toán</h1>
                <div className="checkout-coupon-box">Nhập mã giảm giá (chỉ áp dụng 1 lần)</div>
                <SummaryRows summary={summary} educationDiscount={educationDiscount} total={total} />

                <section className="checkout-payment-card">
                  <h2>Thông tin thanh toán</h2>
                  <label className="checkout-payment-method active">
                    <input type="radio" checked readOnly />
                    <span>
                      <strong>Thanh toán khi nhận hàng (COD)</strong>
                      <small>Quý khách thanh toán trực tiếp khi nhận hàng.</small>
                    </span>
                  </label>
                </section>

                <section className="checkout-review-card">
                  <h2>Thông tin nhận hàng</h2>
                  <dl>
                    <dt>Khách hàng</dt>
                    <dd>S-NEW {form.customerFullName}</dd>
                    <dt>Số điện thoại</dt>
                    <dd>{form.customerPhone}</dd>
                    <dt>Email</dt>
                    <dd>{form.customerEmail}</dd>
                    <dt>Hình thức</dt>
                    <dd>{isStorePickup ? 'Nhận tại cửa hàng' : 'Giao hàng tận nơi'}</dd>
                    <dt>Nhận hàng tại</dt>
                    <dd>{receiveAddressText}</dd>
                  </dl>
                </section>

                <label className="checkout-terms">
                  <input type="checkbox" checked={form.termsAccepted} onChange={(event) => updateField('termsAccepted', event.target.checked)} />
                  <span>
                    Bằng việc Đặt hàng, bạn đồng ý với <a href="https://cellphones.com.vn/tos" target="_blank" rel="noreferrer">Điều khoản sử dụng</a> của CellphoneS.
                  </span>
                </label>

                <button type="button" className="checkout-primary-btn" onClick={submitOrder} disabled={submitting}>
                  {submitting ? 'Đang lưu đơn hàng...' : 'Đặt hàng COD'}
                </button>
              </>
            )}
          </div>

          <aside className="checkout-side-card">
            <h2>Tổng tiền tạm tính:</h2>
            <strong>{formatPrice(total)}</strong>
            <SummaryRows summary={summary} educationDiscount={educationDiscount} total={total} />
          </aside>
        </div>
      </div>
    </section>
  );
}
