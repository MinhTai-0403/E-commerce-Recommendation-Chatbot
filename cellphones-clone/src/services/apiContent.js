import { buildApiUrl } from './apiProducts';

async function fetchJson(path, { signal } = {}) {
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || payload.error?.message || `HTTP ${response.status}`);
  }
  return payload;
}

export function fetchContentPage(path, signal) {
  return fetchJson(`/api/content/page?path=${encodeURIComponent(path)}`, { signal });
}

export function fetchContentRoutes(signal) {
  return fetchJson('/api/content/routes', { signal });
}

export function fetchSearchSuggestions(query, {
  limit = 5,
  location = '',
  signal,
} = {}) {
  const params = new URLSearchParams({
    q: String(query || '').trim(),
    limit: String(limit),
  });
  if (location) params.set('location', location);
  return fetchJson(`/api/search/suggestions?${params.toString()}`, { signal });
}
