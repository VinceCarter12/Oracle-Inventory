<svelte:head>
  <title>Dashboard — Oracle Inventory</title>
</svelte:head>

<script lang="ts">
  import { can } from '$lib/utils/permissions';
  import { api } from '$lib/api';
  import { onMount } from 'svelte';

  interface Stats { total: number; assigned: number; available: number; forRepair: number; forDisposal: number; }
  interface CategoryRow { id: string; name: string; _count: { assets: number }; }
  interface ActivityLog {
    id: string; action: string; entity: string; entityId: string;
    metadata: Record<string, unknown> | null; createdAt: string;
    user: { id: string; name: string; email: string } | null;
  }

  let stats     = $state<Stats>({ total: 0, assigned: 0, available: 0, forRepair: 0, forDisposal: 0 });
  let categories = $state<CategoryRow[]>([]);
  let activities = $state<ActivityLog[]>([]);
  let loading    = $state(true);
  let search     = $state('');

  const filtered = $derived(activities.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = String(a.metadata?.name ?? a.entityId ?? '').toLowerCase();
    return name.includes(q) || a.entity.toLowerCase().includes(q) || a.entityId.toLowerCase().includes(q);
  }));

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  }

  function actionLabel(log: ActivityLog): string {
    const name = String(log.metadata?.name ?? log.entityId ?? '');
    const map: Record<string, string> = { create: 'Created', update: 'Updated', assign: 'Assigned', return: 'Returned', delete: 'Deleted' };
    return `${map[log.action] ?? log.action} — ${name}`;
  }

  function actionStatus(action: string): string {
    if (action === 'assign') return 'Assigned';
    if (action === 'return') return 'Available';
    if (action === 'repair' || action === 'maintenance') return 'Maintenance';
    return '';
  }

  onMount(async () => {
    try {
      const [s, cats, act] = await Promise.all([
        api.get<Stats>('/api/assets/stats'),
        api.get<CategoryRow[]>('/api/categories'),
        api.get<{ logs: ActivityLog[] }>('/api/activity?limit=15'),
      ]);
      if (s)    stats      = s;
      if (cats) categories = cats;
      if (act)  activities = act.logs;
    } catch (_) { /* show zeros/empty on error */ }
    finally { loading = false; }
  });
</script>

