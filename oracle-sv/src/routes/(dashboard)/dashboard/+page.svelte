<svelte:head>
  <title>Dashboard — Oracle Inventory</title>
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';
  import { toCsv, downloadCsv } from '$lib/utils/csv';
  import StatCard    from '$lib/components/StatCard.svelte';
  import SectionCard from '$lib/components/SectionCard.svelte';
  import ChartBar    from '$lib/components/ChartBar.svelte';
  import ChartDonut  from '$lib/components/ChartDonut.svelte';
  import ChartLine   from '$lib/components/ChartLine.svelte';
  import SearchInput     from '$lib/components/SearchInput.svelte';
  import DateRangePicker from '$lib/components/date/DateRangePicker.svelte';

  // ── Types ──────────────────────────────────────────────────────────────────
  interface Kpi {
    totalAssets: number;
    assigned:    number;
    available:   number;
    forRepair:   number;
    forDisposal: number;
  }
  interface MonthPoint  { month: string; assignments: number; returns: number; }
  interface CategoryStat { name: string; count: number; assigned: number; }
  interface BranchStat   { name: string; total: number; assigned: number; }
  interface DeptStat     { name: string; assets: number; employees: number; }
  interface Movement {
    id:        string;
    type:      string;
    asset:     string;
    assetTag:  string | null;
    employee:  string | null;
    createdAt: string;
  }
  interface Summary {
    kpi:              Kpi;
    movementsByMonth: MonthPoint[];
    topCategories:    CategoryStat[];
    branchStats:      BranchStat[];
    deptStats:        DeptStat[];
    recentMovements:  Movement[];
  }
  interface TrendMonth {
    month: string; repairsSent: number; repairsReturned: number; disposals: number;
  }
  interface FrequentAsset {
    assetId:     string;
    name:        string;
    assetTag:    string | null;
    category:    string | null;
    branch:      string | null;
    movements:   number;
    lastMovedAt: string | null;
  }
  interface ActivityLog {
    id:        string;
    action:    string;
    entity:    string;
    entityId:  string;
    metadata:  Record<string, unknown> | null;
    createdAt: string;
    user:      { id: string; name: string; email: string } | null;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let summary       = $state<Summary | null>(null);
  let activities    = $state<ActivityLog[]>([]);
  let trend         = $state<TrendMonth[]>([]);
  let frequentAssets = $state<FrequentAsset[]>([]);
  let loading       = $state(true);
  let search        = $state('');
  let dateFrom      = $state('');
  let dateTo        = $state('');

  // ── Derived ────────────────────────────────────────────────────────────────
  const kpi = $derived(summary?.kpi ?? {
    totalAssets: 0, assigned: 0, available: 0, forRepair: 0, forDisposal: 0,
  });

  // Condition donut: 4 segments using DESIGN.md semantic colors
  const conditionSegments = $derived([
    { label: 'Assigned',     value: kpi.assigned,    color: 'var(--ink)'   },
    { label: 'Available',    value: kpi.available,   color: 'var(--link)'  },
    { label: 'Under Repair', value: kpi.forRepair,   color: 'var(--warning)'      },
    { label: 'For Disposal', value: kpi.forDisposal, color: 'var(--error)' },
  ]);

  // Utilization metrics — derived from branchStats (no extra fetch needed)
  const utilization = $derived.by(() => {
    const stats = summary?.branchStats ?? [];
    if (!stats.length) return null;
    const totalAssets   = stats.reduce((s, b) => s + b.total, 0);
    const totalAssigned = stats.reduce((s, b) => s + b.assigned, 0);
    const utils = stats.map(b => b.total > 0 ? b.assigned / b.total : 0);
    const best  = stats.reduce((a, b) =>
      (b.total > 0 ? b.assigned / b.total : 0) > (a.total > 0 ? a.assigned / a.total : 0) ? b : a
    );
    return {
      overall:        totalAssets > 0 ? Math.round(totalAssigned / totalAssets * 100) : 0,
      avgBranch:      Math.round(utils.reduce((s, u) => s + u, 0) / utils.length * 100),
      bestBranch:     best.name,
      bestPct:        best.total > 0 ? Math.round(best.assigned / best.total * 100) : 0,
      underutilized:  stats.filter(b => b.total > 0 && b.assigned / b.total < 0.3).length,
    };
  });

  // Movement frequency — max for bar scaling
  const maxMovements = $derived(Math.max(1, ...frequentAssets.map(a => a.movements)));

  const MOVEMENT_LABEL: Record<string, string> = {
    assignment:      'Assigned',
    transfer:        'Transferred',
    return_approved: 'Returned',
    resignation:     'Offboarded',
    new_hire:        'Onboarded',
  };

  // ── Export (full asset snapshot CSV) ───────────────────────────────────────
  let exporting = $state(false);

  async function exportAllCsv() {
    if (exporting) return;
    exporting = true;
    try {
      const data = await api.get<{
        columns: { key: string; label: string }[];
        rows: Record<string, string>[];
      }>('/api/reports/total-assets');
      const cols = data.columns.flatMap(c =>
        c.key === '_asset' ? [{ key: 'name', label: 'Asset' }, { key: 'id', label: 'Asset ID' }] : [c]
      );
      downloadCsv(toCsv(cols, data.rows), `oracle-inventory-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      alert('Export failed. Please try again.');
    } finally {
      exporting = false;
    }
  }

  const filteredActivity = $derived(
    activities.filter(a => {
      if (!search) return true;
      const q    = search.toLowerCase();
      const name = String(a.metadata?.name ?? a.entityId ?? '').toLowerCase();
      return name.includes(q) || a.entity.toLowerCase().includes(q);
    })
  );

  // ── Formatters ─────────────────────────────────────────────────────────────
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }
  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-PH', {
      hour: '2-digit', minute: '2-digit',
    });
  }
  function actionLabel(log: ActivityLog): string {
    const name = String(log.metadata?.name ?? log.entityId ?? '');
    const MAP: Record<string, string> = {
      create: 'Created', update: 'Updated', assign: 'Assigned',
      return: 'Returned', delete: 'Deleted', import: 'Imported',
    };
    return `${MAP[log.action] ?? log.action} — ${name}`;
  }
  function statusText(action: string): string {
    if (action === 'assign')                     return 'Assigned';
    if (action === 'return')                     return 'Returned';
    if (action === 'repair' || action === 'maintenance') return 'Maintenance';
    return '';
  }

  // ── Summary fetch (re-called when date range changes) ──────────────────────
  async function loadSummary() {
    const params = new URLSearchParams();
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo)   params.set('to',   dateTo);
    const qs = params.size ? `?${params}` : '';
    const sum = await api.get<Summary>(`/api/reports/summary${qs}`).catch(() => null);
    if (sum) summary = sum;
  }

  // ── Data fetch ─────────────────────────────────────────────────────────────
  onMount(async () => {
    // Fetch independently — a 403 on one endpoint must not blank the others
    const [, act, trd, freq] = await Promise.all([
      loadSummary(),
      can('access_logs')
        ? api.get<{ logs: ActivityLog[] }>('/api/activity?limit=15').catch(() => null)
        : Promise.resolve(null),
      api.get<{ months: TrendMonth[] }>('/api/reports/condition-trend').catch(() => null),
      api.get<{ assets: FrequentAsset[] }>('/api/reports/movement-frequency?limit=10').catch(() => null),
    ]);
    if (act)  activities     = act.logs;
    if (trd)  trend          = trd.months;
    if (freq) frequentAssets = freq.assets;
    loading = false;
  });
</script>

<div class="page">

  <!-- ── Page header ──────────────────────────────────────────────────────── -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Overview</h1>
      <p class="page-sub">Summary of overall inventory data</p>
    </div>
    <div class="header-actions">
      <DateRangePicker
        bind:from={dateFrom}
        bind:to={dateTo}
        placeholder="Filter by date range"
        onapply={loadSummary}
        onchange={({ from, to }) => { if (!from && !to) loadSummary(); }}
      />
      {#if can('view_reports')}
        <button class="btn-export" onclick={exportAllCsv} disabled={exporting}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      {/if}
    </div>
  </div>

  <!-- ── Stat cards — row 1 (3 col) ──────────────────────────────────────── -->
  <div class="stat-row stat-row--3">
    <StatCard
      label="Total Assets"
      helper="All inventory items"
      value={kpi.totalAssets.toLocaleString()}
      {loading}
      href="/assets"
    />
    <StatCard
      label="Assigned"
      helper="Currently in use"
      value={kpi.assigned.toLocaleString()}
      {loading}
      href={can('view_inventory') ? '/assignments' : undefined}
    />
    <StatCard
      label="Available"
      helper="Ready to assign"
      value={kpi.available.toLocaleString()}
      {loading}
      href={can('view_inventory') ? '/assets' : undefined}
    />
  </div>

  <!-- ── Stat cards — row 2 (2 col) ──────────────────────────────────────── -->
  <div class="stat-row stat-row--2">
    <StatCard
      label="Under Repair"
      helper="Currently being serviced"
      value={kpi.forRepair.toLocaleString()}
      {loading}
    />
    <StatCard
      label="For Disposal"
      helper="Flagged for retirement"
      value={kpi.forDisposal.toLocaleString()}
      {loading}
    />
  </div>

  <!-- ── Charts row ───────────────────────────────────────────────────────── -->
  <div class="two-col">
    <SectionCard title="Activity" subtitle="Assignments & returns — last 6 months">
      <ChartBar data={summary?.movementsByMonth ?? []} {loading} />
    </SectionCard>

    <SectionCard title="Condition" subtitle="Asset status breakdown">
      <ChartDonut
        segments={conditionSegments}
        {loading}
      />
    </SectionCard>
  </div>

  <!-- ── By branch ────────────────────────────────────────────────────────── -->
  <SectionCard title="By Branch" subtitle="Asset distribution across locations" flush>
    {#if loading}
      <div class="table-empty">Loading…</div>
    {:else if !summary?.branchStats?.length}
      <div class="table-empty">No branch data yet.</div>
    {:else}
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Branch</th>
              <th class="td-r">Total</th>
              <th class="td-r">Assigned</th>
              <th class="td-r">Available</th>
              <th class="td-r">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {#each summary.branchStats as b}
              {@const util = b.total > 0 ? Math.round(b.assigned / b.total * 100) : 0}
              <tr>
                <td class="td-name">{b.name}</td>
                <td class="td-r td-mono">{b.total}</td>
                <td class="td-r td-mono">{b.assigned}</td>
                <td class="td-r td-mono">{b.total - b.assigned}</td>
                <td class="td-r">
                  <div class="util-cell">
                    <span class="td-mono">{util}%</span>
                    <div class="util-bar-track">
                      <div class="util-bar-fill" style="width: {util}%"></div>
                    </div>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </SectionCard>

  <!-- ── Utilization + By department ──────────────────────────────────────── -->
  <div class="two-col">
    <SectionCard title="Utilization" subtitle="Asset deployment efficiency">
      {#if loading}
        <div class="table-empty">Loading…</div>
      {:else if !utilization}
        <div class="table-empty">No utilization data yet.</div>
      {:else}
        <div class="util-metrics">
          <div class="metric">
            <span class="metric-value">{utilization.overall}%</span>
            <span class="metric-label">Overall utilization</span>
          </div>
          <div class="metric">
            <span class="metric-value">{utilization.avgBranch}%</span>
            <span class="metric-label">Avg. per branch</span>
          </div>
          <div class="metric">
            <span class="metric-value metric-value--sm">{utilization.bestBranch}</span>
            <span class="metric-label">Top branch · {utilization.bestPct}%</span>
          </div>
          <div class="metric">
            <span class="metric-value">{utilization.underutilized}</span>
            <span class="metric-label">Underutilized branches (&lt;30%)</span>
          </div>
        </div>
      {/if}
    </SectionCard>

    <SectionCard title="By Department" subtitle="Assets held per department" flush>
      {#if loading}
        <div class="table-empty">Loading…</div>
      {:else if !summary?.deptStats?.length}
        <div class="table-empty">No department data yet.</div>
      {:else}
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Department</th>
                <th class="td-r">Employees</th>
                <th class="td-r">Assets Held</th>
              </tr>
            </thead>
            <tbody>
              {#each summary.deptStats as d}
                <tr>
                  <td class="td-name">{d.name}</td>
                  <td class="td-r td-mono">{d.employees}</td>
                  <td class="td-r td-mono">{d.assets}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </SectionCard>
  </div>

  <!-- ── Condition trend + Movement frequency ─────────────────────────────── -->
  <div class="two-col">
    <SectionCard title="Condition Trend" subtitle="Repair & disposal events — last 6 months">
      <ChartLine
        data={trend}
        series={[
          { key: 'repairsSent',     label: 'Sent to repair', color: 'var(--warning)' },
          { key: 'repairsReturned', label: 'Repaired',       color: 'var(--link)'    },
          { key: 'disposals',       label: 'Disposed',       color: 'var(--error)'   },
        ]}
        {loading}
      />
    </SectionCard>

    <SectionCard title="Most Moved Assets" subtitle="Top {frequentAssets.length || 10} by movement count">
      {#if loading}
        <div class="table-empty">Loading…</div>
      {:else if !frequentAssets.length}
        <div class="table-empty">No movement data yet.</div>
      {:else}
        <div class="freq-list">
          {#each frequentAssets as a (a.assetId)}
            <div class="freq-row">
              <div class="freq-info">
                <span class="freq-name">{a.name}</span>
                <span class="freq-sub">{a.assetTag ?? a.category ?? '—'}{a.branch ? ` · ${a.branch}` : ''}</span>
              </div>
              <div class="freq-bar-track">
                <div class="freq-bar-fill" style="width: {Math.round(a.movements / maxMovements * 100)}%"></div>
              </div>
              <span class="freq-count td-mono">{a.movements}</span>
            </div>
          {/each}
        </div>
      {/if}
    </SectionCard>
  </div>

  <!-- ── Assignment history ───────────────────────────────────────────────── -->
  <SectionCard title="Assignment History" subtitle="Recent assign, return & transfer events" flush>
    {#if loading}
      <div class="table-empty">Loading…</div>
    {:else if !summary?.recentMovements?.length}
      <div class="table-empty">No movement events yet.</div>
    {:else}
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Asset</th>
              <th>Employee</th>
              <th>Date</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {#each summary.recentMovements as m (m.id)}
              <tr>
                <td>
                  <span
                    class="badge"
                    class:badge--assigned={m.type === 'assignment' || m.type === 'new_hire'}
                    class:badge--returned={m.type === 'return_approved'}
                    class:badge--maintenance={m.type === 'transfer'}
                  >{MOVEMENT_LABEL[m.type] ?? m.type}</span>
                </td>
                <td class="td-name">{m.asset}{m.assetTag ? ` (${m.assetTag})` : ''}</td>
                <td>{m.employee ?? '—'}</td>
                <td class="td-mono td-mute">{fmtDate(m.createdAt)}</td>
                <td class="td-mono td-mute">{fmtTime(m.createdAt)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </SectionCard>

  <!-- ── Top categories ───────────────────────────────────────────────────── -->
  {#if (summary?.topCategories ?? []).length > 0}
    <SectionCard
      title="Top Categories"
      subtitle="{summary!.topCategories.length} categories · {kpi.totalAssets} total assets"
    >
      {#snippet action()}
        {#if can('manage_settings')}
          <a class="action-link" href="/settings?tab=categories">+ Manage</a>
        {/if}
      {/snippet}
      <div class="cat-grid">
        {#each summary!.topCategories as cat}
          <div class="cat-item">
            <span class="cat-code">{cat.name.slice(0, 3).toUpperCase()}</span>
            <span class="cat-name">{cat.name}</span>
            <span class="cat-count">{cat.count}</span>
            <span class="cat-sub">{cat.count === 1 ? '1 asset' : `${cat.count} assets`}</span>
          </div>
        {/each}
      </div>
    </SectionCard>
  {/if}

  <!-- ── Recent activity ──────────────────────────────────────────────────── -->
  <SectionCard title="Recent Activity" subtitle="Last 15 events" flush>
    {#snippet action()}
      <SearchInput bind:value={search} placeholder="Search activity…" />
    {/snippet}

    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Activity</th>
            <th>Type</th>
            <th>By</th>
            <th>Date</th>
            <th>Time</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr><td colspan="6" class="table-empty">Loading…</td></tr>
          {:else if filteredActivity.length === 0}
            <tr><td colspan="6" class="table-empty">No activity yet.</td></tr>
          {:else}
            {#each filteredActivity as row}
              {@const status = statusText(row.action)}
              <tr>
                <td>
                  <span class="act-label">{actionLabel(row)}</span>
                </td>
                <td class="td-mono td-mute">{row.entity}</td>
                <td>{row.user?.name ?? '—'}</td>
                <td class="td-mono td-mute">{fmtDate(row.createdAt)}</td>
                <td class="td-mono td-mute">{fmtTime(row.createdAt)}</td>
                <td>
                  {#if status}
                    <span
                      class="badge"
                      class:badge--assigned={status === 'Assigned'}
                      class:badge--returned={status === 'Returned'}
                      class:badge--maintenance={status === 'Maintenance'}
                    >{status}</span>
                  {:else}
                    <span class="badge">{row.action}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </SectionCard>

</div>

<style>
  /* ── Page layout ── */
  .page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    min-width: 0;
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .page-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.5px;
    line-height: 1.2;
  }

  .page-sub {
    font-size: 13px;
    color: var(--mute);
    font-family: var(--font-sans);
    margin-top: 3px;
  }

  /* ── Export button ── */
  .btn-export {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 13px;
    border-radius: var(--r-md);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    border: 1px solid var(--hairline);
    background: var(--canvas);
    color: var(--ink);
    transition: background 100ms ease;
    line-height: 1;
    flex-shrink: 0;
  }

  .btn-export:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .btn-export:disabled { opacity: 0.55; cursor: not-allowed; }

  /* ── Stat rows ── */
  .stat-row {
    display: grid;
    gap: 12px;
  }

  .stat-row--3 { grid-template-columns: repeat(3, 1fr); }
  .stat-row--2 { grid-template-columns: repeat(2, 1fr); }

  /* ── Two column layout ── */
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  /* ── Shared action link (e.g. + Manage) ── */
  .action-link {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 10px;
    background: var(--ink);
    color: var(--on-primary);
    border-radius: var(--r-pill);
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    text-decoration: none;
    transition: opacity 120ms ease;
    white-space: nowrap;
  }

  .action-link:hover { opacity: 0.82; }

  /* ── Shared table chrome ── */
  .table-scroll {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
  }

  .data-table th {
    font-size: 11px;
    font-weight: 500;
    color: var(--mute);
    font-family: var(--font-mono);
    text-align: left;
    padding: 8px 20px;
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
    background: var(--canvas-soft);
    white-space: nowrap;
    letter-spacing: 0.2px;
    text-transform: uppercase;
  }

  .data-table td {
    padding: 11px 20px;
    font-size: 13px;
    font-family: var(--font-sans);
    color: var(--body);
    border-bottom: 1px solid var(--hairline);
    white-space: nowrap;
  }

  .data-table tbody tr:last-child td { border-bottom: none; }
  .data-table tbody tr:hover td { background: var(--canvas-soft); }

  .table-empty {
    text-align: center;
    color: var(--mute);
    font-size: 13px;
    font-family: var(--font-sans);
    padding: 28px 20px;
  }

  .td-r    { text-align: right; }
  .td-mono { font-family: var(--font-mono); font-size: 12px; }
  .td-mute { color: var(--mute); }
  .td-name { font-weight: 500; color: var(--ink); }

  /* ── Utilization bar ── */
  .util-cell {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .util-bar-track {
    width: 48px;
    height: 4px;
    border-radius: 2px;
    background: var(--hairline);
    overflow: hidden;
    flex-shrink: 0;
  }

  .util-bar-fill {
    height: 100%;
    background: var(--ink);
    border-radius: 2px;
    transition: width 300ms ease;
  }

  /* ── Utilization metrics panel ── */
  .util-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .metric {
    background: var(--canvas-soft-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .metric-value {
    font-size: 22px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.5px;
    line-height: 1.1;
  }

  .metric-value--sm {
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .metric-label {
    font-size: 11px;
    color: var(--mute);
    font-family: var(--font-sans);
  }

  /* ── Movement frequency list ── */
  .freq-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .freq-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .freq-info {
    display: flex;
    flex-direction: column;
    width: 150px;
    flex-shrink: 0;
    min-width: 0;
  }

  .freq-name {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--ink);
    font-family: var(--font-sans);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .freq-sub {
    font-size: 10.5px;
    color: var(--mute);
    font-family: var(--font-sans);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .freq-bar-track {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--hairline);
    overflow: hidden;
  }

  .freq-bar-fill {
    height: 100%;
    background: var(--ink);
    border-radius: 3px;
    transition: width 300ms ease;
  }

  .freq-count {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink);
    width: 28px;
    text-align: right;
    flex-shrink: 0;
  }

  /* ── Category grid ── */
  .cat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }

  .cat-item {
    background: var(--canvas-soft-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .cat-code {
    font-size: 10px;
    font-weight: 600;
    font-family: var(--font-mono);
    color: var(--mute);
    letter-spacing: 0.4px;
  }

  .cat-name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.1px;
    margin-top: 2px;
  }

  .cat-count {
    font-size: 20px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.5px;
    line-height: 1.1;
    margin-top: 4px;
  }

  .cat-sub {
    font-size: 11px;
    color: var(--mute);
    font-family: var(--font-sans);
  }

  /* ── Activity table specific ── */
  .act-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    font-family: var(--font-sans);
  }

  /* ── Status badges ── */
  .badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 8px;
    border-radius: var(--r-full);
    font-size: 11px;
    font-weight: 500;
    font-family: var(--font-sans);
    background: var(--canvas-soft-2);
    color: var(--mute);
    border: 1px solid var(--hairline);
  }

  .badge--assigned    { background: oklch(94% 0.04 152); color: oklch(38% 0.16 152); border-color: oklch(88% 0.06 152); }
  .badge--returned    { background: oklch(94% 0.04 264); color: oklch(40% 0.18 264); border-color: oklch(88% 0.06 264); }
  .badge--maintenance { background: oklch(95% 0.06  80); color: oklch(45% 0.16  80); border-color: oklch(88% 0.08  80); }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .two-col { grid-template-columns: 1fr; }
  }

  @media (max-width: 640px) {
    .stat-row--3 { grid-template-columns: 1fr 1fr; }
    .stat-row--2 { grid-template-columns: 1fr; }
  }
</style>
