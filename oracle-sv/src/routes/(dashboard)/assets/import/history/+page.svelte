<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.svelte';

  const can = (k: string) => authStore.hasPermission(k);

  interface ImportRecord {
    id: string;
    fileName: string;
    fileSize: number;
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    failedRows: number;
    duplicatesSkipped: number;
    overwrittenRows: number;
    categoriesCreated: number;
    strictMode: boolean;
    status: string;
    createdAt: string;
    uploadedBy: { name: string; email: string };
  }

  let records = $state<ImportRecord[]>([]);
  let loading = $state(true);
  let loadErr = $state('');
  let total = $state(0);
  let page = $state(1);
  const limit = 20;

  async function load() {
    loading = true; loadErr = '';
    try {
      const res = await fetch(`/api/import/history?page=${page}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      });
      const data = await res.json();
      if (!res.ok) { loadErr = data.error ?? 'Failed to load'; return; }
      records = data.records;
      total = data.total;
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (!can('import_inventory')) { goto('/assets'); return; }
    load();
  });

  function statusColor(s: string) {
    if (s === 'completed') return 'badge-completed';
    if (s === 'partial')   return 'badge-partial';
    if (s === 'failed')    return 'badge-failed';
    if (s === 'processing')return 'badge-processing';
    return 'badge-pending';
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fmtSize(b: number) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  const pages = $derived(Math.ceil(total / limit));
</script>

<div class="page">

  <!-- Breadcrumb -->
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/dashboard')}>Dashboard</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <button class="crumb-link" onclick={() => goto('/assets/import')}>Import Assets</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="crumb-current">Import History</span>
  </nav>

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Import History</h1>
      <p class="page-sub">{total} total import{total !== 1 ? 's' : ''}</p>
    </div>
    {#if can('import_inventory')}
      <button class="btn-primary" onclick={() => goto('/assets/import')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        New import
      </button>
    {/if}
  </div>

  {#if loadErr}
    <div class="load-err">{loadErr}</div>
  {/if}

  <!-- Table card -->
  <div class="table-card">
    {#if loading}
      <div class="empty-cell">Loading…</div>
    {:else if records.length === 0}
      <div class="empty-cell">
        No imports yet.
        {#if can('import_inventory')}
          <button class="link-btn" onclick={() => goto('/assets/import')}>Start your first import →</button>
        {/if}
      </div>
    {:else}
      <div class="table-outer">
        <table class="hist-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Uploaded by</th>
              <th>Date</th>
              <th>Rows</th>
              <th>Imported</th>
              <th>Duplicates</th>
              <th>Failed</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each records as r}
              <tr onclick={() => goto(`/assets/import/history/${r.id}`)} class="row-link">
                <td class="td-file">
                  <span class="file-name">{r.fileName}</span>
                  <span class="file-size">{fmtSize(r.fileSize)}</span>
                </td>
                <td class="td-user">{r.uploadedBy.name}</td>
                <td class="td-date">{fmtDate(r.createdAt)}</td>
                <td class="td-num">{r.totalRows}</td>
                <td class="td-num td-green">{r.importedRows + r.overwrittenRows}</td>
                <td class="td-num td-blue">{r.duplicatesSkipped}</td>
                <td class="td-num td-red">{r.failedRows}</td>
                <td><span class="badge-status {statusColor(r.status)}">{r.status}</span></td>
                <td class="td-action">
                  <button class="act-view" onclick={(e) => { e.stopPropagation(); goto(`/assets/import/history/${r.id}`); }}>View</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination footer -->
      {#if pages > 1}
        <div class="table-footer">
          <span class="footer-info">Page {page} of {pages} · {total} total</span>
          <div class="pagination">
            <button class="pg-btn" disabled={page === 1} onclick={() => { page--; load(); }}>‹</button>
            {#each Array.from({ length: pages }, (_, i) => i + 1) as p}
              <button class="pg-btn" class:pg-active={p === page} onclick={() => { page = p; load(); }}>{p}</button>
            {/each}
            <button class="pg-btn" disabled={page >= pages} onclick={() => { page++; load(); }}>›</button>
          </div>
          <span></span>
        </div>
      {/if}
    {/if}
  </div>

</div>

<style>
  .breadcrumb { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .crumb-link { background: none; border: none; padding: 0; font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); cursor: pointer; transition: color 120ms ease; }
  .crumb-link:hover { color: var(--body); }
  .crumb-sep { color: var(--hairline-strong); flex-shrink: 0; }
  .crumb-current { font-size: 12.5px; color: var(--body); font-family: var(--font-sans); }

  .page { display: flex; flex-direction: column; gap: 20px; width: 100%; min-width: 0; }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-title { font-size: 22px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.4px; line-height: 1.2; }
  .page-sub { font-size: 13px; color: var(--mute); font-family: var(--font-sans); margin-top: 3px; }

  .btn-primary {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: none;
    background: var(--ink); color: var(--on-primary);
    transition: opacity 120ms ease; line-height: 1; flex-shrink: 0;
  }
  .btn-primary:hover { opacity: 0.85; }

  .load-err { padding: 10px 14px; background: oklch(93% 0.05 28); border: 1px solid oklch(80% 0.12 28); border-radius: var(--r-lg); color: oklch(40% 0.22 28); font-size: 13px; font-family: var(--font-sans); }

  /* Table card */
  .table-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-l1); overflow: hidden; display: flex; flex-direction: column; }
  .table-outer { overflow-x: auto; -webkit-overflow-scrolling: touch; flex: 1; }

  .empty-cell { text-align: center; color: var(--mute); font-size: 13px; padding: 48px 20px; font-family: var(--font-sans); display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .link-btn { background: none; border: none; color: var(--link); cursor: pointer; font-family: var(--font-sans); font-size: 13px; text-decoration: none; }
  .link-btn:hover { text-decoration: underline; }

  /* Table */
  .hist-table { width: 100%; border-collapse: collapse; font-family: var(--font-sans); font-size: 13px; min-width: 800px; }
  .hist-table thead tr { background: var(--canvas-soft); border-bottom: 1px solid var(--hairline); }
  .hist-table th { text-align: left; padding: 10px 16px; color: var(--mute); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
  .hist-table td { padding: 12px 16px; border-bottom: 1px solid var(--hairline); vertical-align: middle; color: var(--body); }
  .hist-table tr:last-child td { border-bottom: none; }
  .row-link { cursor: pointer; transition: background 100ms ease; }
  .row-link:hover td { background: var(--canvas-soft); }

  .td-file { min-width: 180px; }
  .file-name { display: block; font-weight: 500; color: var(--ink); font-size: 13px; }
  .file-size { display: block; font-size: 11px; color: var(--mute); margin-top: 2px; }
  .td-user { color: var(--body); white-space: nowrap; }
  .td-date { color: var(--mute); font-size: 12px; white-space: nowrap; font-family: var(--font-mono); }
  .td-num { text-align: center; font-weight: 600; color: var(--body); }
  .td-green { color: oklch(40% 0.18 145); }
  .td-blue  { color: oklch(40% 0.15 264); }
  .td-red   { color: var(--error); }
  .td-action { text-align: right; }

  .badge-status { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: var(--r-xs); font-family: var(--font-sans); text-transform: capitalize; }
  .badge-completed  { background: oklch(90% 0.1 145); color: oklch(35% 0.15 145); }
  .badge-partial    { background: oklch(92% 0.1 80); color: oklch(40% 0.15 80); }
  .badge-failed     { background: var(--error-soft); color: var(--error); }
  .badge-processing { background: oklch(92% 0.06 264); color: oklch(40% 0.15 264); }
  .badge-pending    { background: var(--canvas-soft-2); color: var(--mute); }

  .act-view { font-size: 12px; font-weight: 500; padding: 4px 10px; border: 1px solid var(--hairline); border-radius: var(--r-sm); background: var(--canvas); cursor: pointer; color: var(--body); font-family: var(--font-sans); transition: background 100ms ease; }
  .act-view:hover { background: var(--canvas-soft-2); color: var(--ink); }

  /* Pagination footer */
  .table-footer { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 10px 16px; border-top: 1px solid var(--hairline); background: var(--canvas-soft); gap: 12px; flex-shrink: 0; }
  .footer-info { font-size: 12px; color: var(--mute); font-family: var(--font-sans); white-space: nowrap; }
  .pagination { display: flex; align-items: center; gap: 3px; }
  .pg-btn { min-width: 28px; height: 28px; padding: 0 6px; border-radius: var(--r-sm); border: 1px solid var(--hairline); background: var(--canvas); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; color: var(--body); cursor: pointer; font-family: var(--font-sans); transition: background 100ms ease; }
  .pg-btn:hover:not(:disabled) { background: var(--canvas-soft-2); color: var(--ink); }
  .pg-btn:disabled { opacity: 0.4; cursor: default; }
  .pg-active { background: var(--ink) !important; color: var(--on-primary) !important; border-color: var(--ink) !important; }
</style>
