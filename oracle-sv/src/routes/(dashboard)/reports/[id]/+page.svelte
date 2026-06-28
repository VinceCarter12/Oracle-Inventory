<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { api } from '$lib/api';

  const reportId = $derived($page.params.id);

  // ── Types ──────────────────────────────────────────────────────────────────
  interface Col { key: string; label: string; align?: 'right'; badge?: boolean; }
  interface Kpi { label: string; value: string; sub: string; }

  interface ReportResponse {
    meta: { records: number; updatedAt: string; };
    kpi: Kpi[];
    columns: Col[];
    chips: string[];
    chipFilterKey: string;
    cardTitle: string;
    entityName: string;
    searchPlaceholder: string;
    rows: Record<string, string>[];
    sidebar: {
      statusBars: { label: string; pct: number; color: string }[];
      byCategory: { label: string; val: string }[];
      timeline: { color: string; text: string; sub: string; time: string }[];
    };
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let loading    = $state(true);
  let reportData = $state<ReportResponse | null>(null);
  let activeChip = $state('All');
  let search     = $state('');
  let curPage    = $state(1);
  const perPage  = 20;

  // Fetch when reportId changes; reset all filter state (writes only, no re-track)
  $effect(() => {
    const id = reportId;
    if (!id) return;
    activeChip = 'All';
    search = '';
    curPage = 1;
    loading = true;
    reportData = null;
    api.get<ReportResponse>(`/api/reports/${id}`)
      .then(d => { reportData = d; loading = false; })
      .catch(() => { loading = false; });
  });

  // ── Static display info (name/desc/icon only) ─────────────────────────────
  const DISPLAY: Record<string, { name: string; desc: string; iconBg: string }> = {
    'total-assets':       { name: 'Total asset inventory',    desc: 'Full list of all assets across all branches',  iconBg: '#EEF1FE' },
    'assigned-available': { name: 'Assigned vs. available',   desc: 'Breakdown of asset allocation status',          iconBg: '#dcfce7' },
    'by-category':        { name: 'Assets by category',       desc: 'Count grouped by category',                     iconBg: '#fef9c3' },
    'by-site':            { name: 'Assets by branch',         desc: 'Asset inventory per branch',                    iconBg: '#dbeafe' },
    'employee-ownership': { name: 'Employee asset ownership', desc: 'Which assets each employee is holding',         iconBg: '#ede9fe' },
    'repair':             { name: 'Repair & maintenance',     desc: 'Assets currently under repair',                 iconBg: '#ffedd5' },
    'disposal':           { name: 'Disposal & retirement',    desc: 'Assets flagged for disposal',                   iconBg: '#fee2e2' },
    'assignment-history': { name: 'Assignment history',       desc: 'All asset assignment and return events',        iconBg: '#f0fdf4' },
    'site-utilization':   { name: 'Branch utilization',       desc: 'Capacity and usage per branch',                 iconBg: '#f5f5f5' },
  };
  const display = $derived(DISPLAY[reportId ?? ''] ?? { name: 'Report', desc: '', iconBg: '#f5f5f5' });

  // ── Derived ───────────────────────────────────────────────────────────────
  const chips   = $derived(reportData?.chips ?? ['All']);
  const chipKey = $derived(reportData?.chipFilterKey ?? '');

  const filtered = $derived(
    (reportData?.rows ?? []).filter(row => {
      const chipOk   = activeChip === 'All' || row[chipKey] === activeChip;
      const searchOk = !search || Object.values(row).some(v => String(v).toLowerCase().includes(search.toLowerCase()));
      return chipOk && searchOk;
    })
  );

  const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / perPage)));
  const pagedRows  = $derived(filtered.slice((curPage - 1) * perPage, curPage * perPage));

  // ── Icon / badge maps ─────────────────────────────────────────────────────
  const ASSET_ICON_PATH: Record<string, string> = {
    'Laptop':    'M3 5h18v12H3zM1 19h22',
    'Phone':     'M6 2h12a1 1 0 011 1v18a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1zM12 18h.01',
    'Monitor':   'M2 3h20v14H2zM8 21h8M12 17v4',
    'Peripheral':'M2 4h20a1 1 0 011 1v10a1 1 0 01-1 1H2a1 1 0 01-1-1V5a1 1 0 011-1zM5 9h2M10 9h2M15 9h2M5 13h14',
    'Printer':   'M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z',
    'Tablet':    'M7 2h10a1 1 0 011 1v18a1 1 0 01-1 1H7a1 1 0 01-1-1V3a1 1 0 011-1zM12 18h.01',
    'Scanner':   'M3 5V3h2M21 3h-2v2M3 21v-2h2M21 21h-2v-2M5 12h14',
  };

  const BADGE_MAP: Record<string, string> = {
    'Assigned':  'badge-green', 'Available':          'badge-blue',
    'In repair': 'badge-amber', 'Retiring':           'badge-red',
    'For disposal': 'badge-red', 'Returned':          'badge-green',
    'Overdue': 'badge-red',     'Awaiting approval':  'badge-amber',
    'Disposed': 'badge-green',  'Written off':        'badge-red',
    'Near capacity': 'badge-red', 'Healthy':          'badge-green',
    'Moderate': 'badge-amber',  'Underutilized':      'badge-red',
  };
