<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';
  import { onChange } from '$lib/ws';

  interface Branch { id: string; name: string; }
  interface ScanRow {
    id: string; fileName: string; isBaseline: boolean;
    overallStatus: 'match' | 'warning' | 'mismatch' | null;
    status: 'pending' | 'reviewed' | 'flagged' | 'archived';
    createdAt: string;
    submittedBy: { id: string; name: string } | null;
    asset: { id: string; name: string; serialNumber: string | null; branch: { id: string; name: string } | null } | null;
  }
  interface ScanList {
    scans: ScanRow[]; total: number; page: number; pageSize: number;
    summary: { mismatches: number; warnings: number; clean: number; pendingMismatches: number };
  }

  let loading   = $state(true);
  let loadErr   = $state('');
  let data      = $state<ScanList | null>(null);
  let branches  = $state<Branch[]>([]);

  let fStatus   = $state('');
  let fResult   = $state('');
  let fBranch   = $state('');
  let page      = $state(1);

  const totalPages = $derived(data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1);

  async function load() {
    loading = true;
    loadErr = '';
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (fStatus) params.set('status', fStatus);
      if (fResult) params.set('overallStatus', fResult);
      if (fBranch) params.set('branchId', fBranch);
      data = await api.get<ScanList>(`/api/hardware-audit/scans?${params}`);
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    branches = await api.get<Branch[]>('/api/branches').catch(() => []);
    await load();
  });
  onDestroy(onChange(['HardwareScan'], () => load()));

  function applyFilters() { page = 1; void load(); }
  function resetFilters() { fStatus = ''; fResult = ''; fBranch = ''; page = 1; void load(); }
  function go(delta: number) { page = Math.min(totalPages, Math.max(1, page + delta)); void load(); }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      + ' · ' + new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
</script>

