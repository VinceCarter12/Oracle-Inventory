<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { onChange } from '$lib/ws';
  import DatePicker from '$lib/components/date/DatePicker.svelte';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import Pagination from '$lib/components/Pagination.svelte';

  // ── Types ────────────────────────────────────────────────────────────────────

  interface ActivityLog {
    id:        string;
    action:    string;
    entity:    string;
    entityId:  string | null;
    metadata:  Record<string, unknown> | null;
    createdAt: string;
    user:      { id: string; name: string; email: string } | null;
  }

  interface LogsResponse {
    logs:   ActivityLog[];
    total:  number;
    limit:  number;
    offset: number;
  }

  // ── State ────────────────────────────────────────────────────────────────────

  let logs      = $state<ActivityLog[]>([]);
  let total     = $state(0);
  let loading   = $state(true);
  let loadErr   = $state('');
  interface Category { key: string; label: string; }
  interface ActorOption { id: string; name: string; email: string; }

  let categories = $state<Category[]>([]);
  let actors     = $state<ActorOption[]>([]);

  let filterCategory = $state('');
  let filterUserId    = $state('');
  let filterAction = $state('');
  let filterFrom   = $state('');
  let filterTo     = $state('');
  let perPage      = $state(25);
  let currentPage  = $state(1);
  let gotoInput    = $state('');

  const LIMIT_OPTIONS = [10, 25, 50, 100];

  // ── Load ─────────────────────────────────────────────────────────────────────

  async function loadLogs() {
    loading = true;
    loadErr = '';
    try {
      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (filterUserId)   params.set('userId', filterUserId);
      if (filterAction) params.set('action', filterAction);
      if (filterFrom)   params.set('from', filterFrom);
      if (filterTo)     params.set('to', filterTo);
      params.set('limit',  String(perPage));
      params.set('offset', String((currentPage - 1) * perPage));

      const res = await api.get<LogsResponse>(`/api/activity?${params}`);
      logs  = res.logs;
      total = res.total;
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    try {
      [categories, actors] = await Promise.all([
        api.get<Category[]>('/api/activity/categories'),
        api.get<ActorOption[]>('/api/activity/users'),
      ]);
    } catch { /* non-critical */ }
    await loadLogs();
  });

  onDestroy(onChange('*', () => loadLogs()));

  function applyFilters() { currentPage = 1; loadLogs(); }
  function clearFilters() {
    filterCategory = ''; filterUserId = ''; filterAction = ''; filterFrom = ''; filterTo = '';
    currentPage = 1;
    loadLogs();
  }

  // ── Pagination ──────────────────────────────────────────────────────────────────

  const totalPages = $derived(Math.max(1, Math.ceil(total / perPage)));
  function handlePageChange() { loadLogs(); }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  // Map action → log level
  const LEVEL_MAP: Record<string, 'info' | 'warning' | 'error'> = {
    create:               'info',
    update:               'warning',
    delete:               'error',
    password_changed:     'info',
    ASSET_CREATED:        'info',
    ASSET_UPDATED:        'warning',
    ASSET_DELETED:        'error',
    EMPLOYEE_CREATED:     'info',
    EMPLOYEE_UPDATED:     'warning',
    EMPLOYEE_DEACTIVATED: 'error',
    ASSET_ASSIGNED:       'info',
    ASSET_RETURNED:       'warning',
    TURNOVER_PROCESSED:   'error',
    USER_CREATED:         'info',
    USER_UPDATED:         'warning',
    USER_DELETED:         'error',
    USER_STATUS_CHANGED:  'warning',
    USER_ROLE_ASSIGNED:   'info',
    USER_PASSWORD_RESET:  'warning',
    ROLE_CREATED:         'info',
    ROLE_UPDATED:         'warning',
    ROLE_DELETED:         'error',
    ROLE_PERMISSIONS_SET: 'info',
    BRANCH_CREATED:       'info',
    BRANCH_UPDATED:       'warning',
    BRANCH_ARCHIVED:      'error',
    BRANCH_UNARCHIVED:    'info',
    BRANCH_DELETED:       'error',
    CATEGORY_CREATED:     'info',
    CATEGORY_UPDATED:     'warning',
    CATEGORY_DELETED:     'error',
    USER_LOGGED_IN:       'info',
  };

  function logLevel(action: string): 'info' | 'warning' | 'error' {
    return LEVEL_MAP[action] ?? 'info';
  }

  function logStatus(level: 'info' | 'warning' | 'error'): { label: string; cls: string } {
    if (level === 'error')   return { label: 'Failed',  cls: 'badge-failed'  };
    if (level === 'warning') return { label: 'Warning', cls: 'badge-warning' };
    return                          { label: 'Success', cls: 'badge-success' };
  }

  function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function buildMessage(log: ActivityLog): string {
    const action = log.action.replace(/_/g, ' ').toLowerCase();
    const entity = log.entity;
    const m = log.metadata ?? {};
    const actor = log.user ? log.user.name : 'System';

    if (log.action === 'USER_LOGGED_IN') return `${actor} logged in`;
    if (m.assetName && m.employeeName) return `${actor} assigned ${m.assetName} to ${m.employeeName}`;
    if (m.name)          return `${actor} ${action}: ${m.name} (${entity})`;
    if (m.collectedCount !== undefined) return `${actor} collected ${m.collectedCount} asset(s) during turnover`;
    if (log.entityId)    return `${actor} performed ${action} on ${entity} ${String(log.entityId).slice(0, 8)}`;
    return `${actor} performed ${action} on ${entity}`;
  }
