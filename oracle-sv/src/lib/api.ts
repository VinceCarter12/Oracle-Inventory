import { authStore } from '$lib/stores/auth.svelte';
import { PUBLIC_API_ORIGIN } from '$env/static/public';

/**
 * Optional cross-origin API base. Keep same-origin `/api` as the safe default;
 * when configured, callers may provide only the public API origin (never `/api`).
 */
function resolveApiOrigin(): string {
  const configured = PUBLIC_API_ORIGIN?.trim();
  if (!configured) return '';
  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (url.search || url.hash || url.pathname.replace(/\/+$/, '').endsWith('/api')) return '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export const API_ORIGIN = resolveApiOrigin();

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${normalized}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = authStore.token;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && !(init.body instanceof FormData) && init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(apiUrl(path), {
    ...init,
    headers,
  });
  if (!res.ok) {
    if (res.status === 401) {
      authStore.logout();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
  }
  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as T;
}

export const api = {
  get:    <T>(path: string)                  => request<T>(path),
  post:   <T>(path: string, body: unknown, init: RequestInit = {}) => request<T>(path, { ...init, method: 'POST', body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)   => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)   => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: <T>(path: string)                  => request<T>(path, { method: 'DELETE' }),
  raw: apiFetch,
};
