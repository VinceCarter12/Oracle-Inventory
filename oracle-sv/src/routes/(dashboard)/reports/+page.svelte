<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import DateRangePicker from '$lib/components/date/DateRangePicker.svelte';

  // ── API types ─────────────────────────────────────────────────────────────
  interface Branch   { id: string; name: string; }
  interface Category { id: string; name: string; }

  interface Summary {
    kpi: { totalAssets: number; assigned: number; available: number; forRepair: number; forDisposal: number; };
    movementsByMonth: { month: string; assignments: number; returns: number; }[];
    topCategories: { name: string; count: number; assigned: number; }[];
    branchStats: { name: string; total: number; assigned: number; }[];
  }

  // ── Load state ────────────────────────────────────────────────────────────
  let branches   = $state<Branch[]>([]);
  let categories = $state<Category[]>([]);
  let summary    = $state<Summary | null>(null);
  let loading    = $state(true);

  onMount(async () => {
    // Read initial date range from URL search params
    const params = $page.url.searchParams;
    dateFrom = params.get('from') ?? '';
    dateTo   = params.get('to')   ?? '';

    const [sum, brs, cats] = await Promise.all([
      api.get<Summary>('/api/reports/summary').catch(() => null),
      api.get<Branch[]>('/api/branches').catch(() => []),
      api.get<Category[]>('/api/categories').catch(() => []),
    ]);
    summary    = sum;
    branches   = brs;
    categories = cats;
    loading    = false;
  });

  // ── Filter state ──────────────────────────────────────────────────────────
  let dateFrom       = $state('');
  let dateTo         = $state('');

  function applyFilters() {
    const url = new URL($page.url);
    if (dateFrom) url.searchParams.set('from', dateFrom);
    else          url.searchParams.delete('from');
    if (dateTo)   url.searchParams.set('to', dateTo);
    else          url.searchParams.delete('to');
    goto(url.toString(), { replaceState: true, keepFocus: true });
  }
  let filterBranch   = $state('all');
  let filterCategory = $state('all');
  let filterStatus   = $state('all');
  let reportSearch   = $state('');

  // ── KPI values ────────────────────────────────────────────────────────────
  const kpi = $derived(summary?.kpi ?? { totalAssets: 0, assigned: 0, available: 0, forRepair: 0, forDisposal: 0 });

  // ── Category bar chart ────────────────────────────────────────────────────
  const CAT_COLORS = ['oklch(52% 0.21 264)', 'oklch(55% 0.18 210)', 'oklch(55% 0.19 155)', 'oklch(52% 0.22 340)', 'oklch(60% 0.20 60)'];

  const CAT_BARS = $derived((() => {
    const cats = summary?.topCategories ?? [];
    const max  = Math.max(1, ...cats.map(c => c.count));
    return cats.map((c, i) => ({
      label: c.name, value: String(c.count),
      pct: Math.round((c.count / max) * 100),
      pctLabel: `${Math.round((c.count / Math.max(1, summary!.kpi.totalAssets)) * 100)}%`,
      color: CAT_COLORS[i % CAT_COLORS.length],
    }));
  })());

  // ── Donut chart ───────────────────────────────────────────────────────────
  const CIRC = 314.16; // 2π × 50

  const DONUT = $derived((() => {
    if (!summary) return [];
    const { assigned, available, forRepair, forDisposal } = summary.kpi;
    const total = Math.max(1, assigned + available + forRepair + forDisposal);
    const segs = [
      { name: 'Assigned',    val: assigned,    color: 'oklch(52% 0.21 264)' },
      { name: 'Available',   val: available,   color: 'oklch(55% 0.19 155)' },
      { name: 'For repair',  val: forRepair,   color: 'oklch(60% 0.20 60)'  },
      { name: 'For disposal',val: forDisposal, color: 'oklch(52% 0.22 340)' },
    ].filter(s => s.val > 0);
    let offset = 0;
    return segs.map(s => {
      const pct   = s.val / total;
      const dash  = CIRC * pct;
      const gap   = CIRC - dash;
      const result = {
        color: s.color, name: s.name, val: String(s.val),
        pct: `${Math.round(pct * 100)}%`,
        dasharray: `${dash.toFixed(2)} ${gap.toFixed(2)}`,
        dashoffset: String(-offset.toFixed(2)),
      };
      offset += dash;
      return result;
    });
  })());

  // ── Assignment trend SVG path ─────────────────────────────────────────────
  // SVG area: viewBox "0 0 600 140", data y: 20..120, x: 38..538 (6 months)
  const TREND = $derived((() => {
    const data = summary?.movementsByMonth ?? [];
    if (data.length === 0) return { path: '', area: '', points: [], maxY: 0 };
    const maxVal = Math.max(1, ...data.map(d => d.assignments));
    const xs = [38, 138, 238, 338, 438, 538];
    const toY = (v: number) => 120 - Math.round((v / maxVal) * 100);
    const pts = data.map((d, i) => ({ x: xs[i] ?? xs[xs.length-1], y: toY(d.assignments), v: d.assignments }));
    const pathD = pts.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`)).join(' ');
    const areaD = `M${pts[0].x} 120 ${pts.map(p => `L${p.x} ${p.y}`).join(' ')} L${pts[pts.length-1].x} 120 Z`;
    return { path: pathD, area: areaD, points: pts, maxY: maxVal };
  })());

  let trendHoverIdx = $state<number | null>(null);

  // ── Branch utilization ────────────────────────────────────────────────────
  const BRANCH_COLORS = ['oklch(52% 0.21 264)', 'oklch(55% 0.18 210)', 'oklch(55% 0.19 155)', 'oklch(52% 0.22 340)', 'oklch(60% 0.20 60)', 'oklch(48% 0.22 300)'];

  const SITES_UTIL = $derived(
    (summary?.branchStats ?? []).slice(0, 6).map((b, i) => ({
      branch: b.name,
      pct:   b.total === 0 ? 0 : Math.round((b.assigned / b.total) * 100),
      color:  BRANCH_COLORS[i % BRANCH_COLORS.length],
      count:  String(b.total),
    }))
  );

  // ── Static report list ────────────────────────────────────────────────────
  type RStatus = 'Live' | 'Updating' | 'Scheduled';

  interface Report {
    id: string; name: string; desc: string;
    iconBg: string;
    catLabel: string; catColor: string; catBg: string;
    records: string; status: RStatus;
  }

  const REPORTS: Report[] = $derived([
    { id: 'total-assets',       name: 'Total Assets',          desc: 'Complete asset inventory snapshot',          iconBg: 'var(--canvas-soft-2)', catLabel: 'Inventory', catColor: 'oklch(42% 0.18 264)', catBg: 'oklch(92% 0.05 264)', records: String(kpi.totalAssets), status: 'Live' },
    { id: 'assigned-available', name: 'Assigned vs. Available', desc: 'Current allocation status across all assets', iconBg: 'oklch(93% 0.06 155)',  catLabel: 'Utilization', catColor: 'oklch(38% 0.18 152)', catBg: 'oklch(93% 0.06 152)', records: String(kpi.assigned + kpi.available), status: 'Live' },
    { id: 'by-category',        name: 'Assets by Category',    desc: 'Distribution breakdown by category',         iconBg: 'oklch(93% 0.07 60)',   catLabel: 'Category',  catColor: 'oklch(48% 0.18 50)',  catBg: 'oklch(93% 0.07 60)',  records: String(kpi.totalAssets), status: 'Live' },
    { id: 'repair',             name: 'Under Repair',          desc: 'Assets currently out for repair',             iconBg: 'oklch(93% 0.07 60)',   catLabel: 'Maintenance', catColor: 'oklch(48% 0.18 50)',  catBg: 'oklch(93% 0.07 60)',  records: String(kpi.forRepair),  status: 'Live' },
    { id: 'disposal',           name: 'For Disposal',          desc: 'Assets flagged for write-off',               iconBg: 'oklch(93% 0.05 28)',   catLabel: 'Lifecycle', catColor: 'oklch(42% 0.22 28)',  catBg: 'oklch(93% 0.05 28)',  records: String(kpi.forDisposal), status: 'Live' },
    { id: 'assignment-history', name: 'Assignment History',    desc: 'Full log of all asset movements',            iconBg: 'var(--canvas-soft-2)', catLabel: 'Activity',  catColor: 'var(--mute)',         catBg: 'var(--canvas-soft-2)', records: '—',                   status: 'Live' },
  ]);

  const filteredReports = $derived(
    REPORTS.filter(r => {
      const q = reportSearch.toLowerCase();
      return !q || r.name.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q) || r.catLabel.toLowerCase().includes(q);
    })
  );
</script>

<div class="page">

  <!-- Breadcrumb -->
  <div class="breadcrumb">
    Dashboard
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
    <span>Reports</span>
  </div>

  <!-- Page header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Reports</h1>
      <p class="page-sub">Analytics and summaries across your entire inventory.</p>
    </div>
    <div class="header-actions">
      <button class="btn-ghost">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Export all
      </button>
      <button class="btn-ghost">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        Schedule report
      </button>
    </div>
  </div>

  <!-- Filter bar -->
  <div class="filter-bar">
    <span class="filter-label">Filters:</span>
    <div class="date-range">
      <DateRangePicker
        bind:from={dateFrom}
        bind:to={dateTo}
        placeholder="Date range"
        onapply={applyFilters}
      />
    </div>
    <div class="filter-divider"></div>
    <select class="filter-select" bind:value={filterBranch}>
      <option value="all">All branches</option>
      {#each branches as b}
        <option value={b.id}>{b.name}</option>
      {/each}
    </select>
    <select class="filter-select" bind:value={filterCategory}>
      <option value="all">All categories</option>
      {#each categories as cat}
        <option value={cat.id}>{cat.name}</option>
      {/each}
    </select>
    <select class="filter-select" bind:value={filterStatus}>
      <option value="all">All statuses</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
    <div class="filter-divider"></div>
    <button class="btn-primary btn-sm" onclick={applyFilters}>Apply</button>
    <button class="btn-ghost btn-sm" onclick={() => { dateFrom = ''; dateTo = ''; filterBranch = 'all'; filterCategory = 'all'; filterStatus = 'all'; applyFilters(); }}>Reset</button>
  </div>

  <!-- KPI grid -->
  <div class="kpi-grid">
    <!-- Total assets -->
    <button class="kpi-card" onclick={() => goto('/reports/total-assets')}>
      <div class="kpi-top">
        <span class="kpi-label">Total assets</span>
        <div class="kpi-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
          </svg>
        </div>
      </div>
      <div class="kpi-value">{loading ? '—' : kpi.totalAssets}</div>
      <div class="kpi-meta">
        <span class="kpi-sub">{kpi.available} available</span>
      </div>
    </button>
    <!-- Assigned assets -->
    <button class="kpi-card" onclick={() => goto('/reports/assigned-available')}>
      <div class="kpi-top">
        <span class="kpi-label">Assigned assets</span>
        <div class="kpi-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
          </svg>
        </div>
      </div>
      <div class="kpi-value">{loading ? '—' : kpi.assigned}</div>
      <div class="kpi-meta">
        <span class="kpi-sub">{loading || !kpi.totalAssets ? '—' : Math.round((kpi.assigned / kpi.totalAssets) * 100)}% of total</span>
      </div>
    </button>
    <!-- Under repair -->
    <button class="kpi-card" onclick={() => goto('/reports/repair')}>
      <div class="kpi-top">
        <span class="kpi-label">Under repair</span>
        <div class="kpi-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
      </div>
      <div class="kpi-value">{loading ? '—' : kpi.forRepair}</div>
      <div class="kpi-meta">
        <span class="kpi-sub">Pending repair</span>
      </div>
    </button>
    <!-- For disposal -->
    <button class="kpi-card" onclick={() => goto('/reports/disposal')}>
      <div class="kpi-top">
        <span class="kpi-label">For disposal</span>
        <div class="kpi-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </div>
      </div>
      <div class="kpi-value">{loading ? '—' : kpi.forDisposal}</div>
      <div class="kpi-meta">
        <span class="kpi-sub">Flagged for write-off</span>
      </div>
    </button>
  </div>

  <!-- Charts row 1: Category bars + Donut -->
  <div class="charts-row">

    <!-- Assets by category -->
    <div class="section-card">
      <div class="card-head">
        <div>
          <div class="card-title">Assets by category</div>
          <div class="card-sub">Distribution by category</div>
        </div>
        <button class="btn-ghost btn-sm" onclick={() => goto('/reports/by-category')}>View full →</button>
      </div>
      <div class="bar-chart">
        {#each CAT_BARS as b}
          <div class="bar-group">
            <span class="bar-row-label">{b.label}</span>
            <div class="bar-track">
              <div class="bar-fill" style="width:{b.pct}%;background:{b.color}"></div>
            </div>
            <span class="bar-value">{b.value}</span>
            <span class="bar-pct">{b.pctLabel}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Assigned vs available (donut) -->
    <div class="section-card">
      <div class="card-head">
        <div>
          <div class="card-title">Assigned vs. available</div>
          <div class="card-sub">Current asset allocation status</div>
        </div>
        <button class="btn-ghost btn-sm" onclick={() => goto('/reports/assigned-available')}>View full →</button>
      </div>
      <div class="donut-wrap">
        <svg width="130" height="130" viewBox="0 0 130 130" aria-label="Asset allocation donut chart" style="flex-shrink:0">
          <circle cx="65" cy="65" r="50" fill="none" stroke="#f0f0f0" stroke-width="18"/>
          {#if DONUT.length > 0}
            {#each DONUT as d}
              <circle
                cx="65" cy="65" r="50" fill="none"
                stroke={d.color} stroke-width="18"
                stroke-dasharray={d.dasharray}
                stroke-dashoffset={d.dashoffset}
                transform="rotate(-90 65 65)"
              />
            {/each}
            <text x="65" y="61" text-anchor="middle" font-size="14" font-weight="600" fill="var(--ink)">{kpi.totalAssets}</text>
            <text x="65" y="76" text-anchor="middle" font-size="10" fill="#888">total</text>
          {:else}
            <text x="65" y="61" text-anchor="middle" font-size="14" font-weight="500" fill="#aaa">—</text>
            <text x="65" y="76" text-anchor="middle" font-size="10" fill="#aaa">no data</text>
          {/if}
        </svg>
        <div class="donut-legend">
          {#each DONUT as d}
            <div class="legend-item">
              <div class="legend-dot" style="background:{d.color}"></div>
              <span class="legend-name">{d.name}</span>
              <span class="legend-val">{d.val}</span>
              <span class="legend-pct">{d.pct}</span>
            </div>
          {/each}
          {#if DONUT.length === 0}
            <div class="legend-empty">No data yet</div>
          {/if}
        </div>
      </div>
    </div>

  </div>

  <!-- Charts row 2: Assignment trend + Branch utilization -->
  <div class="charts-row">

    <!-- Assignment activity (SVG line chart) -->
    <div class="section-card">
      <div class="card-head">
        <div>
          <div class="card-title">Assignment activity</div>
          <div class="card-sub">New assignments over the last 6 months</div>
        </div>
        <button class="btn-ghost btn-sm" onclick={() => goto('/reports/assignment-history')}>View full →</button>
      </div>
      <div class="trend-wrap">
        <svg class="trend-svg" height="140" viewBox="0 0 600 140" xmlns="http://www.w3.org/2000/svg" aria-label="Assignment activity line chart"
          onmouseleave={() => trendHoverIdx = null}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stop-color="#171717" stop-opacity="0.08"/>
              <stop offset="100%" stop-color="#171717" stop-opacity="0.01"/>
            </linearGradient>
          </defs>
          <!-- Grid lines -->
          <line x1="0" y1="20"  x2="600" y2="20"  stroke="#f0f0f0" stroke-width="1"/>
          <line x1="0" y1="55"  x2="600" y2="55"  stroke="#f0f0f0" stroke-width="1"/>
          <line x1="0" y1="90"  x2="600" y2="90"  stroke="#f0f0f0" stroke-width="1"/>
          <line x1="0" y1="120" x2="600" y2="120" stroke="#f0f0f0" stroke-width="1"/>
          <!-- Y labels -->
          <text x="2" y="18"  font-size="10" fill="#888">{TREND.maxY}</text>
          <text x="2" y="53"  font-size="10" fill="#888">{Math.round(TREND.maxY * 0.75)}</text>
          <text x="2" y="88"  font-size="10" fill="#888">{Math.round(TREND.maxY * 0.25)}</text>
          <text x="2" y="123" font-size="10" fill="#888">0</text>
          {#if TREND.path}
            <!-- Area fill -->
            <path d={TREND.area} fill="url(#areaGrad)"/>
            <!-- Line -->
            <path d={TREND.path} fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Crosshair + tooltip on hover -->
            {#if trendHoverIdx !== null}
              {@const hp = TREND.points[trendHoverIdx]}
              {@const hm = (summary?.movementsByMonth ?? [])[trendHoverIdx]}
              {@const tx = Math.min(Math.max(hp.x - 42, 2), 516)}
              {@const ty = Math.max(hp.y - 56, 2)}
              <!-- Vertical crosshair -->
              <line x1={hp.x} y1="16" x2={hp.x} y2="122" stroke="var(--ink)" stroke-width="1" stroke-dasharray="4 3" opacity="0.25"/>
              <!-- Tooltip box -->
              <rect x={tx} y={ty} width="84" height="44" rx="7" fill="var(--canvas)" stroke="var(--hairline)" stroke-width="1.2" filter="drop-shadow(0 2px 6px oklch(0% 0 0 / 0.15))"/>
              <text x={tx + 42} y={ty + 15} text-anchor="middle" font-size="10" font-weight="600" fill="#888" font-family="sans-serif">{hm?.month ?? ''}</text>
              <text x={tx + 42} y={ty + 33} text-anchor="middle" font-size="14" font-weight="700" fill="var(--ink)" font-family="sans-serif">{hp.v} assigned</text>
              <!-- Highlighted dot -->
              <circle cx={hp.x} cy={hp.y} r="5.5" fill="var(--ink)"/>
              <circle cx={hp.x} cy={hp.y} r="9" fill="var(--ink)" opacity="0.12"/>
            {/if}
            <!-- Data points -->
            {#each TREND.points as p, i}
              <circle cx={p.x} cy={p.y} r="3.5" fill="var(--ink)" opacity={trendHoverIdx === null || trendHoverIdx === i ? 1 : 0.3}/>
            {/each}
            <!-- Invisible hover hit zones (one per data point) -->
            {#each TREND.points as p, i}
              <rect
                x={p.x - 50}
                y="0"
                width="100"
                height="130"
                fill="transparent"
                style="cursor:crosshair"
                onmouseenter={() => trendHoverIdx = i}
              />
            {/each}
          {:else}
            <text x="300" y="70" text-anchor="middle" font-size="12" fill="#aaa">No data yet</text>
          {/if}
          <!-- X labels -->
          {#each (summary?.movementsByMonth ?? []) as m, i}
            <text x={38 + i * 100} y="138" font-size="10" fill="#888">{m.month}</text>
          {/each}
        </svg>
      </div>
    </div>

    <!-- Branch utilization -->
    <div class="section-card">
      <div class="card-head">
        <div>
          <div class="card-title">Branch utilization</div>
          <div class="card-sub">Assets assigned vs. capacity per branch</div>
        </div>
        <button class="btn-ghost btn-sm" onclick={() => goto('/reports/site-utilization')}>View full →</button>
      </div>
      <div class="util-grid">
        {#each SITES_UTIL as s}
          <div class="util-row">
            <span class="util-site" class:util-muted={false}>{s.branch}</span>
            <div class="util-track">
              <div class="util-fill" style="width:{s.pct}%;background:{s.color}"></div>
            </div>
            <span class="util-pct" class:util-muted={false}>{s.pct}%</span>
            <span class="util-count" class:util-muted={false}>{s.count} assets</span>
          </div>
        {/each}
      </div>
    </div>

  </div>

  <!-- All reports table -->
  <div class="section-card">
    <div class="card-head">
      <div>
        <div class="card-title">All reports</div>
        <div class="card-sub">Click any report to view full breakdown</div>
      </div>
      <div class="search-box">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input class="search-input" type="search" placeholder="Search reports..." bind:value={reportSearch} />
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Report</th>
            <th>Category</th>
            <th>Last updated</th>
            <th>Records</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each filteredReports as r}
            <tr class="report-row" onclick={() => goto('/reports/' + r.id)}>
              <td>
                <div class="report-cell">
                  <div class="report-icon" style="background:{r.iconBg}">
                    {#if r.id === 'total-assets'}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                    {:else if r.id === 'assigned-available'}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
                    {:else if r.id === 'by-category'}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="2" y="3" width="7" height="7"/><rect x="15" y="3" width="7" height="7"/><rect x="15" y="14" width="7" height="7"/><rect x="2" y="14" width="7" height="7"/></svg>
                    {:else if r.id === 'by-site'}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                    {:else if r.id === 'employee-ownership'}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    {:else if r.id === 'repair'}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                    {:else if r.id === 'disposal'}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                    {:else if r.id === 'assignment-history'}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M16 3l4 4-4 4"/><path d="M8 21l-4-4 4-4"/><path d="M20 7H4"/><path d="M4 17h16"/></svg>
                    {:else}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                    {/if}
                  </div>
                  <div>
                    <div class="report-name">{r.name}</div>
                    <div class="report-desc">{r.desc}</div>
                  </div>
                </div>
              </td>
              <td>
                <span class="badge" style="background:{r.catBg};color:{r.catColor}">{r.catLabel}</span>
              </td>
              <td><span class="updated-text">Live</span></td>
              <td><span class="mono">{r.records}</span></td>
              <td>
                {#if r.status === 'Live'}
                  <span class="badge badge-green">Live</span>
                {:else if r.status === 'Updating'}
                  <span class="badge badge-amber">Updating</span>
                {:else}
                  <span class="badge badge-blue">Scheduled</span>
                {/if}
              </td>
              <td>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" class="chevron">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </td>
            </tr>
          {/each}
          {#if filteredReports.length === 0}
            <tr><td colspan="6" class="empty-cell">No reports match your search.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Export bar -->
  <div class="export-bar">
    <div class="export-left">
      <div class="export-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
      </div>
      <div>
        <div class="export-title">Export full report</div>
        <div class="export-sub">Download a complete snapshot of all inventory data</div>
      </div>
    </div>
    <div class="export-actions">
      <button class="btn-ghost">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        Export as PDF
      </button>
      <button class="btn-ghost">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        Export as CSV
      </button>
      <button class="btn-primary">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Download all
      </button>
    </div>
  </div>

</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Breadcrumb ── */
  .breadcrumb {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: var(--mute);
  }
  .breadcrumb span { color: var(--ink); font-weight: 500; }

  /* ── Page header ── */
  .page-header {
    display: flex; align-items: flex-start;
    justify-content: space-between; gap: var(--sp-md); flex-wrap: wrap;
  }
  .page-title {
    font-size: 20px; font-weight: 600;
    letter-spacing: -0.025em; color: var(--ink);
  }
  .page-sub { font-size: 13px; color: var(--mute); margin-top: 3px; }
  .header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  /* ── Buttons ── */
  .btn-primary {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: none;
    background: var(--ink); color: var(--on-primary);
    transition: opacity 120ms ease; line-height: 1;
  }
  .btn-primary:hover { opacity: 0.85; }
  .btn-primary.btn-sm { padding: 5px 10px; font-size: 12px; border-radius: var(--r-sm); }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: 1px solid var(--hairline);
    background: var(--canvas); color: var(--ink);
    transition: background 100ms ease; line-height: 1;
  }
  .btn-ghost:hover { background: var(--canvas-soft-2); }
  .btn-ghost.btn-sm { padding: 5px 10px; font-size: 12px; border-radius: var(--r-sm); }

  /* ── Filter bar ── */
  .filter-bar {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    background: var(--canvas); border: 1px solid var(--hairline);
    border-radius: var(--r-lg); padding: 10px 14px;
  }
  .filter-label { font-size: 12px; font-weight: 500; color: var(--mute); margin-right: 4px; }
  .date-range { display: flex; align-items: center; gap: 6px; }
.filter-divider { width: 1px; height: 18px; background: var(--hairline); margin: 0 4px; }
  .filter-select {
    padding: 5px 9px; border-radius: var(--r-sm);
    border: 1px solid var(--hairline); background: var(--canvas-soft);
    font-size: 12px; font-family: var(--font-sans); color: var(--ink); cursor: pointer; outline: none;
  }

  /* ── KPI grid ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .kpi-card {
    background: var(--canvas); border: 1px solid var(--hairline);
    border-radius: var(--r-lg); padding: 18px 20px;
    cursor: pointer; text-align: left;
    transition: border-color 150ms, box-shadow 150ms;
    font-family: var(--font-sans);
  }
  .kpi-card:hover {
    border-color: var(--hairline-strong);
    box-shadow: 0 2px 8px oklch(0% 0 0 / 6%);
  }
  .kpi-dark {
    background: var(--ink); border-color: var(--ink); color: var(--on-primary);
  }
  .kpi-dark:hover { border-color: var(--ink); opacity: 0.92; }
  .kpi-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .kpi-label {
    font-size: 11px; font-weight: 500; color: var(--mute);
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .kpi-dark .kpi-label { color: oklch(100% 0 0 / 50%); }
  .kpi-icon {
    width: 30px; height: 30px; border-radius: 7px;
    background: var(--canvas-soft-2); display: flex; align-items: center; justify-content: center;
    color: var(--body);
  }
  .kpi-icon-dark { background: oklch(100% 0 0 / 10%); color: var(--on-primary); }
  .kpi-value {
    font-size: 26px; font-weight: 600; letter-spacing: -0.04em;
    color: var(--ink); line-height: 1; margin-bottom: 6px;
  }
  .kpi-dark .kpi-value { color: var(--on-primary); }
  .kpi-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .kpi-change {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 20px;
  }
  .change-up { background: #dcfce7; color: #16a34a; }
  .change-dn { background: #fee2e2; color: #dc2626; }
  .kpi-dark .change-up { background: oklch(52% 0.18 142 / 20%); color: #4ade80; }
  .kpi-sub { font-size: 11px; color: var(--mute); }
  .kpi-dark .kpi-sub { color: oklch(100% 0 0 / 40%); }

  /* ── Charts row ── */
  .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

  /* ── Section card ── */
  .section-card {
    background: var(--canvas); border: 1px solid var(--hairline);
    border-radius: var(--r-lg); overflow: hidden;
  }
  .card-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1px solid var(--hairline); flex-wrap: wrap; gap: 8px;
  }
  .card-title { font-size: 13px; font-weight: 600; color: var(--ink); }
  .card-sub { font-size: 11px; color: var(--mute); margin-top: 2px; }

  /* ── Bar chart (category) ── */
  .bar-chart { padding: 16px 20px; }
  .bar-group { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .bar-group:last-child { margin-bottom: 0; }
  .bar-row-label { font-size: 12px; color: var(--body); width: 88px; flex-shrink: 0; text-align: right; }
  .bar-track { flex: 1; height: 8px; background: oklch(93% 0.002 285); border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
  .bar-value { font-size: 12px; font-weight: 500; color: var(--ink); width: 36px; text-align: right; flex-shrink: 0; }
  .bar-pct { font-size: 11px; color: var(--mute); width: 38px; flex-shrink: 0; }

  /* ── Donut chart ── */
  .donut-wrap { display: flex; align-items: center; gap: 20px; padding: 16px 20px; }
  .donut-legend { display: flex; flex-direction: column; gap: 9px; flex: 1; }
  .legend-item { display: flex; align-items: center; gap: 8px; }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .legend-name { font-size: 12px; color: var(--body); flex: 1; }
  .legend-val { font-size: 12px; font-weight: 500; color: var(--ink); }
  .legend-pct { font-size: 11px; color: var(--mute); width: 36px; text-align: right; }
  .legend-empty { font-size: 12px; color: var(--mute); font-style: italic; padding: 4px 0; }

  /* ── Line chart (trend) ── */
  .trend-wrap { padding: 16px 20px; }
  .trend-svg { width: 100%; overflow: visible; }

  /* ── Branch utilization ── */
  .util-grid { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
  .util-row { display: flex; align-items: center; gap: 12px; }
  .util-site { font-size: 12px; font-weight: 500; color: var(--ink); width: 120px; flex-shrink: 0; }
  .util-track { flex: 1; height: 6px; background: oklch(93% 0.002 285); border-radius: 3px; overflow: hidden; }
  .util-fill { height: 100%; border-radius: 3px; }
  .util-pct { font-size: 12px; font-weight: 500; color: var(--ink); width: 36px; text-align: right; }
  .util-count { font-size: 11px; color: var(--mute); width: 72px; }
  .util-muted { color: var(--mute) !important; }

  /* ── All reports table ── */
  .search-box {
    display: flex; align-items: center; gap: 7px;
    border: 1px solid var(--hairline); border-radius: var(--r-md);
    padding: 6px 10px; background: var(--canvas-soft); width: 200px;
    color: var(--mute);
  }
  .search-input {
    border: none; background: transparent; font-size: 12px;
    font-family: var(--font-sans); color: var(--ink); outline: none; width: 100%;
  }
  .search-input::placeholder { color: oklch(73% 0.004 285); }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { border-bottom: 1px solid var(--hairline); }
  th {
    text-align: left; padding: 10px 20px;
    font-size: 11px; font-weight: 600; color: var(--mute);
    text-transform: uppercase; letter-spacing: 0.06em;
    white-space: nowrap; background: var(--canvas-soft);
  }
  td {
    padding: 12px 20px; font-size: 13px; color: var(--ink);
    border-bottom: 1px solid oklch(96% 0.002 106); vertical-align: middle;
  }
  tbody tr:last-child td { border-bottom: none; }
  .report-row { cursor: pointer; transition: background 100ms ease; }
  .report-row:hover td { background: var(--canvas-soft); }

  .report-cell { display: flex; align-items: center; gap: 10px; }
  .report-icon {
    width: 30px; height: 30px; border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; color: var(--body);
  }
  .report-name { font-size: 13px; font-weight: 500; color: var(--ink); }
  .report-desc { font-size: 11px; color: var(--mute); margin-top: 1px; }

  .badge {
    display: inline-flex; align-items: center;
    padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 600;
  }
  .badge-green { background: #dcfce7; color: #16a34a; }
  .badge-blue  { background: #dbeafe; color: #1d4ed8; }
  .badge-amber { background: #fef9c3; color: #854d0e; }

  .updated-text { font-size: 12px; color: var(--mute); }
  .mono { font-family: var(--font-mono); font-size: 12px; }
  .chevron { color: oklch(85% 0.003 285); display: block; }

  .empty-cell {
    text-align: center; color: var(--mute); font-size: 13px;
    padding: 32px 20px !important;
  }

  /* ── Export bar ── */
  .export-bar {
    background: var(--canvas); border: 1px solid var(--hairline);
    border-radius: var(--r-lg); padding: 14px 20px;
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 12px;
  }
  .export-left { display: flex; align-items: center; gap: 12px; }
  .export-icon {
    width: 36px; height: 36px; background: var(--canvas-soft-2);
    border-radius: 8px; display: flex; align-items: center; justify-content: center;
    color: var(--body); flex-shrink: 0;
  }
  .export-title { font-size: 13px; font-weight: 600; color: var(--ink); }
  .export-sub { font-size: 12px; color: var(--mute); margin-top: 1px; }
  .export-actions { display: flex; gap: 8px; }

  /* ── Responsive ── */
  @media (max-width: 1100px) { .charts-row { grid-template-columns: 1fr; } }
  @media (max-width: 900px)  { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 640px)  {
    .kpi-grid { grid-template-columns: 1fr 1fr; }
    .filter-bar { flex-direction: column; align-items: flex-start; }
    .export-bar { flex-direction: column; align-items: flex-start; }
    .export-actions { flex-wrap: wrap; }
  }
</style>
