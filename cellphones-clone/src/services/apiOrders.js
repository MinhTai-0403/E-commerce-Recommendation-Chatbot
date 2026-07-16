import { buildApiUrl } from './apiProducts';
import { getAuthToken } from './apiAuth';

function getErrorMessage(payload, fallback) {
  if (typeof payload?.message === 'string') return payload.message;
  if (typeof payload?.error === 'string') return payload.error;
  if (typeof payload?.error?.message === 'string') return payload.error.message;
  return fallback;
}

export async function createOrder(orderPayload) {
  const token = getAuthToken();
  const response = await fetch(buildApiUrl('/api/orders'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(orderPayload),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, 'Không thể tạo đơn hàng.'));
  }

  return payload.data;
}

export async function applyCouponCode(body) {
  const token = getAuthToken();
  const response = await fetch(buildApiUrl('/api/coupons/apply'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, 'Không thể áp dụng mã giảm giá.'));
  }

  return payload.data;
}

export async function fetchMyOrders(signal) {
  const token = getAuthToken();

  const response = await fetch(buildApiUrl('/api/orders'), {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, 'Không thể tải danh sách đơn hàng.'));
  }

  return payload.data || [];
}

export async function fetchOrderByCode(orderCode, signal) {
  const token = getAuthToken();
  const response = await fetch(buildApiUrl(`/api/orders/${encodeURIComponent(orderCode)}`), {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, 'Không thể tải thông tin đơn hàng.'));
  }

  return payload.data;
}

export async function fetchOrderPaymentQr(orderCode, signal) {
  const token = getAuthToken();
  const response = await fetch(buildApiUrl(`/api/orders/${encodeURIComponent(orderCode)}/payment/qr`), {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, 'Không thể tạo mã QR thanh toán.'));
  }

  return payload.data;
}
