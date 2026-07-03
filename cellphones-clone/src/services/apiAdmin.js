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
