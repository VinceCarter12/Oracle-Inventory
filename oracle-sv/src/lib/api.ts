import { authStore } from '$lib/stores/auth.svelte';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authStore.token;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15_000);
  const res = await fetch(path, {
    ...init,
    signal: init?.signal ?? controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out while loading ${path}.`);
    }
    throw error;
  }).finally(() => globalThis.clearTimeout(timeout));
  if (!res.ok) {
    if (res.status === 401) {
      authStore.logout();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as T;
}

async function raw(path: string, init?: RequestInit): Promise<Response> {
  const token = authStore.token;
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    authStore.logout();
    window.location.href = '/login';
  }
  return res;
}

export const api = {
  get:    <T>(path: string)                  => request<T>(path),
  post:   <T>(path: string, body: unknown, headers?: HeadersInit)   => request<T>(path, { method: 'POST', headers, body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown, headers?: HeadersInit)   => request<T>(path, { method: 'PUT', headers, body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)   => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: <T>(path: string)                  => request<T>(path, { method: 'DELETE' }),
  raw,
};
