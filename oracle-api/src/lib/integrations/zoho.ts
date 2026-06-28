/**
 * Zoho Directory integration.
 *
 * Server-only. Config via server .env — never exposed to frontend.
 *   ZOHO_CLIENT_ID
 *   ZOHO_CLIENT_SECRET
 *   ZOHO_REFRESH_TOKEN
 *   ZOHO_ORG_ID
 *   ZOHO_ACCOUNTS_URL   (default: https://accounts.zoho.com)
 *   ZOHO_DIRECTORY_URL  (default: https://directory.zoho.com)
 *
 * Degrades silently when unconfigured or on any API failure.
 * Logs only outcomes (matched/enriched) — never raw PII.
 */

export interface ZohoUser {
  email?: string;
  employeeId?: string;
  department?: string;
  title?: string;
  displayName?: string;
}

// ── Config ────────────────────────────────────────────────────────────────────
function cfg() {
  return {
    clientId:     process.env.ZOHO_CLIENT_ID     ?? "",
    clientSecret: process.env.ZOHO_CLIENT_SECRET ?? "",
    refreshToken: process.env.ZOHO_REFRESH_TOKEN ?? "",
    orgId:        process.env.ZOHO_ORG_ID        ?? "",
    accountsUrl:  (process.env.ZOHO_ACCOUNTS_URL  ?? "https://accounts.zoho.com").replace(/\/$/, ""),
    directoryUrl: (process.env.ZOHO_DIRECTORY_URL ?? "https://directory.zoho.com").replace(/\/$/, ""),
  };
}

export function isZohoConfigured(): boolean {
  const c = cfg();
  return !!(c.clientId && c.clientSecret && c.refreshToken && c.orgId);
}

// ── OAuth token refresh ────────────────────────────────────────────────────────
let _token: string | null = null;
let _tokenExpiry = 0;

async function getAccessToken(): Promise<string | null> {
  if (_token && Date.now() < _tokenExpiry - 60_000) return _token;
  const c = cfg();
  const body = new URLSearchParams({
    grant_type:    "refresh_token",
    client_id:     c.clientId,
    client_secret: c.clientSecret,
    refresh_token: c.refreshToken,
  });
  const ctl = new AbortController();
  const tid = setTimeout(() => ctl.abort(), 2000);
  try {
    const r = await fetch(`${c.accountsUrl}/oauth/v2/token`, {
      method: "POST", body, signal: ctl.signal,
    });
    clearTimeout(tid);
    if (!r.ok) { _token = null; return null; }
    const j = await r.json() as { access_token?: string; expires_in?: number };
    _token = j.access_token ?? null;
    _tokenExpiry = Date.now() + (j.expires_in ?? 3600) * 1000;
    return _token;
  } catch {
    clearTimeout(tid);
    _token = null;
    return null;
  }
}