<svelte:head><title>Hardware Audit — Oracle Inventory</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1 class="page-title">Hardware Audit</h1>
      <p class="page-sub">Review submitted Belarc scans</p>
    </div>
    <button class="btn-primary" onclick={() => goto('/hardware-audit/upload')}>Upload Scan +</button>
  </div>

  {#if !can('view_inventory')}
    <div class="panel muted">You do not have permission to view inventory.</div>
  {:else}

    <!-- Filters -->
    <div class="panel filter-bar">
      <label class="filter">
        <span>Status</span>
        <select bind:value={fStatus} onchange={applyFilters}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
          <option value="flagged">Flagged</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <label class="filter">
        <span>Result</span>
        <select bind:value={fResult} onchange={applyFilters}>
          <option value="">All</option>
          <option value="mismatch">Mismatch</option>
          <option value="warning">Warning</option>
          <option value="match">Match</option>
        </select>
      </label>
      <label class="filter">
        <span>Branch</span>
        <select bind:value={fBranch} onchange={applyFilters}>
          <option value="">All</option>
          {#each branches as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
        </select>
      </label>
      <button class="btn-ghost" onclick={resetFilters}>Reset</button>
    </div>

    <!-- Summary chips -->
    {#if data}
      <div class="chips">
        <span class="chip chip-red">{data.summary.mismatches} Mismatch{data.summary.mismatches === 1 ? '' : 'es'}</span>
        <span class="chip chip-yellow">{data.summary.warnings} Warning{data.summary.warnings === 1 ? '' : 's'}</span>
        <span class="chip chip-green">{data.summary.clean} Clean</span>
        {#if data.summary.pendingMismatches > 0}
          <span class="chip chip-pending">{data.summary.pendingMismatches} pending mismatch{data.summary.pendingMismatches === 1 ? '' : 'es'} need review</span>
        {/if}
      </div>
    {/if}

    <!-- Scan table -->
    <div class="panel flush">
      {#if loading}
        <div class="state muted">Loading scans…</div>
      {:else if loadErr}
        <div class="state error-text">{loadErr}</div>
      {:else if !data || data.scans.length === 0}
        <div class="state muted">No scans found. Upload a Belarc report to get started.</div>
      {:else}
        {#each data.scans as scan (scan.id)}
          <button class="scan-row" class:row-muted={scan.status !== 'pending'} onclick={() => goto(`/hardware-audit/${scan.id}`)}>
            <div class="scan-main">
              <span class="scan-asset">{scan.asset?.name ?? '—'}</span>
              <span class="scan-meta mono">SN: {scan.asset?.serialNumber ?? '—'}</span>
              <span class="scan-meta">{scan.asset?.branch?.name ?? '—'} · {fmtDate(scan.createdAt)}{scan.submittedBy ? ` · ${scan.submittedBy.name}` : ''}</span>
            </div>
            <div class="scan-side">
              {#if scan.isBaseline}
                <span class="badge badge-blue">Baseline</span>
              {:else if scan.overallStatus === 'mismatch'}
                <span class="badge badge-red">Mismatch</span>
              {:else if scan.overallStatus === 'warning'}
                <span class="badge badge-yellow">Warning</span>
              {:else if scan.overallStatus === 'match'}
                <span class="badge badge-green">Match</span>
              {:else}
                <span class="badge badge-muted">No baseline</span>
              {/if}
              <span class="badge badge-status">{scan.status.toUpperCase()}</span>
            </div>
          </button>
        {/each}
      {/if}
    </div>

    <!-- Pagination -->
    {#if data && data.total > data.pageSize}
      <div class="pager">
        <span class="muted">Showing {data.scans.length} of {data.total} scans</span>
        <div class="pager-btns">
          <button class="btn-outline" disabled={page <= 1} onclick={() => go(-1)}>← Prev</button>
          <span class="muted">Page {page} of {totalPages}</span>
          <button class="btn-outline" disabled={page >= totalPages} onclick={() => go(1)}>Next →</button>
        </div>
      </div>
    {/if}

  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: var(--sp-lg, 16px); }
  .page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
  .page-title { font-size: 20px; font-weight: 600; color: var(--ink); margin: 0; }
  .page-sub { font-size: 13px; color: var(--mute); margin: 2px 0 0; }

  .panel {
    background: var(--canvas); border: 1px solid var(--hairline);
    border-radius: var(--r-md, 8px); padding: 14px 16px;
  }
  .panel.flush { padding: 0; overflow: hidden; }
  .muted { color: var(--mute); font-size: 13px; }
  .error-text { color: var(--error); font-size: 13px; }
  .state { padding: 24px 16px; text-align: center; }
  .mono { font-family: var(--font-mono, ui-monospace, monospace); }

  .filter-bar { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
  .filter { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--mute); }
  .filter select {
    font: inherit; font-size: 13px; color: var(--ink);
    padding: 6px 10px; border: 1px solid var(--hairline-strong);
    border-radius: var(--r-sm, 6px); background: var(--canvas); min-width: 130px;
  }

  .chips { display: flex; gap: 10px; flex-wrap: wrap; }
  .chip {
    font-size: 12.5px; font-weight: 500; padding: 5px 12px;
    border-radius: var(--r-full, 999px); border: 1px solid var(--hairline);
    background: var(--canvas); color: var(--body);
  }
  .chip-red { border-color: var(--error); }
  .chip-pending { background: var(--error-soft, var(--canvas-soft)); color: var(--error); border-color: var(--error); }

  .scan-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    width: 100%; text-align: left; padding: 12px 16px; cursor: pointer;
    font: inherit; color: inherit; background: var(--canvas);
    border: none; border-bottom: 1px solid var(--hairline);
  }
  .scan-row:last-child { border-bottom: none; }
  .scan-row:hover { background: var(--canvas-soft); }
  .scan-row.row-muted .scan-asset { color: var(--body); }
  .scan-row.row-muted { opacity: 0.75; }
  .scan-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .scan-asset { font-size: 13.5px; font-weight: 600; color: var(--ink); }
  .scan-meta { font-size: 12px; color: var(--mute); }
  .scan-side { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  .badge {
    font-size: 11px; font-weight: 500; padding: 3px 9px;
    border-radius: var(--r-full, 999px); border: 1px solid var(--hairline);
    background: var(--canvas-soft); color: var(--body); white-space: nowrap;
  }
  .badge-red { border-color: var(--error); color: var(--error); background: var(--error-soft, var(--canvas-soft)); }
  .badge-status { background: var(--canvas); color: var(--mute); font-size: 10px; letter-spacing: 0.05em; }

  .pager { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .pager-btns { display: flex; align-items: center; gap: 10px; }

  .btn-primary, .btn-outline, .btn-ghost {
    font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
    padding: 7px 14px; border-radius: var(--r-sm, 6px);
  }
  .btn-primary { background: var(--ink); color: var(--on-primary, #fff); border: 1px solid var(--ink); }
  .btn-outline { background: var(--canvas); color: var(--ink); border: 1px solid var(--hairline-strong); }
  .btn-outline:disabled { opacity: 0.4; cursor: default; }
  .btn-ghost { background: none; border: none; color: var(--mute); text-decoration: underline; padding: 6px 4px; }
</style>
