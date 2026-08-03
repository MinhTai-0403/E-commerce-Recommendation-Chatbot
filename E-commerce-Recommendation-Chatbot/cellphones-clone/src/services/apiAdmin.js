import { buildApiUrl } from './apiProducts';
import { getAuthToken } from './apiAuth';

function getErrorMessage(payload, fallback) {
  if (typeof payload?.message === 'string') return payload.message;
  if (typeof payload?.error === 'string') return payload.error;
  if (typeof payload?.error?.message === 'string') return payload.error.message;
  return fallback;
}

function createAdminHeaders(extraHeaders = {}) {
  const headers = {
    Accept: 'application/json',
    ...extraHeaders,
  };
  const token = getAuthToken();

  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

async function adminRequest(path, options = {}) {
  const response = await fetch(buildApiUrl(path, options.params || {}), {
    method: options.method || 'GET',
    credentials: 'include',
    headers: createAdminHeaders(options.body ? { 'Content-Type': 'application/json' } : {}),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, `Admin API lỗi ${response.status}`));
  }

  return payload;
}

export async function fetchAdminSummary() {
  const payload = await adminRequest('/api/admin/summary');
  return payload.data;
}

export async function fetchAdminUsers(params = {}) {
  const payload = await adminRequest('/api/admin/users', { params });
  return payload;
}

export async function updateAdminUser(userId, body) {
  const payload = await adminRequest(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body,
  });
  return payload.data;
}

export async function deleteAdminUser(userId) {
  const payload = await adminRequest(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  return payload.deleted;
}

export async function fetchAdminOrders(params = {}) {
  const payload = await adminRequest('/api/admin/orders', {
    params: {
      limit: 50,
      ...params,
    },
  });
  return payload;
}

export async function updateAdminOrder(orderId, body) {
  const payload = await adminRequest(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    body,
  });
  return payload.data;
}

export async function fetchAdminProducts(params = {}) {
  const payload = await adminRequest('/api/products', {
    params: {
      source: 'all',
      limit: 30,
      sort: 'latest',
      ...params,
    },
  });
  return payload;
}

export async function createAdminProduct(body) {
  const payload = await adminRequest('/api/products', {
    method: 'POST',
    body,
  });
  return payload.data;
}

export async function updateAdminProduct(identifier, body) {
  const payload = await adminRequest(`/api/products/${encodeURIComponent(identifier)}`, {
    method: 'PATCH',
    body,
  });
  return payload.data;
}

export async function deleteAdminProduct(identifier) {
  const payload = await adminRequest(`/api/products/${encodeURIComponent(identifier)}`, {
    method: 'DELETE',
  });
  return payload.deleted;
}

export async function fetchAdminReviews(params = {}) {
  const payload = await adminRequest('/api/admin/reviews', {
    params: {
      limit: 50,
      ...params,
    },
  });
  return payload;
}

export async function updateAdminReview(reviewId, body) {
  const payload = await adminRequest(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, {
    method: 'PATCH',
    body,
  });
  return payload.data;
}

export async function deleteAdminReview(reviewId) {
  const payload = await adminRequest(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, {
    method: 'DELETE',
  });
  return payload.deleted;
}

export async function fetchAdminQuestions(params = {}) {
  const payload = await adminRequest('/api/admin/questions', {
    params: {
      limit: 50,
      ...params,
    },
  });
  return payload;
}

export async function updateAdminQuestion(questionId, body) {
  const payload = await adminRequest(`/api/admin/questions/${encodeURIComponent(questionId)}`, {
    method: 'PATCH',
    body,
  });
  return payload.data;
}

export async function deleteAdminQuestion(questionId) {
  const payload = await adminRequest(`/api/admin/questions/${encodeURIComponent(questionId)}`, {
    method: 'DELETE',
  });
  return payload.deleted;
}