</script>

<div class="page">

  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Activity Logs' }]} />

  <!-- Header -->
  <div class="page-head">
    <div>
      <h1 class="page-title">Activity Logs</h1>
      <p class="page-sub">System audit trail — {total.toLocaleString()} entries</p>
    </div>
  </div>

  <!-- Filters -->
  <div class="filter-card">
    <span class="filter-card-label">Filters:</span>
    <div class="filter-bar">
      <select class="filter-select" bind:value={filterCategory} onchange={applyFilters}>
        <option value="">All categories</option>
        {#each categories as c}
          <option value={c.key}>{c.label}</option>
        {/each}
      </select>

      <select class="filter-select" bind:value={filterUserId} onchange={applyFilters}>
        <option value="">All users</option>
        {#each actors as a}
          <option value={a.id}>{a.name}</option>
        {/each}
      </select>

      <input
        class="filter-input"
        bind:value={filterAction}
        placeholder="Filter by action…"
        onkeydown={(ev) => ev.key === 'Enter' && applyFilters()}
      />

      <div class="date-range">
        <DatePicker bind:value={filterFrom} placeholder="From date" />
        <span class="date-sep">→</span>
        <DatePicker bind:value={filterTo} placeholder="To date" />
      </div>

      <button class="btn-apply" onclick={applyFilters}>Apply</button>
      <button class="btn-ghost" onclick={clearFilters}>Clear</button>
    </div>
  </div>

  <!-- Table card (always rendered) -->
  <div class="log-wrap">

    {#if loading}
      <div class="state-wrap">
        <span class="state-text">Loading activity logs…</span>
      </div>

    {:else if loadErr}
      <div class="state-wrap">
        <span class="state-text">Failed to load: {loadErr}</span>
        <button class="btn-ghost" onclick={() => loadLogs()}>Retry</button>
      </div>

    {:else if logs.length === 0}
      <div class="state-wrap">
        <span class="state-text">No activity logs found.</span>
        <button class="btn-ghost" onclick={clearFilters}>Clear filters</button>
      </div>

    {:else}
      <div class="table-scroll">
        <table class="log-table">
          <thead>
            <tr>
              <th class="th-level">Log Level</th>
              <th class="th-status">Status</th>
              <th class="th-user">User</th>
              <th class="th-ts">Timestamp</th>
              <th class="th-msg">Log Message</th>
            </tr>
          </thead>
          <tbody>
            {#each logs as log, i}
              {@const level  = logLevel(log.action)}
              {@const status = logStatus(level)}
              <tr class="log-row" class:row-odd={i % 2 !== 0}>
                <td class="td-level">
                  <span class="level-wrap level-{level}">
                    <svg class="diamond" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      <path d="M5 0L10 5L5 10L0 5Z" fill="currentColor"/>
                    </svg>
                    <span class="level-label">
                      {level === 'info' ? 'Info' : level === 'warning' ? 'Warning' : 'Error'}
                    </span>
                  </span>
                </td>
                <td class="td-status">
                  <span class="badge {status.cls}">{status.label}</span>
                </td>
                <td class="td-user">{log.user ? log.user.name : 'System'}</td>
                <td class="td-ts">{formatTimestamp(log.createdAt)}</td>
                <td class="td-msg">{buildMessage(log)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <Pagination bind:currentPage bind:perPage={perPage} {totalPages} perPageOptions={LIMIT_OPTIONS} onchange={handlePageChange} />
    {/if}
  </div>

</div>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; width: 100%; height: calc(100vh - 64px); min-height: 0; }

  /* ── Header ── */
  .page-head { display: flex; align-items: flex-start; }
  .page-title { font-size: 20px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.025em; margin: 0 0 2px; }
  .page-sub { font-size: 13px; color: var(--mute); font-family: var(--font-sans); margin: 0; }

  /* ── Filters ── */
  .filter-card {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    background: var(--canvas); border: 1px solid var(--hairline);
    border-radius: var(--r-md); padding: 10px 14px;
  }
  .filter-card-label { font-size: 13px; color: var(--mute); font-family: var(--font-sans); white-space: nowrap; flex-shrink: 0; }
  .filter-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1; }

  .filter-select {
    height: 34px; padding: 0 28px 0 10px;
    border: 1px solid var(--hairline); border-radius: var(--r-sm);
    background: var(--canvas); font-size: 13px; font-family: var(--font-sans);
    color: var(--body); outline: none; cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23888' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 9px center;
    transition: border-color 120ms ease;
  }

  .filter-input {
    height: 34px; padding: 0 10px; min-width: 180px;
    border: 1px solid var(--hairline); border-radius: var(--r-sm);
    background: var(--canvas); font-size: 13px; font-family: var(--font-sans);
    color: var(--body); outline: none; transition: border-color 120ms ease;
  }

  .filter-select:focus, .filter-input:focus { border-color: var(--link); }

  .date-range { display: flex; align-items: center; gap: 6px; }
  .date-sep { font-size: 13px; color: var(--mute); }

  .btn-apply {
    height: 34px; padding: 0 16px;
    background: var(--ink); color: var(--on-primary);
    border: none; border-radius: var(--r-sm);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; transition: opacity 120ms ease;
  }
  .btn-apply:hover { opacity: 0.85; }

  .btn-ghost {
    height: 34px; padding: 0 14px;
    border: 1px solid var(--hairline); border-radius: var(--r-sm);
    background: transparent; font-size: 13px; font-family: var(--font-sans);
    color: var(--body); cursor: pointer; transition: background 120ms ease;
  }
  .btn-ghost:hover { background: var(--canvas-soft-2); }

  /* ── States ── */
  .state-wrap {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px; padding: 48px 24px; text-align: center;
  }
  .state-text { font-size: 14px; color: var(--mute); font-family: var(--font-sans); }

  /* ── Table card ── */
  .log-wrap {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    overflow: hidden;
    box-shadow: var(--shadow-l1);
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .table-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .log-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 640px;
  }

  .log-table thead tr {
    border-bottom: 1px solid var(--hairline);
  }

  .log-table th {
    padding: 10px 18px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--mute);
    font-family: var(--font-sans);
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    background: var(--canvas-soft);
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .th-level  { width: 110px; }
  .th-status { width: 96px; }
  .th-user   { width: 140px; }
  .th-ts     { width: 168px; }
  .th-msg    { /* flex */ }
  .td-user   { white-space: nowrap; }

  .log-row td {
    padding: 9px 18px;
    font-size: 13px;
    font-family: var(--font-sans);
    color: var(--body);
    border-bottom: 1px solid var(--hairline);
    vertical-align: middle;
  }

  .log-row:last-child td { border-bottom: none; }
  .row-odd { background: oklch(97.5% 0 0); }
  .log-row:hover td { background: var(--canvas-soft-2) !important; }

  /* ── Level cell ── */
  .td-level { white-space: nowrap; }

  .level-wrap {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .diamond { flex-shrink: 0; }

  .level-label { font-size: 13px; font-weight: 400; }

  .level-info    .diamond,
  .level-info    .level-label { color: oklch(53% 0.22 264); }
  .level-warning .diamond,
  .level-warning .level-label { color: oklch(65% 0.22 55); }
  .level-error   .diamond,
  .level-error   .level-label { color: oklch(52% 0.24 25); }

  /* ── Status badge ── */
  .td-status { white-space: nowrap; }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 11.5px;
    font-weight: 500;
    font-family: var(--font-sans);
    letter-spacing: 0.02em;
  }

  .badge-success {
    background: oklch(94% 0.06 145);
    color: oklch(38% 0.14 145);
  }
  .badge-warning {
    background: oklch(95% 0.07 80);
    color: oklch(45% 0.16 55);
  }
  .badge-failed {
    background: oklch(95% 0.05 25);
    color: oklch(45% 0.20 25);
  }

  /* ── Timestamp cell ── */
  .td-ts {
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--body);
    white-space: nowrap;
  }

  /* ── Message cell ── */
  .td-msg { color: var(--body); line-height: 1.4; }

  /* ── Responsive ── */
  @media (max-width: 700px) {
    .filter-bar { gap: 6px; }
    .filter-input { min-width: 120px; }
    .date-range { flex-wrap: wrap; }
    .log-wrap { overflow-x: auto; }
  }
</style>
