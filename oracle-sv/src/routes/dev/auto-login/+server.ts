import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

// Local-dev-only convenience: signs in as the seeded local admin so the
// dashboard never shows a login screen while running `vite dev`. `dev` is a
// SvelteKit build-time constant that is only ever true under the dev
// server — it cannot be true in a production build regardless of env vars,
// so this route is dead code (falls through to the 404 below) in any
// deployed environment even if AUTO_LOGIN_DEV were accidentally set there.
export async function POST() {
  if (!dev || env.AUTO_LOGIN_DEV !== 'true') {
    return json({ error: 'Not available' }, { status: 404 });
  }

  const email = env.AUTO_LOGIN_DEV_EMAIL;
  const password = env.AUTO_LOGIN_DEV_PASSWORD;
  if (!email || !password) {
    return json({ error: 'AUTO_LOGIN_DEV_EMAIL and AUTO_LOGIN_DEV_PASSWORD must be set.' }, { status: 500 });
  }

  const apiOrigin = env.PUBLIC_API_ORIGIN || 'http://127.0.0.1:3001';
  const res = await fetch(`${apiOrigin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({ error: data.error ?? data.message ?? 'Auto-login failed.' }, { status: res.status });
  }
  return json(data);
}
