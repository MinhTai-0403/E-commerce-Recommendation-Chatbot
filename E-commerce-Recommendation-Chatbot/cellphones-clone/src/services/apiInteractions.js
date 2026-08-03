import { buildApiUrl, fetchApiJson } from './apiProducts';
import { getAuthToken } from './apiAuth';

function getErrorMessage(payload, fallback) {
  if (typeof payload?.message === 'string') return payload.message;
  if (typeof payload?.error === 'string') return payload.error;
  if (typeof payload?.error?.message === 'string') return payload.error.message;
  return fallback;
}

async function postJson(path, body, signal) {
  const token = getAuthToken();
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, `API lỗi ${response.status}`));
  }

  return payload;
}

export async function fetchProductReviews(identifier, signal) {
  const payload = await fetchApiJson(`/api/products/${encodeURIComponent(identifier)}/reviews`, {
    limit: 30,
  }, signal);
  return payload;
}

export async function createProductReview(identifier, body, signal) {
  const payload = await postJson(`/api/products/${encodeURIComponent(identifier)}/reviews`, body, signal);
  return payload;
}

export async function fetchProductQuestions(identifier, signal) {
  const payload = await fetchApiJson(`/api/products/${encodeURIComponent(identifier)}/questions`, {
    limit: 30,
  }, signal);
  return payload;
}

export async function createProductQuestion(identifier, body, signal) {
  const payload = await postJson(`/api/products/${encodeURIComponent(identifier)}/questions`, body, signal);
  return payload;
}
