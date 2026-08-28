import { authStore } from '$lib/stores/auth.svelte';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authStore.token;
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
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
