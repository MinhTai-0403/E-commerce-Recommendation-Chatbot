import { buildApiUrl } from './apiProducts';
import { getAuthToken } from './apiAuth';

function getErrorMessage(payload, fallback) {
  if (typeof payload?.message === 'string') return payload.message;
  if (typeof payload?.error === 'string') return payload.error;
  if (typeof payload?.error?.message === 'string') return payload.error.message;
  return fallback;
}

function createAuthHeaders(extraHeaders = {}) {
  const headers = {
    Accept: 'application/json',
    ...extraHeaders,
  };
  const token = getAuthToken();

  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

async function customerRequest(path, options = {}) {
  const response = await fetch(buildApiUrl(path, options.params || {}), {
    method: options.method || 'GET',
    credentials: 'include',
    headers: createAuthHeaders(options.body ? { 'Content-Type': 'application/json' } : {}),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, `API lỗi ${response.status}`));
  }

  return payload;
}

export async function fetchCustomerAddresses() {
  const payload = await customerRequest('/api/addresses');
  return payload.data || [];
}

export async function createCustomerAddress(body) {
  const payload = await customerRequest('/api/addresses', {
    method: 'POST',
    body,
  });
  return payload.data;
}

export async function updateCustomerAddress(addressId, body) {
  const payload = await customerRequest(`/api/addresses/${encodeURIComponent(addressId)}`, {
    method: 'PATCH',
    body,
  });
  return payload.data;
}

export async function setDefaultCustomerAddress(addressId) {
  const payload = await customerRequest(`/api/addresses/${encodeURIComponent(addressId)}/default`, {
    method: 'PATCH',
  });
  return payload.data;
}

export async function deleteCustomerAddress(addressId) {
  const payload = await customerRequest(`/api/addresses/${encodeURIComponent(addressId)}`, {
    method: 'DELETE',
  });
  return payload.deleted;
}

export async function fetchCustomerWishlist() {
  const payload = await customerRequest('/api/wishlist');
  return payload.data || [];
}

export async function addCustomerWishlistItem(product) {
  const payload = await customerRequest('/api/wishlist', {
    method: 'POST',
    body: product,
  });
  return payload.data;
}

export async function removeCustomerWishlistItem(identifier) {
  const payload = await customerRequest(`/api/wishlist/${encodeURIComponent(identifier)}`, {
    method: 'DELETE',
  });
  return payload.deleted;
}

export async function fetchCustomerNotifications(params = {}) {
  const payload = await customerRequest('/api/notifications', { params });
  return payload.data || [];
}

export async function fetchCustomerVouchers() {
  const payload = await customerRequest('/api/me/vouchers');
  return payload.data || [];
}

export async function claimCustomerVoucher(code) {
  const payload = await customerRequest('/api/me/vouchers/claim', {
    method: 'POST',
    body: { code: String(code || '').trim().toUpperCase() },
  });
  return {
    voucher: payload.data,
    message: payload.message || 'Đã thêm mã giảm giá vào kho voucher.',
  };
}

export async function fetchCustomerWarranties() {
  const payload = await customerRequest('/api/me/warranties');
  return payload.data || [];
}

export async function fetchCustomerInvoices() {
  const payload = await customerRequest('/api/me/invoices');
  return payload.data || [];
}

export async function fetchCustomerReturns(params = {}) {
  const payload = await customerRequest('/api/returns', { params });
  return payload.data || [];
}

export async function createCustomerReturnRequest(body) {
  const payload = await customerRequest('/api/returns', {
    method: 'POST',
    body,
  });
  return payload.data;
}

export async function markCustomerNotificationRead(notificationId) {
  const payload = await customerRequest(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
  });
  return payload.data;
}

export async function markAllCustomerNotificationsRead() {
  const payload = await customerRequest('/api/notifications/read-all', {
    method: 'PATCH',
  });
  return payload.updated;
}

export async function deleteCustomerNotification(notificationId) {
  const payload = await customerRequest(`/api/notifications/${encodeURIComponent(notificationId)}`, {
    method: 'DELETE',
  });
  return payload.deleted;
}

export async function fetchRecentlyViewedProducts(params = {}) {
  const payload = await customerRequest('/api/products/recently-viewed', { params });
  return payload.data || [];
}

export async function trackProductView(product) {
  const payload = await customerRequest('/api/user-events/view-product', {
    method: 'POST',
    body: product,
  });
  return payload.data;
}