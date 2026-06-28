export type AuthUser = {
  id: string;
  name: string;
  email: string;
  roleId: string | null;
  role: string | null;
  permissions: string[];
  mustChangePassword: boolean;
};

// Bump this when the stored shape changes — forces all old sessions to re-login
const AUTH_VERSION = 'v4';

let _user = $state<AuthUser | null>(null);
let _token = $state<string | null>(null);

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function clearStorage() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  localStorage.removeItem('auth_version');
  // Clear session flag cookie used by hooks.server.ts for SSR route protection
  document.cookie = 'has_session=; path=/; max-age=0; SameSite=Lax';
}

function setSessionCookie(exp: number) {
  const maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
  document.cookie = `has_session=1; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export const authStore = {
  get user() { return _user; },
  get token() { return _token; },
  get isAuthenticated() { return !!_token && !!_user; },

  /** Persist auth data after a successful login response */
  login(user: AuthUser, token: string) {
    _user = user;
    _token = token;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('auth_version', AUTH_VERSION);
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (typeof payload.exp === 'number') setSessionCookie(payload.exp);
    } catch { /* ignore — cookie is a best-effort SSR signal */ }
  },

  /** Clear auth state (call on logout or 401) */
  logout() {
    _user = null;
    _token = null;
    clearStorage();
  },

  /** Rehydrate store from localStorage on app start */
  init() {
    // Version mismatch → old shape → force re-login
    if (localStorage.getItem('auth_version') !== AUTH_VERSION) {
      clearStorage();
      return;
    }
    const token = localStorage.getItem('auth_token');
    const userRaw = localStorage.getItem('auth_user');
    if (!token || !userRaw || isTokenExpired(token)) {
      clearStorage();
      return;
    }
    try {
      const parsed = JSON.parse(userRaw);
      // Require full V3 shape: id, email, permissions array, role string
      if (
        !parsed?.id ||
        !parsed?.email ||
        !Array.isArray(parsed?.permissions) ||
        !('role' in parsed)
      ) {
        clearStorage();
        return;
      }
      _user = parsed as AuthUser;
      _token = token;
      // Refresh the session cookie (may have been cleared by browser restart)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (typeof payload.exp === 'number') setSessionCookie(payload.exp);
      } catch { /* ignore */ }
    } catch {
      clearStorage();
    }
  },

  /** Clear mustChangePassword flag after successful first-login password set */
  clearMustChangePassword() {
    if (!_user) return;
    _user = { ..._user, mustChangePassword: false };
    localStorage.setItem('auth_user', JSON.stringify(_user));
  },

  /** Check if the current user has a given permission key */
  hasPermission(key: string): boolean {
    if (!_user) return false;
    // Handle legacy object role shape { name: "super_admin" } just in case
    const roleName =
      typeof _user.role === 'string'
        ? _user.role
        : (_user.role as unknown as { name?: string } | null)?.name ?? '';
    // Super admin bypass — also check roleId as fallback for old stored data
    if (roleName === 'super_admin' || _user.roleId === 'role-super-admin') return true;
    return Array.isArray(_user.permissions) && _user.permissions.includes(key);
  },
};
