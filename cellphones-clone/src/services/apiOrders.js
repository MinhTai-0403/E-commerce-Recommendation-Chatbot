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

export async function fetchMyOrders(signal) {
  const token = getAuthToken();
  if (!token) return [];

  const response = await fetch(buildApiUrl('/api/orders'), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, 'Không thể tải danh sách đơn hàng.'));
  }

  return payload.data || [];
}
