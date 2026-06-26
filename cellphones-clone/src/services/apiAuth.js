import { buildApiUrl } from './apiProducts';

const AUTH_TOKEN_KEY = 'smember_token';
const AUTH_USER_KEY = 'smember_user';

function getErrorMessage(payload, fallback) {
  if (typeof payload?.message === 'string') return payload.message;
  if (typeof payload?.error === 'string') return payload.error;
  if (typeof payload?.error?.message === 'string') return payload.error.message;
  return fallback;
}

async function postAuthJson(path, body) {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, 'Không thể kết nối tới máy chủ xác thực.'));
  }

  return payload;
}

export function saveAuthSession(payload = {}) {
  const token = payload.token || payload.data?.token;
  const user = payload.user || payload.data?.user;

  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  if (user) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getStoredUser() {
  const rawUser = localStorage.getItem(AUTH_USER_KEY);
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export async function requestRegisterOtp(registerPayload) {
  return postAuthJson('/api/auth/request-register-otp', registerPayload);
}

export async function verifyRegisterOtp({ email, otp }) {
  const payload = await postAuthJson('/api/auth/verify-register-otp', { email, otp });
  saveAuthSession(payload);
  return payload;
}

export async function loginSmember({ identifier, phone, email, password }) {
  const payload = await postAuthJson('/api/auth/login', {
    identifier: identifier || email || phone,
    phone,
    email,
    password,
  });
  saveAuthSession(payload);
  return payload;
}

export async function fetchCurrentSmember() {
  const token = getAuthToken();
  if (!token) return null;

  const response = await fetch(buildApiUrl('/api/auth/me'), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, 'Phiên đăng nhập không hợp lệ.'));
  }

  return payload.data?.user || null;
}
