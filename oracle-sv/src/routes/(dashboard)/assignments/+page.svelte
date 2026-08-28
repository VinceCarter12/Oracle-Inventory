<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { onChange } from '$lib/ws';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';

  // ── API types ─────────────────────────────────────────────────────────────────
  interface ApiAssignment {
    id: string;
    status: string;
    assignedAt: string;
    returnedAt: string | null;
    returnRequestedAt: string | null;
    returnNotes: string | null;
    returnRequestedBy: string | null;
    notes: string | null;
    asset: { id: string; name: string; serialNumber: string | null; condition: string; category: { name: string } | null; branch: { name: string } | null; };
    employee: { id: string; name: string; employeeId: string; department: { name: string } | null; branch: { name: string } | null; };
  }

  interface Stats { total: number; active: number; pendingReturn: number; returned: number; }

  // ── UI types ──────────────────────────────────────────────────────────────────
  type AssignmentStatus = 'active' | 'pending_return' | 'returned';

  interface Assignment {
    id: string;
    employee: string; empId: string;
    initials: string; color: string; dept: string;
    assetName: string;
    dateOut: string;
    status: AssignmentStatus;
    returnNotes: string | null;
  }

  // ── State ─────────────────────────────────────────────────────────────────────
  let loading     = $state(true);
  let loadErr     = $state('');
  let assignments = $state<Assignment[]>([]);

  let KPI = $state([
    { label: 'Total Assignments', value: '0', delta: '—', deltaLabel: 'this month', positive: true  },
    { label: 'Active',            value: '0', delta: '—', deltaLabel: '',           positive: true  },
    { label: 'Pending Return',    value: '0', delta: '—', deltaLabel: '',           positive: false },
    { label: 'Returned',          value: '0', delta: '—', deltaLabel: 'this month', positive: true  },
  ]);

  let search       = $state('');
  let filterStatus = $state<'all' | AssignmentStatus | 'pending_return'>('all');
  let perPage      = $state(10);
  let currentPage  = $state(1);
  let goToInput    = $state('');

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const AVATAR_COLORS = [
    'oklch(52% 0.21 264)', 'oklch(55% 0.18 210)', 'oklch(55% 0.19 155)',
    'oklch(52% 0.22 340)', 'oklch(60% 0.20 60)',  'oklch(48% 0.22 300)',
    'oklch(52% 0.16 55)',  'oklch(42% 0.18 240)', 'oklch(50% 0.18 180)',
    'oklch(44% 0.20 20)',
  ];
  function nameInitials(name: string) { return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); }
  function avatarColor(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }

  function mapAssignment(a: ApiAssignment): Assignment {
    const status: AssignmentStatus = a.status === 'active' ? 'active' : a.status === 'pending_return' ? 'pending_return' : 'returned';
    return {
      id: a.id,
      employee: a.employee.name,
      empId: a.employee.employeeId,
      initials: nameInitials(a.employee.name),
      color: avatarColor(a.employee.id),
      dept: a.employee.department?.name ?? '—',
      assetName: a.asset.name,
      dateOut: new Date(a.assignedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      status,
      returnNotes: a.returnNotes ?? null,
    };
  }

  function applyStats(s: Stats) {
    if (!s) return;
    KPI[0].value = (s.total        ?? 0).toLocaleString();
    KPI[1].value = (s.active       ?? 0).toLocaleString();
    KPI[2].value = (s.pendingReturn ?? 0).toLocaleString();
    KPI[3].value = (s.returned     ?? 0).toLocaleString();
  }

  // ── Load ──────────────────────────────────────────────────────────────────────
  async function loadAssignments() {
    loadErr = '';
    try {
      const [raw, s] = await Promise.all([
        api.get<ApiAssignment[]>('/api/assignments'),
        api.get<Stats>('/api/assignments/stats'),
      ]);
      assignments = raw.map(mapAssignment);
      applyStats(s);
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => { void loadAssignments(); });
  onDestroy(onChange(['Assignment', 'Asset'], () => loadAssignments()));

  // ── Derived ───────────────────────────────────────────────────────────────────
  const filtered = $derived(
    assignments.filter(a => {
      const q = search.toLowerCase();
      const matchQ = !q || a.employee.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || a.assetName.toLowerCase().includes(q);
      const matchS = filterStatus === 'all' || a.status === filterStatus;
      return matchQ && matchS;
    })
  );

  const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / perPage)));
  const paginated  = $derived(filtered.slice((currentPage - 1) * perPage, currentPage * perPage));

  function resetPage() { currentPage = 1; }
  function goTo(p: number) { currentPage = Math.max(1, Math.min(totalPages, p)); }
  function handleGoTo() { const n = parseInt(goToInput, 10); if (!isNaN(n)) goTo(n); goToInput = ''; }

  const visiblePages = $derived(
    Array.from({ length: Math.min(5, totalPages) }, (_, i) => Math.max(1, currentPage - 2) + i)
      .filter(p => p <= totalPages)
  );

  const statusLabel: Record<AssignmentStatus, string> = { active: 'Active', pending_return: 'Pending Return', returned: 'Returned' };
  const statusClass: Record<AssignmentStatus, string> = { active: 'badge-green', pending_return: 'badge-amber', returned: 'badge-gray' };

  // ── Mark Returned action (admin direct return) ────────────────────────────────
  let markReturnTarget = $state<Assignment | null>(null);
  let markReturnNotes  = $state('');
  let markReturning    = $state(false);
  let markReturnErr    = $state('');

  async function confirmMarkReturned() {
    if (!markReturnTarget) return;
    markReturning = true; markReturnErr = '';
    try {
      await api.post(`/api/assignments/${markReturnTarget.id}/return`, { notes: markReturnNotes || undefined });
      const id = markReturnTarget.id;
      const prev = assignments.find(a => a.id === id);
      assignments = assignments.map(a => a.id === id ? { ...a, status: 'returned' as const } : a);
      if (prev?.status === 'active') {
        KPI[1].value = String(Math.max(0, Number(KPI[1].value) - 1));
      } else if (prev?.status === 'pending_return') {
        KPI[2].value = String(Math.max(0, Number(KPI[2].value) - 1));
      }
      KPI[3].value = String(Number(KPI[3].value) + 1);
      markReturnTarget = null; markReturnNotes = '';
    } catch (e) { markReturnErr = (e as Error).message; }
    finally { markReturning = false; }
  }