</script>

<div class="page">

  <!-- Breadcrumb -->
  <div class="breadcrumb">
    Dashboard
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
    <button class="bc-link" onclick={() => goto('/reports')}>Reports</button>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
    <span>{display.name}</span>
  </div>

  <!-- Page header -->
  <div class="page-header">
    <div class="header-left">
      <div class="report-icon" style="background:{display.iconBg}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
        </svg>
      </div>
      <div>
        <h1 class="page-title">{display.name}</h1>
        <p class="page-sub">{display.desc} · Last updated Live</p>
      </div>
    </div>
    <div class="header-actions">
      <button class="btn-ghost" onclick={() => goto('/reports')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
        Back to reports
      </button>
      <button class="btn-ghost">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Export CSV
      </button>
      <button class="btn-primary">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Export PDF
      </button>
    </div>
  </div>

  <!-- Mini KPI row -->
  <div class="mini-kpi">
    {#if loading}
      {#each [1,2,3,4] as _}
        <div class="mini-card mini-skeleton"></div>
      {/each}
    {:else}
      {#each (reportData?.kpi ?? []) as k}
        <div class="mini-card">
          <div class="mini-label">{k.label}</div>
          <div class="mini-value">{k.value}</div>
          <div class="mini-sub">{k.sub}</div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Content grid: table + right panel -->
  <div class="content-grid">

    <!-- Left: data table card -->
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">{reportData?.cardTitle ?? '—'}</div>
          <div class="card-sub">{filtered.length} of {reportData?.meta.records ?? '—'} {reportData?.entityName ?? 'items'} · Live data</div>
        </div>
      </div>

      <!-- Inline filter bar -->
      <div class="inline-filter">
        <div class="search-wrap">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" style="color:oklch(80% 0.003 285);flex-shrink:0">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="search" placeholder={reportData?.searchPlaceholder ?? 'Search...'} bind:value={search} oninput={() => curPage = 1} />
        </div>
        {#each chips as chip}
          <button
            class="filter-chip"
            class:chip-active={activeChip === chip}
            onclick={() => { activeChip = chip; curPage = 1; }}
          >{chip}</button>
        {/each}
      </div>

      <!-- Data table -->
      <div class="table-wrap">
        {#if loading}
          <div class="loading-cell">Loading…</div>
        {:else}
          <table>
            <thead>
              <tr>
                {#each (reportData?.columns ?? []) as col}
                  <th style={col.align === 'right' ? 'text-align:right' : ''}>{col.label}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each pagedRows as row}
                <tr>
                  {#each (reportData?.columns ?? []) as col}
                    <td style={col.align === 'right' ? 'text-align:right' : ''}>
                      {#if col.key === '_asset'}
                        <div class="asset-cell">
                          <div class="asset-icon">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                              <path d={ASSET_ICON_PATH[row.category] ?? ASSET_ICON_PATH['Laptop']}/>
                            </svg>
                          </div>
                          <div>
                            <div class="asset-name">{row.name}</div>
                            <div class="asset-id">{row.id}</div>
                          </div>
                        </div>
                      {:else if col.key === '_employee'}
                        <div>
                          <div class="asset-name">{row.empName}</div>
                          <div class="asset-id">{row.empId}</div>
                        </div>
                      {:else if col.badge}
                        <span class="badge {BADGE_MAP[row[col.key]] ?? 'badge-blue'}">{row[col.key]}</span>
                      {:else}
                        <span class:mono={col.align === 'right'} class:mute-text={row[col.key] === '—'}>{row[col.key] ?? '—'}</span>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
              {#if pagedRows.length === 0}
                <tr><td colspan={reportData?.columns.length ?? 1} class="empty-cell">No {reportData?.entityName ?? 'items'} match your filters.</td></tr>
              {/if}
            </tbody>
          </table>
        {/if}
      </div>

      <!-- Table footer -->
      <div class="table-footer">
        <span class="footer-text">Showing {pagedRows.length} of {filtered.length} {reportData?.entityName ?? 'items'}</span>
        <div class="pagination">
          <button class="pg-btn" disabled={curPage === 1} onclick={() => curPage--}>‹</button>
          {#each Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1) as p}
            <button class="pg-btn" class:pg-active={p === curPage} onclick={() => curPage = p}>{p}</button>
          {/each}
          {#if totalPages > 7}
            <span style="padding:0 4px;font-size:12px;color:var(--mute)">…</span>
            <button class="pg-btn" class:pg-active={curPage === totalPages} onclick={() => curPage = totalPages}>{totalPages}</button>
          {/if}
          <button class="pg-btn" disabled={curPage === totalPages} onclick={() => curPage++}>›</button>
        </div>
      </div>
    </div>

    <!-- Right panel -->
    <div class="right-col">

      <!-- Report summary -->
      <div class="card info-card">
        <div class="card-head"><div class="card-title">Report summary</div></div>
        <div class="info-body">

          <div class="info-section">
            <div class="info-section-label">Overview</div>
            <div class="detail-row"><span class="detail-label">Total records</span><span class="detail-val">{loading ? '—' : (reportData?.meta.records ?? '—')}</span></div>
            <div class="detail-row"><span class="detail-label">Last updated</span><span class="detail-val">Live</span></div>
          </div>

          {#if (reportData?.sidebar.statusBars ?? []).length > 0}
          <div class="info-section">
            <div class="info-section-label">By status</div>
            <div class="mini-bar-list">
              {#each (reportData?.sidebar.statusBars ?? []) as b}
                <div class="mini-bar-row">
                  <span class="mini-bar-label">{b.label}</span>
                  <div class="mini-bar-track">
                    <div class="mini-bar-fill" style="width:{b.pct}%;background:{b.color}"></div>
                  </div>
                  <span class="mini-bar-val">{b.pct}%</span>
                </div>
              {/each}
            </div>
          </div>
          {/if}

          {#if (reportData?.sidebar.byCategory ?? []).length > 0}
          <div class="info-section last">
            <div class="info-section-label">By category</div>
            {#each (reportData?.sidebar.byCategory ?? []) as c}
              <div class="detail-row"><span class="detail-label">{c.label}</span><span class="detail-val">{c.val}</span></div>
            {/each}
          </div>
          {/if}

        </div>
      </div>

      <!-- Download -->
      <div class="card dl-card">
        <div class="card-head"><div class="card-title">Download report</div></div>
        <div class="dl-list">
          <div class="dl-item">
            <div class="dl-name">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>
              Full report (PDF)
            </div>
          </div>
          <div class="dl-item">
            <div class="dl-name" style="color:#22c55e">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>
              Spreadsheet (CSV)
            </div>
          </div>
        </div>
      </div>

      <!-- Recent changes timeline -->
      {#if (reportData?.sidebar.timeline ?? []).length > 0}
      <div class="card tl-card">
        <div class="card-head"><div class="card-title">Recent activity</div></div>
        <div class="tl-body">
          {#each (reportData?.sidebar.timeline ?? []) as item, i}
            <div class="tl-item">
              <div class="tl-dot-col">
                <div class="tl-dot" style="background:{item.color}"></div>
                {#if i < (reportData?.sidebar.timeline.length ?? 0) - 1}
                  <div class="tl-line"></div>
                {/if}
              </div>
              <div class="tl-content">
                <div class="tl-text">{item.text}</div>
                <div class="tl-sub">{item.sub}</div>
                <div class="tl-time">{item.time}</div>
              </div>
            </div>
          {/each}
        </div>
      </div>
      {/if}

    </div>
  </div>

</div>

<style>
  .page { display: flex; flex-direction: column; gap: 20px; }

  /* ── Breadcrumb ── */
  .breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--mute); }
  .breadcrumb span { color: var(--ink); font-weight: 500; }
  .bc-link { background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mute); font-family: var(--font-sans); }
  .bc-link:hover { color: var(--ink); }

  /* ── Page header ── */
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-md); flex-wrap: wrap; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .report-icon { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--body); }
  .page-title { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub { font-size: 13px; color: var(--mute); margin-top: 3px; }
  .header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }

  /* ── Buttons ── */
  .btn-primary {
    display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px;
    border-radius: var(--r-md); font-size: 13px; font-weight: 500;
    font-family: var(--font-sans); cursor: pointer; border: none;
    background: var(--ink); color: var(--on-primary); transition: opacity 120ms ease; line-height: 1;
  }
  .btn-primary:hover { opacity: 0.85; }
  .btn-ghost {
    display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px;
    border-radius: var(--r-md); font-size: 13px; font-weight: 500;
    font-family: var(--font-sans); cursor: pointer; border: 1px solid var(--hairline);
    background: var(--canvas); color: var(--ink); transition: background 100ms ease; line-height: 1;
  }
  .btn-ghost:hover { background: var(--canvas-soft-2); }

  /* ── Mini KPI ── */
  .mini-kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .mini-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 14px 16px; }
  .mini-skeleton { min-height: 72px; background: var(--canvas-soft-2); animation: pulse 1.4s ease infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
  .mini-label { font-size: 11px; font-weight: 500; color: var(--mute); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px; }
  .mini-value { font-size: 20px; font-weight: 600; letter-spacing: -0.04em; color: var(--ink); margin-bottom: 3px; }
  .mini-sub { font-size: 11px; color: var(--mute); }

  /* ── Content grid ── */
  .content-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }

  /* ── Card ── */
  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); overflow: hidden; }
  .card-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--hairline); flex-wrap: wrap; gap: 8px; }
  .card-title { font-size: 13px; font-weight: 600; color: var(--ink); }
  .card-sub { font-size: 11px; color: var(--mute); margin-top: 2px; }

  /* ── Inline filter bar ── */
  .inline-filter { display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-bottom: 1px solid var(--hairline); flex-wrap: wrap; background: var(--canvas-soft); }
  .search-wrap { display: flex; align-items: center; gap: 6px; border: 1px solid var(--hairline); border-radius: var(--r-sm); padding: 5px 9px; background: var(--canvas); flex: 1; min-width: 150px; }
  .search-wrap input { border: none; background: transparent; font-size: 12px; font-family: var(--font-sans); color: var(--ink); outline: none; width: 100%; }
  .search-wrap input::placeholder { color: oklch(80% 0.003 285); }
  .filter-chip { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 20px; border: 1px solid var(--hairline); font-size: 11px; font-weight: 500; color: var(--mute); cursor: pointer; background: var(--canvas); font-family: var(--font-sans); transition: background 100ms ease, color 100ms ease; }
  .filter-chip:hover { background: var(--canvas-soft-2); }
  .chip-active { background: var(--ink) !important; color: var(--on-primary) !important; border-color: var(--ink) !important; }

  /* ── Table ── */
  .loading-cell { padding: 40px; text-align: center; font-size: 13px; color: var(--mute); }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { border-bottom: 1px solid var(--hairline); }
  th { text-align: left; padding: 10px 18px; font-size: 11px; font-weight: 600; color: var(--mute); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; background: var(--canvas-soft); }
  td { padding: 11px 18px; font-size: 13px; color: var(--ink); border-bottom: 1px solid var(--hairline); vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: var(--canvas-soft); }

  .asset-cell { display: flex; align-items: center; gap: 9px; }
  .asset-icon { width: 28px; height: 28px; border-radius: 7px; background: var(--canvas-soft-2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--mute); }
  .asset-name { font-size: 13px; font-weight: 500; color: var(--ink); }
  .asset-id { font-size: 11px; color: var(--mute); font-family: var(--font-mono); }
  .mono { font-family: var(--font-mono); font-size: 12px; }
  .mute-text { color: oklch(80% 0.003 285); }

  .badge { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #16a34a; }
  .badge-blue  { background: #dbeafe; color: #1d4ed8; }
  .badge-amber { background: #fef9c3; color: #854d0e; }
  .badge-red   { background: #fee2e2; color: #dc2626; }

  .empty-cell { text-align: center; color: var(--mute); font-size: 13px; padding: 32px 18px !important; }

  /* ── Table footer ── */
  .table-footer { display: flex; align-items: center; justify-content: space-between; padding: 11px 18px; border-top: 1px solid var(--hairline); flex-wrap: wrap; gap: 8px; }
  .footer-text { font-size: 12px; color: var(--mute); }
  .pagination { display: flex; align-items: center; gap: 4px; }
  .pg-btn { width: 28px; height: 28px; border-radius: var(--r-sm); border: 1px solid var(--hairline); background: var(--canvas); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; color: var(--mute); cursor: pointer; font-family: var(--font-sans); transition: background 100ms ease; }
  .pg-btn:hover:not(:disabled):not(.pg-active) { background: var(--canvas-soft-2); }
  .pg-btn:disabled { opacity: 0.4; cursor: default; }
  .pg-active { background: var(--ink) !important; color: var(--on-primary) !important; border-color: var(--ink) !important; }

  /* ── Right column ── */
  .right-col { display: flex; flex-direction: column; gap: 12px; }
  .info-card { overflow: visible; }
  .info-body { padding: 14px; display: flex; flex-direction: column; gap: 0; }
  .info-section { padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid var(--hairline); }
  .info-section.last { padding-bottom: 0; margin-bottom: 0; border-bottom: none; }
  .info-section-label { font-size: 11px; font-weight: 500; color: var(--mute); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
  .detail-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .detail-row:last-child { margin-bottom: 0; }
  .detail-label { font-size: 12px; color: var(--mute); }
  .detail-val { font-size: 12px; font-weight: 500; color: var(--ink); }

  .mini-bar-list { display: flex; flex-direction: column; gap: 9px; }
  .mini-bar-row { display: flex; align-items: center; gap: 8px; }
  .mini-bar-label { font-size: 11px; color: var(--body); width: 70px; flex-shrink: 0; }
  .mini-bar-track { flex: 1; height: 5px; background: oklch(93% 0.002 285); border-radius: 3px; overflow: hidden; }
  .mini-bar-fill { height: 100%; border-radius: 3px; }
  .mini-bar-val { font-size: 11px; font-weight: 500; color: var(--ink); width: 28px; text-align: right; }

  .dl-card { overflow: visible; }
  .dl-list { padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; }
  .dl-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border: 1px solid var(--hairline); border-radius: var(--r-sm); cursor: pointer; transition: background 100ms ease; }
  .dl-item:hover { background: var(--canvas-soft-2); }
  .dl-name { font-size: 12px; font-weight: 500; color: var(--ink); display: flex; align-items: center; gap: 6px; }

  .tl-card { overflow: visible; }
  .tl-body { padding: 14px; }
  .tl-item { display: flex; gap: 10px; padding-bottom: 12px; }
  .tl-item:last-child { padding-bottom: 0; }
  .tl-dot-col { display: flex; flex-direction: column; align-items: center; }
  .tl-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
  .tl-line { flex: 1; width: 1px; background: var(--hairline); margin: 4px 0 0; }
  .tl-content { flex: 1; }
  .tl-text { font-size: 12px; font-weight: 500; color: var(--ink); }
  .tl-sub { font-size: 11px; color: var(--mute); }
  .tl-time { font-size: 10px; color: oklch(78% 0.003 285); margin-top: 2px; }

  /* ── Responsive ── */
  @media (max-width: 1100px) { .content-grid { grid-template-columns: 1fr; } }
  @media (max-width: 900px)  { .mini-kpi { grid-template-columns: repeat(2, 1fr); } }
</style>
