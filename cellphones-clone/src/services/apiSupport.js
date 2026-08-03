import { getAuthToken } from './apiAuth';
import { buildApiUrl } from './apiProducts';

const SUPPORT_TICKETS_KEY = 'cellphones_support_tickets';

function getRequestHeaders({ json = false, trackingToken = '' } = {}) {
  const token = getAuthToken();
  return {
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(trackingToken ? { 'X-Support-Token': trackingToken } : {}),
  };
}

async function supportJson(path, {
  method = 'GET',
  body,
  trackingToken = '',
} = {}) {
  const response = await fetch(buildApiUrl(path), {
    method,
    credentials: 'include',
    headers: getRequestHeaders({
      json: body !== undefined,
      trackingToken,
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(
      payload.message
      || payload.error?.message
      || `Không thể kết nối bộ phận hỗ trợ (${response.status}).`,
    );
  }

  return payload;
}

export function getStoredSupportTickets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SUPPORT_TICKETS_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.requestCode && item?.trackingToken).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

export function getStoredSupportToken(requestCode) {
  return getStoredSupportTickets()
    .find((item) => item.requestCode === requestCode)
    ?.trackingToken || '';
}

function rememberSupportTicket(ticket = {}) {
  if (!ticket.requestCode || !ticket.trackingToken) return;

  const tickets = getStoredSupportTickets()
    .filter((item) => item.requestCode !== ticket.requestCode);
  tickets.unshift({
    requestCode: ticket.requestCode,
    trackingToken: ticket.trackingToken,
    createdAt: ticket.createdAt || new Date().toISOString(),
  });
  localStorage.setItem(SUPPORT_TICKETS_KEY, JSON.stringify(tickets.slice(0, 20)));
}

export async function createSupportRequest(body) {
  const payload = await supportJson('/api/support-requests', {
    method: 'POST',
    body,
  });
  rememberSupportTicket(payload.data);
  return payload;
}

export function getMySupportRequests() {
  return supportJson('/api/support-requests/mine');
}

export function getSupportRequest(requestCode, trackingToken = getStoredSupportToken(requestCode)) {
  return supportJson(`/api/support-requests/${encodeURIComponent(requestCode)}`, {
    trackingToken,
  });
}

export function sendSupportMessage(
  requestCode,
  content,
  trackingToken = getStoredSupportToken(requestCode),
) {
  return supportJson(`/api/support-requests/${encodeURIComponent(requestCode)}/messages`, {
    method: 'POST',
    body: { content },
    trackingToken,
  });
}