// ── 24h lookup cache (by email and by name+branch) ────────────────────────────
const _cache = new Map<string, { v: ZohoUser | null; exp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function cGet(k: string): ZohoUser | null | undefined {
  const e = _cache.get(k);
  if (!e) return undefined;
  if (Date.now() > e.exp) { _cache.delete(k); return undefined; }
  return e.v;
}

function cSet(k: string, v: ZohoUser | null) {
  _cache.set(k, { v, exp: Date.now() + CACHE_TTL });
  // Prune expired entries when cache grows large
  if (_cache.size > 5000) {
    const now = Date.now();
    for (const [ck, cv] of _cache) if (now > cv.exp) _cache.delete(ck);
  }
}

// ── Circuit breaker (open after 3 failures in 10s, reset after 30s) ───────────
const _cb = { fails: 0, lastFail: 0, open: false };
function cbOk() { if (_cb.open) { _cb.open = false; _cb.fails = 0; } }
function cbFail() {
  _cb.fails++;
  _cb.lastFail = Date.now();
  if (_cb.fails >= 3) _cb.open = true;
}
function cbAllow(): boolean {
  if (!_cb.open) return true;
  if (Date.now() - _cb.lastFail > 30_000) { _cb.open = false; _cb.fails = 0; return true; }
  return false;
}

// ── Rate limiter: token bucket ~10 req/s ─────────────────────────────────────
const _rl = { tokens: 10, last: Date.now() };
function rlAllow(): boolean {
  const now = Date.now();
  _rl.tokens = Math.min(10, _rl.tokens + (now - _rl.last) / 100); // +10/s
  _rl.last = now;
  if (_rl.tokens >= 1) { _rl.tokens--; return true; }
  return false;
}

// ── Directory API call ────────────────────────────────────────────────────────
async function directorySearch(col: string, val: string): Promise<ZohoUser | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const c = cfg();
  const url = `${c.directoryUrl}/api/v1/orgs/${c.orgId}/users?searchColumn=${encodeURIComponent(col)}&searchValue=${encodeURIComponent(val)}&limit=1`;
  const ctl = new AbortController();
  const tid = setTimeout(() => ctl.abort(), 2000);
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      signal: ctl.signal,
    });
    clearTimeout(tid);
    if (!r.ok) { cbFail(); return null; }
    const j = await r.json() as {
      users?: {
        primaryEmail?: string; employeeID?: string;
        department?: string; title?: string; displayName?: string;
      }[];
    };
    cbOk();
    const u = j.users?.[0];
    if (!u) return null;
    return {
      email:       u.primaryEmail,
      employeeId:  u.employeeID,
      department:  u.department,
      title:       u.title,
      displayName: u.displayName,
    };
  } catch {
    clearTimeout(tid);
    cbFail();
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Lookup by email. Returns null silently when unconfigured, rate-limited, or circuit open. */
export async function lookupByEmail(email: string): Promise<ZohoUser | null> {
  if (!isZohoConfigured() || !cbAllow() || !rlAllow()) return null;
  const k = `e:${email.toLowerCase()}`;
  const cached = cGet(k);
  if (cached !== undefined) return cached;
  const result = await directorySearch("email", email);
  cSet(k, result);
  return result;
}

/** Lookup by display name (branch hint is used only for cache keying). */
export async function lookupByName(name: string, branchHint?: string): Promise<ZohoUser | null> {
  if (!isZohoConfigured() || !cbAllow() || !rlAllow()) return null;
  const k = `n:${name.toLowerCase()}${branchHint ? `:${branchHint.toLowerCase()}` : ""}`;
  const cached = cGet(k);
  if (cached !== undefined) return cached;
  const result = await directorySearch("displayName", name);
  cSet(k, result);
  return result;
}

/**
 * Enrich an employee candidate using Zoho Directory.
 * Excel values always win; Zoho only fills gaps or confirms equal values.
 * Returns merged data plus provenance ("excel" | "zoho" | "none").
 * Degrades silently on any failure.
 */
export async function enrichEmployee(input: {
  name?: string | null;
  email?: string | null;
  employeeId?: string | null;
  branchHint?: string | null;
}): Promise<{
  name: string | null;
  email: string | null;
  employeeId: string | null;
  department: string | null;
  source: "excel" | "zoho" | "none";
}> {
  const fallback = {
    name:       input.name       ?? null,
    email:      input.email      ?? null,
    employeeId: input.employeeId ?? null,
    department: null,
    source:     (input.name || input.email ? "excel" : "none") as "excel" | "zoho" | "none",
  };

  if (!isZohoConfigured()) return fallback;

  let zoho: ZohoUser | null = null;
  try {
    if (input.email) {
      zoho = await lookupByEmail(input.email);
    } else if (input.name) {
      zoho = await lookupByName(input.name, input.branchHint ?? undefined);
    }
  } catch {
    // degrade silently
    return fallback;
  }

  if (!zoho) return fallback;

  const filledByZoho = (
    (!input.email      && !!zoho.email) ||
    (!input.employeeId && !!zoho.employeeId) ||
    (!input.name       && !!zoho.displayName)
  );

  return {
    name:       input.name       ?? zoho.displayName ?? null,
    email:      input.email      ?? zoho.email       ?? null,
    employeeId: input.employeeId ?? zoho.employeeId  ?? null,
    department: zoho.department  ?? null,
    source:     filledByZoho ? "zoho" : "excel",
  };
}

/** Clear the in-memory cache (useful for tests). */
export function clearZohoCache(): void {
  _cache.clear();
  _token = null;
  _tokenExpiry = 0;
  _cb.fails = 0;
  _cb.open = false;
}