export async function fetchAdminCoupons(params = {}) {
  const payload = await adminRequest('/api/admin/coupons', {
    params: {
      limit: 50,
      ...params,
    },
  });
  return payload;
}

export async function createAdminCoupon(body) {
  const payload = await adminRequest('/api/admin/coupons', {
    method: 'POST',
    body,
  });
  return payload.data;
}

export async function updateAdminCoupon(couponId, body) {
  const payload = await adminRequest(`/api/admin/coupons/${encodeURIComponent(couponId)}`, {
    method: 'PATCH',
    body,
  });
  return payload.data;
}

export async function deleteAdminCoupon(couponId) {
  const payload = await adminRequest(`/api/admin/coupons/${encodeURIComponent(couponId)}`, {
    method: 'DELETE',
  });
  return payload.deleted;
}

export async function fetchAdminAuditLogs(params = {}) {
  const payload = await adminRequest('/api/admin/audit-logs', {
    params: {
      limit: 50,
      ...params,
    },
  });
  return payload;
}

export async function fetchAdminInventory(params = {}) {
  const payload = await adminRequest('/api/admin/inventory', {
    params: {
      limit: 50,
      ...params,
    },
  });
  return payload;
}

export async function createAdminInventory(body) {
  const payload = await adminRequest('/api/admin/inventory', {
    method: 'POST',
    body,
  });
  return payload.data;
}

export async function updateAdminInventory(identifier, body) {
  const payload = await adminRequest(`/api/admin/inventory/${encodeURIComponent(identifier)}`, {
    method: 'PATCH',
    body,
  });
  return payload.data;
}

export async function deleteAdminInventory(identifier) {
  const payload = await adminRequest(`/api/admin/inventory/${encodeURIComponent(identifier)}`, {
    method: 'DELETE',
  });
  return payload.deleted;
}

export async function fetchAdminPayments(params = {}) {
  const payload = await adminRequest('/api/admin/payments', {
    params: {
      limit: 50,
      ...params,
    },
  });
  return payload;
}

export async function updateAdminPayment(identifier, body) {
  const payload = await adminRequest(`/api/admin/payments/${encodeURIComponent(identifier)}`, {
    method: 'PATCH',
    body,
  });
  return payload.data;
}

export async function fetchAdminShipments(params = {}) {
  const payload = await adminRequest('/api/admin/shipments', {
    params: {
      limit: 50,
      ...params,
    },
  });
  return payload;
}

export async function createAdminShipment(body) {
  const payload = await adminRequest('/api/admin/shipments', {
    method: 'POST',
    body,
  });
  return payload.data;
}

export async function updateAdminShipment(identifier, body) {
  const payload = await adminRequest(`/api/admin/shipments/${encodeURIComponent(identifier)}`, {
    method: 'PATCH',
    body,
  });
  return payload.data;
}

export async function deleteAdminShipment(identifier) {
  const payload = await adminRequest(`/api/admin/shipments/${encodeURIComponent(identifier)}`, {
    method: 'DELETE',
  });
  return payload.deleted;
}

export async function fetchAdminRevenue(params = {}) {
  const payload = await adminRequest('/api/admin/revenue', { params });
  return payload;
}

export function buildAdminExportUrl(target = 'orders', params = {}) {
  return buildApiUrl(`/api/admin/export/${encodeURIComponent(target)}.csv`, params);
}

export async function fetchAdminReturns(params = {}) {
  const payload = await adminRequest('/api/admin/returns', {
    params: {
      limit: 50,
      ...params,
    },
  });
  return payload;
}

export async function updateAdminReturn(returnId, body) {
  const payload = await adminRequest(`/api/admin/returns/${encodeURIComponent(returnId)}`, {
    method: 'PATCH',
    body,
  });
  return payload.data;
}

export async function deleteAdminReturn(returnId) {
  const payload = await adminRequest(`/api/admin/returns/${encodeURIComponent(returnId)}`, {
    method: 'DELETE',
  });
  return payload.deleted;
}