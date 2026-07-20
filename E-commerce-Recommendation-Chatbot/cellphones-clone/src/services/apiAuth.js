import { buildApiUrl } from './apiProducts';

const AUTH_TOKEN_KEY = 'smember_token';
const AUTH_USER_KEY = 'smember_user';

function getErrorMessage(payload, fallback) {
  if (typeof payload?.message === 'string') return payload.message;
  if (typeof payload?.error === 'string') return payload.error;
  if (typeof payload?.error?.message === 'string') return payload.error.message;
  return fallback;
}

async function authJson(path, { method = 'POST', body, includeToken = false } = {}) {
  const token = includeToken ? getAuthToken() : '';
  const response = await fetch(buildApiUrl(path), {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, 'Không thể kết nối tới máy chủ xác thực.'));
  }

  return payload;
}

async function postAuthJson(path, body) {
  return authJson(path, { method: 'POST', body });
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

  const response = await fetch(buildApiUrl('/api/auth/me'), {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) return null;

  if (!response.ok || payload.ok === false) {
    throw new Error(getErrorMessage(payload, 'Phiên đăng nhập không hợp lệ.'));
  }

  return payload.data?.user || null;
}

export async function logoutSmember() {
  try {
    await postAuthJson('/api/auth/logout', {});
  } finally {
    clearAuthSession();
  }
}

export async function updateCurrentSmember(profilePayload) {
  const payload = await authJson('/api/auth/me', {
    method: 'PATCH',
    body: profilePayload,
    includeToken: true,
  });
  saveAuthSession(payload);
  return payload.data?.user || null;
}

export async function changeSmemberPassword({ currentPassword, newPassword }) {
  const payload = await authJson('/api/auth/change-password', {
    method: 'PATCH',
    body: { currentPassword, newPassword },
    includeToken: true,
  });
  return payload.data;
}

export async function requestEducationVerificationOtp({ email, type, schoolName }) {
  const payload = await authJson('/api/auth/education/request-otp', {
    method: 'POST',
    body: { email, type, schoolName },
    includeToken: true,
  });
  return payload.data;
}

export async function verifyEducationVerificationOtp({ email, otp }) {
  const payload = await authJson('/api/auth/education/verify-otp', {
    method: 'POST',
    body: { email, otp },
    includeToken: true,
  });
  saveAuthSession(payload);
  return payload.data?.user || null;
}

export async function requestForgotPasswordOtp(identifier) {
  return postAuthJson('/api/auth/forgot-password/request-otp', { identifier });
}

export async function resetForgotPassword({ email, otp, newPassword }) {
  return postAuthJson('/api/auth/forgot-password/reset', { email, otp, newPassword });
}
