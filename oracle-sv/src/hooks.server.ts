import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/first-login'];

// Routes that require a valid session cookie
const PROTECTED_PREFIX = '/';

export const handle: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;

  // Local-dev-only: skip every auth guard below. `dev` is a SvelteKit
  // build-time constant, only ever true under `vite dev` — it cannot be
  // true in a deployed build no matter what env vars are set there, so this
  // branch is unreachable outside a local dev server.
  if (dev && env.AUTO_LOGIN_DEV === 'true') {
    if (path === '/') redirect(307, '/dashboard');
    return resolve(event);
  }

  // Always allow public routes
  if (PUBLIC_ROUTES.some((r) => path === r || path.startsWith(r + '/'))) {
    return resolve(event);
  }

  // Root redirect
  if (path === '/') {
    redirect(307, '/login');
  }

  // For all dashboard routes: check the session cookie set by the auth store.
  // The JWT itself lives in localStorage (client-only), so this cookie is a
  // lightweight server-readable signal that a valid session exists.
  if (path.startsWith('/') && !path.startsWith('/api')) {
    const hasSession = event.cookies.get('has_session');
    if (!hasSession) {
      // Preserve the destination so the login page can redirect back after auth
      const redirectTo = encodeURIComponent(event.url.pathname + event.url.search);
      redirect(307, `/login?redirect=${redirectTo}`);
    }
  }

  return resolve(event);
};
