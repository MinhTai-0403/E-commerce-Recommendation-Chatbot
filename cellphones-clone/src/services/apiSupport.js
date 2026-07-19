import { getAuthToken } from './apiAuth';
import { buildApiUrl } from './apiProducts';

export async function createSupportRequest(body) {
  const token = getAuthToken();
  const response = await fetch(buildApiUrl('/api/support-requests'), {
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
    throw new Error(
      payload.message
      || payload.error?.message
      || `Không thể gửi yêu cầu hỗ trợ (${response.status}).`,
    );
  }

  return payload;
}