</script>

<div class="page">

  <!-- Breadcrumb -->
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/dashboard')}>Dashboard</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="crumb-current">Assignments</span>
  </nav>

  <div class="page-header">
    <div>
      <h1 class="page-title">Assignments</h1>
      <p class="page-sub">Track and manage asset assignments across your organization</p>
    </div>
    {#if can('manage_stock')}
      <button class="btn-primary" onclick={() => goto('/assignments/assign')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        Assign Asset
      </button>
    {/if}
  </div>

  {#if loadErr}
    <div class="load-err">{loadErr}</div>
  {/if}

  <div class="kpi-row">
    {#each KPI as k}
      <div class="kpi-card">
        <span class="kpi-label">{k.label}</span>
        <span class="kpi-value">{k.value}</span>
        <span class="kpi-delta" class:pos={k.positive} class:neg={!k.positive}>{k.delta}{k.deltaLabel ? ' ' + k.deltaLabel : ''}</span>
      </div>
    {/each}
  </div>

  <div class="table-wrap">
    <div class="toolbar">
      <div class="search-box">
        <svg class="s-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.5"/>
          <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <input class="search-input" type="search" placeholder="Search employee, asset, or reference…" bind:value={search} oninput={resetPage} />
      </div>
      <select class="filter-select" bind:value={filterStatus} onchange={resetPage}>
        <option value="all">All Status</option>
        <option value="active">Active</option>
        <option value="pending_return">Pending Return</option>
        <option value="returned">Returned</option>
      </select>
    </div>
    <div class="table-scroll-inner">
    <table class="table">
      <thead>
        <tr>
          <th>Reference</th>
          <th>Employee</th>
          <th>Asset</th>
          <th>Date Out</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each paginated as a}
          <tr class="row-click" onclick={() => goto(`/assignments/confirm?id=${a.id}`)}>
            <td><span class="ref-id">{a.id.slice(-8).toUpperCase()}</span></td>
            <td>
              <div class="emp-cell">
                <span class="emp-av" style="background:{a.color}">{a.initials}</span>
                <div>
                  <div class="emp-name">{a.employee}</div>
                  <div class="emp-meta">{a.empId} · {a.dept}</div>
                </div>
              </div>
            </td>
            <td><div class="asset-primary">{a.assetName}</div></td>
            <td class="td-date">{a.dateOut}</td>
            <td><span class="badge {statusClass[a.status]}">{statusLabel[a.status]}</span></td>
            <td class="td-actions" onclick={(e) => e.stopPropagation()}>
              {#if can('approve_transactions') && a.status !== 'returned'}
                <button class="return-btn" onclick={() => { markReturnTarget = a; markReturnNotes = ''; markReturnErr = ''; }}>Mark Returned</button>
              {/if}
              <button class="view-btn" onclick={() => goto(`/assignments/confirm?id=${a.id}`)}>View</button>
            </td>
          </tr>
        {/each}
        {#if loading}
          <tr><td colspan="6" class="empty-cell">Loading…</td></tr>
        {:else if filtered.length === 0}
          <tr><td colspan="6" class="empty-cell">No assignments match your filters.</td></tr>
        {/if}
      </tbody>
    </table>
    </div>

    <!-- Pagination bar -->
    <div class="pagination-bar">
    <div class="pag-left">
      <span class="pag-label">Showing per page</span>
      <select class="pag-select" bind:value={perPage} onchange={resetPage}>
        <option value={10}>10</option>
        <option value={25}>25</option>
        <option value={50}>50</option>
      </select>
    </div>

    <div class="pag-pages">
      <button class="pag-btn" disabled={currentPage === 1} onclick={() => goTo(1)}>«</button>
      <button class="pag-btn" disabled={currentPage === 1} onclick={() => goTo(currentPage - 1)}>‹</button>
      {#each visiblePages as p}
        <button class="pag-btn" class:pag-active={p === currentPage} onclick={() => goTo(p)}>{p}</button>
      {/each}
      <button class="pag-btn" disabled={currentPage === totalPages} onclick={() => goTo(currentPage + 1)}>›</button>
      <button class="pag-btn" disabled={currentPage === totalPages} onclick={() => goTo(totalPages)}>»</button>
    </div>

    <div class="pag-right">
      <span class="pag-label">Go to page</span>
      <input class="pag-go-input" type="number" min="1" max={totalPages} bind:value={goToInput} onkeydown={(e) => e.key === 'Enter' && handleGoTo()} />
      <button class="pag-go-btn" onclick={handleGoTo}>Go</button>
    </div>
    </div>
  </div>

  <!-- Mark Returned modal -->
  {#if markReturnTarget}
    <div class="modal-overlay" onclick={() => { markReturnTarget = null; markReturnNotes = ''; markReturnErr = ''; }} role="presentation">
      <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Mark asset returned">
        <div class="modal-head">
          <span class="modal-title">Mark asset returned</span>
          <button class="modal-close" onclick={() => { markReturnTarget = null; markReturnNotes = ''; markReturnErr = ''; }} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="modal-msg">Record the return of <strong>{markReturnTarget.assetName}</strong> from <strong>{markReturnTarget.employee}</strong>.</p>
          <div class="form-row">
            <label class="form-label" for="mark-notes">Reason (optional)</label>
            <textarea id="mark-notes" class="form-ta" rows="3" placeholder="e.g. Employee resigned, contract ended…" bind:value={markReturnNotes}></textarea>
          </div>
          {#if markReturnErr}
            <div class="modal-err">{markReturnErr}</div>
          {/if}
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick={() => { markReturnTarget = null; markReturnNotes = ''; markReturnErr = ''; }}>Cancel</button>
          <button class="btn-primary" onclick={confirmMarkReturned} disabled={markReturning}>
            {markReturning ? 'Saving…' : 'Confirm return'}
          </button>
        </div>
      </div>
    </div>
  {/if}

</div>

<style>
  .breadcrumb { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .crumb-link { background: none; border: none; padding: 0; font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); cursor: pointer; transition: color 120ms ease; }
  .crumb-link:hover { color: var(--body); }
  .crumb-sep { color: var(--hairline-strong); flex-shrink: 0; }
  .crumb-current { font-size: 12.5px; color: var(--body); font-family: var(--font-sans); }

  .page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: calc(100vh - 64px);
    min-height: 0;
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sp-md);
  }

  .page-title {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.4px;
    color: var(--ink);
  }

  .page-sub {
    font-size: 13px;
    color: var(--mute);
    margin-top: 3px;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: var(--ink);
    color: var(--on-primary);
    border: none;
    border-radius: var(--r-md);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: opacity 120ms ease;
  }
  .btn-primary:hover { opacity: 0.85; }

  /* KPI */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--sp-md);
  }

  .kpi-card {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: var(--sp-md) var(--sp-lg);
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: var(--shadow-l1);
  }

  .kpi-label { font-size: 12px; color: var(--mute); font-weight: 500; }
  .kpi-value { font-size: 28px; font-weight: 600; color: var(--ink); letter-spacing: -0.5px; line-height: 1; margin: 4px 0; }
  .kpi-delta { font-size: 12px; font-weight: 500; }
  .kpi-delta.pos { color: oklch(42% 0.18 155); }
  .kpi-delta.neg { color: var(--error); }

  /* Table card */
  .table-wrap {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    overflow: hidden;
    box-shadow: var(--shadow-l1);
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--sp-sm);
    padding: 12px 14px;
    border-bottom: 1px solid var(--hairline);
    flex-wrap: wrap;
  }

  .table-scroll-inner {
    overflow-x: auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    flex: 1;
  }

  .search-box {
    position: relative;
    flex: 1;
    max-width: 380px;
  }

  .s-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--mute);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 6px 10px 6px 32px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    font-size: 13px;
    font-family: var(--font-sans);
    color: var(--ink);
    background: var(--canvas-soft);
  }
  .search-input::placeholder { color: var(--mute); }
  .search-input:focus { outline: none; border-color: var(--link); }

  .filter-select {
    padding: 6px 10px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    font-size: 13px;
    font-family: var(--font-sans);
    color: var(--ink);
    background: var(--canvas-soft);
    cursor: pointer;
  }
  .filter-select:focus { outline: none; border-color: var(--link); }

  .table {
    width: 100%;
    min-width: 640px;
    border-collapse: collapse;
    font-size: 13px;
  }

  .table thead tr {
    background: var(--canvas-soft);
    border-bottom: 1px solid var(--hairline);
  }

  .table th {
    padding: 10px 14px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--canvas-soft);
  }

  .table tbody tr { border-bottom: 1px solid var(--hairline); }
  .table tbody tr:last-child { border-bottom: none; }

  .row-click { cursor: pointer; transition: background 100ms ease; }
  .row-click:hover { background: var(--canvas-soft); }

  .table td {
    padding: 11px 14px;
    color: var(--body);
    vertical-align: middle;
  }

  .ref-id {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--link);
    font-weight: 500;
  }

  .emp-cell { display: flex; align-items: center; gap: 9px; }

  .emp-av {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    flex-shrink: 0;
  }

  .emp-name { font-weight: 500; color: var(--ink); font-size: 13px; }
  .emp-meta { font-size: 11px; color: var(--mute); margin-top: 1px; }

  .asset-primary { font-weight: 500; color: var(--ink); }
  .asset-more { font-size: 11px; color: var(--mute); margin-top: 2px; }

  .td-date { white-space: nowrap; }

  .badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--r-xs);
  }
  .badge-green { background: oklch(93% 0.06 155); color: oklch(35% 0.15 155); }
  .badge-red   { background: var(--error-soft); color: var(--error); }
  .badge-gray  { background: var(--canvas-soft-2); color: var(--mute); border: 1px solid var(--hairline); }
  .badge-amber { background: oklch(95% 0.06 80); color: oklch(40% 0.15 55); }

  .td-actions { display: flex; align-items: center; gap: 6px; }

  .return-btn {
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    color: oklch(42% 0.18 264);
    background: oklch(93% 0.05 264);
    border: 1px solid oklch(80% 0.10 264);
    border-radius: var(--r-sm);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: background 100ms ease;
    white-space: nowrap;
  }
  .return-btn:hover { background: oklch(89% 0.08 264); }

  .approve-btn {
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    color: oklch(38% 0.18 152);
    background: oklch(93% 0.06 152);
    border: 1px solid oklch(78% 0.10 152);
    border-radius: var(--r-sm);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: background 100ms ease;
    white-space: nowrap;
  }
  .approve-btn:hover { background: oklch(89% 0.08 152); }

  .reject-btn {
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    color: oklch(42% 0.22 28);
    background: oklch(93% 0.05 28);
    border: 1px solid oklch(80% 0.10 28);
    border-radius: var(--r-sm);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: background 100ms ease;
    white-space: nowrap;
  }
  .reject-btn:hover { background: oklch(89% 0.08 28); }

  .btn-danger-sm {
    padding: 7px 14px; font-size: 13px; font-weight: 500;
    color: var(--error); background: var(--error-soft);
    border: 1px solid var(--error); border-radius: var(--r-md);
    cursor: pointer; font-family: var(--font-sans); transition: background 100ms ease;
  }
  .btn-danger-sm:hover:not(:disabled) { background: oklch(90% 0.06 28); }
  .btn-danger-sm:disabled { opacity: 0.5; cursor: not-allowed; }

  .form-row { display: flex; flex-direction: column; gap: 5px; }
  .form-label { font-size: 12px; font-weight: 500; color: var(--body); }
  .form-ta {
    padding: 7px 10px; border: 1px solid var(--hairline); border-radius: var(--r-md);
    font-size: 13px; font-family: var(--font-sans); color: var(--ink);
    background: var(--canvas); resize: vertical; width: 100%; line-height: 1.5;
  }
  .form-ta:focus { outline: none; border-color: var(--link); }

  .return-notes-box {
    padding: 8px 12px; background: var(--canvas-soft); border: 1px solid var(--hairline);
    border-radius: var(--r-md); display: flex; flex-direction: column; gap: 3px;
  }
  .return-notes-label { font-size: 10.5px; font-weight: 600; color: var(--mute); text-transform: uppercase; letter-spacing: 0.4px; }
  .return-notes-text { font-size: 13px; color: var(--body); }

  .view-btn {
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--body);
    background: none;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: background 100ms ease, color 100ms ease;
    white-space: nowrap;
  }
  .view-btn:hover { background: var(--canvas-soft-2); color: var(--ink); }

  /* ── Modal ───────────────────────────────────────────────────────────────── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: oklch(0% 0 0 / 0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 50; padding: 20px;
  }
  .modal {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-l3);
    width: 100%; max-width: 400px;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .modal-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-bottom: 1px solid var(--hairline);
  }
  .modal-title { font-size: 14px; font-weight: 600; color: var(--ink); }
  .modal-close {
    background: none; border: none; cursor: pointer; color: var(--mute);
    display: flex; align-items: center; padding: 4px; border-radius: var(--r-xs);
    transition: color 100ms ease;
  }
  .modal-close:hover { color: var(--ink); }
  .modal-body { padding: 18px; display: flex; flex-direction: column; gap: 12px; }
  .modal-msg { font-size: 14px; color: var(--body); line-height: 1.6; }
  .modal-err {
    font-size: 12px; color: var(--error);
    padding: 7px 10px; background: var(--error-soft); border-radius: var(--r-md);
  }
  .modal-foot {
    padding: 12px 18px; border-top: 1px solid var(--hairline);
    display: flex; justify-content: flex-end; gap: 8px;
  }
  .btn-ghost {
    padding: 7px 14px; font-size: 13px; font-weight: 500;
    color: var(--body); background: var(--canvas);
    border: 1px solid var(--hairline); border-radius: var(--r-md);
    cursor: pointer; font-family: var(--font-sans);
    box-shadow: var(--shadow-l1); transition: background 100ms ease;
  }
  .btn-ghost:hover { background: var(--canvas-soft-2); }
  .btn-primary {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; font-size: 13px; font-weight: 500;
    background: var(--ink); color: var(--on-primary);
    border: none; border-radius: var(--r-md);
    cursor: pointer; font-family: var(--font-sans); transition: opacity 120ms ease;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .empty-cell {
    text-align: center;
    color: var(--mute);
    padding: 40px 16px;
    font-size: 13px;
  }

  /* ── Pagination ─────────────────────────────────────────────────────────── */
  .pagination-bar {
    background: var(--canvas-soft);
    border-top: 1px solid var(--hairline);
    padding: 10px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-md);
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .pag-left, .pag-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pag-label {
    font-size: 12px;
    color: var(--mute);
    white-space: nowrap;
  }

  .pag-select {
    padding: 4px 8px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    font-size: 12px;
    font-family: var(--font-sans);
    color: var(--ink);
    background: var(--canvas);
    cursor: pointer;
  }
  .pag-select:focus { outline: none; border-color: var(--link); }

  .pag-pages {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .pag-btn {
    min-width: 30px;
    height: 30px;
    padding: 0 6px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    color: var(--body);
    background: var(--canvas);
    cursor: pointer;
    transition: background 100ms ease, color 100ms ease, border-color 100ms ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .pag-btn:hover:not(:disabled) { background: var(--canvas-soft-2); color: var(--ink); }
  .pag-btn:disabled { opacity: 0.4; cursor: default; }
  .pag-btn.pag-active {
    background: var(--ink);
    color: var(--on-primary);
    border-color: var(--ink);
  }

  .pag-go-input {
    width: 52px;
    padding: 4px 8px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    font-size: 12px;
    font-family: var(--font-sans);
    color: var(--ink);
    background: var(--canvas);
    text-align: center;
  }
  .pag-go-input:focus { outline: none; border-color: var(--link); }
  /* hide number spinners */
  .pag-go-input::-webkit-outer-spin-button,
  .pag-go-input::-webkit-inner-spin-button { -webkit-appearance: none; }

  .pag-go-btn {
    padding: 4px 12px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    color: var(--ink);
    background: var(--canvas);
    cursor: pointer;
    transition: background 100ms ease;
  }
  .pag-go-btn:hover { background: var(--canvas-soft-2); }

  .load-err { padding: 10px 14px; background: oklch(93% 0.05 28); border: 1px solid oklch(80% 0.12 28); border-radius: var(--r-lg); color: oklch(40% 0.22 28); font-size: 13px; font-family: var(--font-sans); }

  @media (max-width: 700px) {
    .pag-right { display: none; }
    .pagination-bar { justify-content: center; }
  }
</style>