<div class="page">

  <!-- ── Page header ─────────────────────────────────────────────────── -->
  <div class="page-header">
    <div class="page-title-block">
      <h1 class="page-title">Overview</h1>
      <p class="page-sub">Summary of overall inventory data</p>
    </div>
  </div>

  <!-- ── Three stat cards ────────────────────────────────────────────── -->
  <div class="stats-grid">

    <!-- Total Assets card -->
    <div class="stat-card">
      <div class="stat-card-top">
        <div class="stat-icon-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
          </svg>
        </div>
        <div class="stat-title-block">
          <span class="stat-title">Total Assets</span>
          <span class="stat-subtitle">All Inventory Items</span>
        </div>
      </div>
      <div class="stat-value">{loading ? '…' : stats.total.toLocaleString()}</div>
      <a class="stat-link" href="/assets">View all assets →</a>
    </div>

    <!-- Assigned card -->
    <div class="stat-card">
      <div class="stat-card-top">
        <div class="stat-icon-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div class="stat-title-block">
          <span class="stat-title">Assigned Assets</span>
          <span class="stat-subtitle">Currently in Use</span>
        </div>
      </div>
      <div class="stat-value">{loading ? '…' : stats.assigned.toLocaleString()}</div>
      {#if can('view_inventory')}<a class="stat-link" href="/assignments">View assignments →</a>{/if}
    </div>

    <!-- Available card -->
    <div class="stat-card">
      <div class="stat-card-top">
        <div class="stat-icon-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M9 12l2 2 4-4"/>
            <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
          </svg>
        </div>
        <div class="stat-title-block">
          <span class="stat-title">Available Assets</span>
          <span class="stat-subtitle">Ready to Assign</span>
        </div>
      </div>
      <div class="stat-value">{loading ? '…' : stats.available.toLocaleString()}</div>
      {#if can('view_inventory')}<a class="stat-link" href="/assets">View available →</a>{/if}
    </div>

  </div>

  <!-- ── Categories panel ─────────────────────────────────────────────── -->
  <div class="categories-card">
    <div class="categories-head">
      <div>
        <div class="categories-title">Asset Categories</div>
        <div class="categories-sub">
          {#if loading}Loading…
          {:else if categories.length === 0}No categories yet
          {:else}{categories.length} categories · {stats.total} total assets{/if}
        </div>
      </div>
      {#if can('manage_settings')}
      <a class="add-btn" href="/settings?tab=categories">+ Add Categories</a>
      {/if}
    </div>

    {#if !loading && categories.length > 0}
    <div class="cat-grid">
      {#each categories as cat}
        <div class="cat-item">
          <div class="cat-item-top">
            <div class="cat-code-wrap">
              <span class="cat-code">{cat.name.slice(0, 3).toUpperCase()}</span>
              <span class="cat-label">{cat.name}</span>
            </div>
          </div>
          <div class="cat-count">{cat._count.assets.toLocaleString()}</div>
          <div class="cat-limit">{cat._count.assets === 1 ? '1 asset' : `${cat._count.assets} assets`}</div>
          <span class="cat-status">{cat._count.assets > 0 ? 'Active' : 'Empty'}</span>
        </div>
      {/each}
    </div>
    {:else if !loading}
    <div class="empty-state">No categories found. Add assets to see categories here.</div>
    {/if}
  </div>

  <!-- ── Recent activities ───────────────────────────────────────────── -->
  <div class="activities-card">
    <div class="activities-head">
      <div class="activities-title">Recent Activities</div>
      <div class="activities-controls">
        <div class="search-wrap">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            class="search-input"
            type="search"
            placeholder="Search"
            bind:value={search}
            aria-label="Search activities"
          />
        </div>
      </div>
    </div>

    <table class="activities-table">
      <thead>
        <tr>
          <th>Activity</th>
          <th>Entity</th>
          <th>By</th>
          <th>Date</th>
          <th>Time</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {#if loading}
          <tr><td colspan="6" class="empty-cell">Loading…</td></tr>
        {:else if filtered.length === 0}
          <tr><td colspan="6" class="empty-cell">No activity yet.</td></tr>
        {:else}
          {#each filtered as row}
            <tr>
              <td>
                <div class="act-name">
                  <div class="act-icon-box">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <rect x="2" y="7" width="20" height="10" rx="1"/><path d="M6 10.5H6.01M9 10.5H9.01M6 13.5H10" stroke-linecap="round"/>
                    </svg>
                  </div>
                  {actionLabel(row)}
                </div>
              </td>
              <td class="td-mono">{row.entity}</td>
              <td>{row.user?.name ?? '—'}</td>
              <td>{fmtDate(row.createdAt)}</td>
              <td>{fmtTime(row.createdAt)}</td>
              <td>
                {#if actionStatus(row.action)}
                  <span
                    class="status-badge"
                    class:status-badge--assigned={actionStatus(row.action) === 'Assigned'}
                    class:status-badge--available={actionStatus(row.action) === 'Available'}
                    class:status-badge--maintenance={actionStatus(row.action) === 'Maintenance'}
                  >{actionStatus(row.action)}</span>
                {:else}
                  <span class="status-badge">{row.action}</span>
                {/if}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>

</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 100%;
    min-width: 0;
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .page-title {
    font-size: 22px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.4px;
    font-family: var(--font-sans);
    line-height: 1.2;
  }

  .page-sub {
    font-size: 13px;
    color: var(--mute);
    font-family: var(--font-sans);
    margin-top: 3px;
  }

  /* ── Stat cards ── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }

  .stat-card {
    background: var(--canvas);
    border-radius: var(--r-lg);
    padding: 20px 22px 22px;
    box-shadow: var(--shadow-l2);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .stat-card--featured { background: var(--ink); color: var(--on-primary); }

  .stat-card-top {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 6px;
  }

  .stat-icon-wrap {
    width: 36px; height: 36px;
    border-radius: var(--r-md);
    background: var(--canvas-soft-2);
    color: var(--body);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  .stat-icon-wrap--featured { background: oklch(25% 0.01 285); color: var(--on-primary); }

  .stat-title-block { display: flex; flex-direction: column; gap: 1px; flex: 1; }

  .stat-title { font-size: 13.5px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.2px; }
  .stat-card--featured .stat-title { color: var(--on-primary); }

  .stat-subtitle { font-size: 11.5px; color: var(--mute); font-family: var(--font-sans); }
  .stat-card--featured .stat-subtitle { color: oklch(72% 0.01 285); }

  .stat-value {
    font-size: 28px; font-weight: 600; color: var(--ink);
    font-family: var(--font-sans); letter-spacing: -0.8px; line-height: 1.1; margin-top: 4px;
  }
  .stat-card--featured .stat-value { color: var(--on-primary); }

  .stat-link {
    display: inline-block; margin-top: 10px;
    font-size: 12.5px; font-family: var(--font-sans);
    color: var(--mute); text-decoration: none;
    transition: color 120ms ease;
  }
  .stat-link:hover { color: var(--body); }
  .stat-link--featured { color: oklch(65% 0.01 285); }
  .stat-link--featured:hover { color: var(--on-primary); }

  /* ── Categories card ── */
  .categories-card {
    background: var(--canvas);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-l2);
    padding: 20px 22px 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .categories-head {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  }

  .categories-title { font-size: 14.5px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.2px; }
  .categories-sub { font-size: 11.5px; color: var(--mute); font-family: var(--font-sans); margin-top: 2px; }

  .add-btn {
    height: 30px; padding: 0 12px;
    background: var(--ink); color: var(--on-primary);
    border: none; border-radius: var(--r-pill);
    font-size: 12.5px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; flex-shrink: 0; transition: opacity 120ms ease;
    display: inline-flex; align-items: center; text-decoration: none;
  }
  .add-btn:hover { opacity: 0.85; }

  .cat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
  }

  .cat-item {
    background: var(--canvas-soft-2); border-radius: var(--r-md);
    padding: 14px; display: flex; flex-direction: column; gap: 4px;
  }

  .cat-item-top { display: flex; align-items: center; justify-content: space-between; }
  .cat-code-wrap { display: flex; align-items: center; gap: 6px; }

  .cat-code {
    width: 28px; height: 20px; background: var(--hairline);
    border-radius: var(--r-xs); font-size: 10px; font-weight: 600;
    font-family: var(--font-mono); color: var(--body);
    display: flex; align-items: center; justify-content: center; letter-spacing: 0.3px;
  }

  .cat-label { font-size: 12.5px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.1px; }
  .cat-count { font-size: 20px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.5px; margin-top: 6px; }
  .cat-limit { font-size: 11px; color: var(--mute); font-family: var(--font-sans); }
  .cat-status { font-size: 11.5px; font-weight: 500; color: oklch(52% 0.18 152); font-family: var(--font-sans); margin-top: 2px; }

  .empty-state { font-size: 13px; color: var(--mute); font-family: var(--font-sans); padding: 16px 0; }

  /* ── Activities card ── */
  .activities-card {
    background: var(--canvas); border-radius: var(--r-lg);
    box-shadow: var(--shadow-l2); overflow: hidden;
  }

  .activities-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 20px 22px 16px;
  }

  .activities-title { font-size: 14.5px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.2px; }
  .activities-controls { display: flex; align-items: center; gap: 8px; }

  .search-wrap { position: relative; display: flex; align-items: center; }
  .search-icon { position: absolute; left: 9px; color: var(--mute); pointer-events: none; }

  .search-input {
    height: 32px; padding: 0 10px 0 28px; width: 180px;
    border: 1px solid var(--hairline); border-radius: var(--r-sm);
    background: var(--canvas); color: var(--ink); font-size: 13px;
    font-family: var(--font-sans); box-shadow: var(--shadow-l1);
  }
  .search-input::placeholder { color: var(--mute); }
  .search-input:focus { outline: none; border-color: var(--hairline-strong); }

  .activities-table { width: 100%; border-collapse: collapse; }

  .activities-table th {
    font-size: 11.5px; font-weight: 500; color: var(--mute);
    font-family: var(--font-mono); text-align: left; padding: 8px 22px;
    border-top: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline);
    background: var(--canvas-soft); white-space: nowrap; letter-spacing: 0.2px;
  }

  .activities-table td {
    padding: 13px 22px; font-size: 13px; font-family: var(--font-sans);
    color: var(--body); border-bottom: 1px solid var(--hairline); white-space: nowrap;
  }

  .activities-table tbody tr:last-child td { border-bottom: none; }
  .activities-table tbody tr:hover td { background: var(--canvas-soft); }

  .act-name { display: flex; align-items: center; gap: 9px; color: var(--ink); font-weight: 500; }

  .act-icon-box {
    width: 28px; height: 28px; border-radius: var(--r-sm);
    background: var(--ink); color: var(--on-primary);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }

  .td-mono { font-family: var(--font-mono); font-size: 12px; color: var(--mute); }

  .empty-cell { text-align: center; color: var(--mute); font-size: 13px; padding: 32px 22px !important; }

  .status-badge {
    display: inline-flex; align-items: center; height: 22px; padding: 0 9px;
    border-radius: var(--r-full); font-size: 11.5px; font-weight: 500;
    font-family: var(--font-sans); background: var(--canvas-soft-2); color: var(--mute);
  }
  .status-badge--assigned  { background: oklch(94% 0.06 152); color: oklch(40% 0.18 152); }
  .status-badge--available { background: oklch(94% 0.04 264); color: oklch(45% 0.18 264); }
  .status-badge--maintenance { background: oklch(94% 0.06 80); color: oklch(48% 0.18 80); }

  @media (max-width: 600px) {
    .stats-grid { grid-template-columns: 1fr; }
    .activities-head { flex-direction: column; align-items: flex-start; }
    .activities-card { overflow-x: auto; }
  }
</style>
