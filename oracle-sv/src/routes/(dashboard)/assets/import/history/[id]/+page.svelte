<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.svelte';

  const can = (k: string) => authStore.hasPermission(k);

  interface ImportDetail {
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
    editedBeforeImport: number;
    strictMode: boolean;
    status: string;
    createdAt: string;
    mappingUsed: unknown;
    uploadedBy: { name: string; email: string };
    rows: {
      id: string; rowIndex: number; rawData: Record<string, unknown>;
      mappedData: Record<string, unknown>; outcome: string | null;
      assetId: string | null; errorMessage: string | null;
      isDuplicate: boolean; conflictKey: string | null;
      employeeHint: string | null;
    }[];
  }

  let detail = $state<ImportDetail | null>(null);
  let loading = $state(true);
  let loadErr = $state('');
  let rowFilter = $state<string>('all');

  onMount(async () => {
    if (!can('import_inventory')) { goto('/assets'); return; }
    try {
      const res = await fetch(`/api/import/history/${$page.params.id}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      });
      const data = await res.json();
      if (!res.ok) { loadErr = data.error ?? 'Not found'; return; }
      detail = data;
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  const filteredRows = $derived(
    !detail ? [] :
    rowFilter === 'all'        ? detail.rows :
    rowFilter === 'imported'   ? detail.rows.filter(r => r.outcome === 'imported' || r.outcome === 'overwritten') :
    rowFilter === 'duplicate'  ? detail.rows.filter(r => r.isDuplicate) :
    rowFilter === 'failed'     ? detail.rows.filter(r => r.outcome === 'failed') :
    detail.rows.filter(r => r.outcome === 'skipped')
  );

  function outcomeBadge(outcome: string | null) {
    if (outcome === 'imported')    return 'b-imported';
    if (outcome === 'overwritten') return 'b-overwritten';
    if (outcome === 'duplicate')   return 'b-duplicate';
    if (outcome === 'failed')      return 'b-failed';
    if (outcome === 'skipped')     return 'b-skipped';
    return 'b-pending';
  }

  function statusColor(s: string) {
    if (s === 'completed') return 'b-imported';
    if (s === 'partial')   return 'b-overwritten';
    if (s === 'failed')    return 'b-failed';
    return 'b-pending';
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fmtSize(b: number) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  async function downloadFailed() {
    const res = await fetch(`/api/import/history/${$page.params.id}/failed`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    const rows = await res.json();
    if (!rows.length) return;
    // Convert to CSV
    const keys = Object.keys(rows[0].rawData ?? {});
    const csv = [
      ['Row', 'Outcome', 'Error', ...keys].join(','),
      ...rows.map((r: any) => [
        r.rowIndex + 1, r.outcome ?? '', `"${(r.errorMessage ?? '').replace(/"/g, '""')}"`,
        ...keys.map((k: string) => `"${String(r.rawData?.[k] ?? '').replace(/"/g, '""')}"`)
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `failed_rows_${$page.params.id.slice(0, 8)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }
</script>

<div class="page">
  <div class="back-row">
    <button class="back-btn" onclick={() => goto('/assets/import/history')}>← Import History</button>
  </div>

  {#if loading}
    <div class="loading">Loading…</div>
  {:else if loadErr}
    <div class="err-msg">{loadErr}</div>
  {:else if detail}
    <div class="page-head">
      <div>
        <h1 class="page-title">{detail.fileName}</h1>
        <p class="page-sub">Uploaded by {detail.uploadedBy.name} · {fmtDate(detail.createdAt)}</p>
      </div>
      <div class="head-right">
        <span class="badge-status {statusColor(detail.status)}">{detail.status}</span>
        {#if detail.failedRows > 0}
          <button class="btn-ghost-sm" onclick={downloadFailed}>Download failed rows</button>
        {/if}
      </div>
    </div>

    <!-- Summary KPIs -->
    <div class="kpi-grid">
      <div class="kpi-card"><span class="kpi-val kv-green">{detail.importedRows}</span><span class="kpi-label">Imported</span></div>
      <div class="kpi-card"><span class="kpi-val kv-blue">{detail.overwrittenRows}</span><span class="kpi-label">Overwritten</span></div>
      <div class="kpi-card"><span class="kpi-val kv-muted">{detail.duplicatesSkipped}</span><span class="kpi-label">Duplicates skipped</span></div>
      <div class="kpi-card"><span class="kpi-val kv-red">{detail.failedRows}</span><span class="kpi-label">Failed</span></div>
      <div class="kpi-card"><span class="kpi-val kv-muted">{detail.totalRows}</span><span class="kpi-label">Total rows</span></div>
      <div class="kpi-card"><span class="kpi-val kv-muted">{detail.categoriesCreated}</span><span class="kpi-label">Categories created</span></div>
    </div>

    <!-- Meta -->
    <div class="meta-row">
      <span class="meta-item">📁 {fmtSize(detail.fileSize)}</span>
      {#if detail.strictMode}<span class="meta-item meta-strict">Transactional mode</span>{/if}
      {#if detail.editedBeforeImport > 0}<span class="meta-item">{detail.editedBeforeImport} rows edited before import</span>{/if}
    </div>

    <!-- Per-row results -->
    <div class="rows-section">
      <div class="rows-head">
        <h2 class="section-title">Per-row results</h2>
        <div class="filter-row">
          {#each ([['all','All'],['imported','Imported'],['duplicate','Duplicates'],['failed','Failed'],['skipped','Skipped']] as const) as [val, label]}
            <button class="filter-btn" class:active={rowFilter === val} onclick={() => rowFilter = val}>{label}</button>
          {/each}
        </div>
      </div>

      <div class="table-scroll">
        <table class="rows-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Outcome</th>
              <th>Name</th>
              <th>Asset Tag</th>
              <th>Serial</th>
              <th>Employee</th>
              <th>Asset ID</th>
              <th>Error / Note</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredRows as r}
              <tr>
                <td class="td-idx">{r.rowIndex + 1}</td>
                <td><span class="badge-row {outcomeBadge(r.outcome)}">{r.outcome ?? 'pending'}</span></td>
                <td class="td-name">{String(r.mappedData.name ?? '—')}</td>
                <td>{String(r.mappedData.assetTag ?? '—')}</td>
                <td>{String(r.mappedData.serialNumber ?? '—')}</td>
                <td>{r.employeeHint ?? String(r.mappedData.employeeRef ?? '—')}</td>
                <td class="td-asset">
                  {#if r.assetId}
                    <button class="link-btn" onclick={() => goto(`/assets/${r.assetId}`)}>{r.assetId.slice(0, 8).toUpperCase()}</button>
                  {:else}—{/if}
                </td>
                <td class="td-err">
                  {#if r.errorMessage}<span class="err-text">{r.errorMessage}</span>{/if}
                  {#if r.isDuplicate && r.conflictKey}<span class="dup-text">Dup: {r.conflictKey}</span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<style>
  .page { max-width: 1100px; margin: 0 auto; }
  .back-row { margin-bottom: 16px; }
  .back-btn { background: none; border: none; cursor: pointer; color: var(--mute); font-size: 13px; font-family: var(--font-sans); padding: 0; }
  .back-btn:hover { color: var(--body); }
  .page-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .page-title { font-size: 20px; font-weight: 700; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.3px; }
  .page-sub { font-size: 12px; color: var(--mute); font-family: var(--font-sans); margin-top: 3px; }
  .head-right { display: flex; align-items: center; gap: 10px; }
  .loading { padding: 48px; text-align: center; color: var(--mute); font-family: var(--font-sans); }
  .err-msg { font-size: 13px; color: var(--error); background: var(--error-soft); border-radius: var(--r-sm); padding: 10px 14px; font-family: var(--font-sans); }
  .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 16px; }
  @media (max-width: 768px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 480px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
  .kpi-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 14px; text-align: center; }
  .kpi-val { display: block; font-size: 24px; font-weight: 700; font-family: var(--font-sans); }
  .kpi-label { display: block; font-size: 11px; color: var(--mute); font-family: var(--font-sans); margin-top: 2px; }
  .kv-green { color: oklch(40% 0.18 145); }
  .kv-blue  { color: oklch(40% 0.15 264); }
  .kv-red   { color: var(--error); }
  .kv-muted { color: var(--body); }
  .meta-row { display: flex; gap: 14px; margin-bottom: 24px; flex-wrap: wrap; }
  .meta-item { font-size: 12px; color: var(--mute); font-family: var(--font-sans); }
  .meta-strict { background: oklch(92% 0.06 264); color: oklch(40% 0.15 264); padding: 2px 8px; border-radius: 4px; font-weight: 600; }
  .rows-section { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); overflow: hidden; }
  .rows-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--hairline); flex-wrap: wrap; gap: 10px; }
  .section-title { font-size: 14px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }
  .filter-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .filter-btn { font-size: 12px; padding: 4px 10px; border: 1px solid var(--hairline); border-radius: 999px; background: none; cursor: pointer; color: var(--body); font-family: var(--font-sans); }
  .filter-btn.active { background: var(--ink); color: #fff; border-color: var(--ink); }
  .table-scroll { overflow-x: auto; }
  .rows-table { width: 100%; border-collapse: collapse; font-family: var(--font-sans); font-size: 13px; }
  .rows-table th { text-align: left; padding: 9px 14px; background: var(--canvas-soft); border-bottom: 1px solid var(--hairline); color: var(--mute); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
  .rows-table td { padding: 8px 14px; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  .rows-table tr:last-child td { border-bottom: none; }
  .td-idx { text-align: center; color: var(--mute); width: 40px; }
  .td-name { font-weight: 500; color: var(--ink); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .td-asset { font-size: 12px; }
  .td-err { font-size: 12px; max-width: 200px; }
  .err-text { color: var(--error); display: block; }
  .dup-text { color: oklch(40% 0.15 264); display: block; font-size: 11px; }
  .badge-row { font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 4px; font-family: var(--font-sans); text-transform: capitalize; }
  .b-imported    { background: oklch(90% 0.1 145); color: oklch(35% 0.15 145); }
  .b-overwritten { background: oklch(92% 0.1 80); color: oklch(40% 0.15 80); }
  .b-duplicate   { background: oklch(92% 0.06 264); color: oklch(40% 0.15 264); }
  .b-failed      { background: var(--error-soft); color: var(--error); }
  .b-skipped     { background: var(--canvas-soft-2); color: var(--mute); }
  .b-pending     { background: var(--canvas-soft-2); color: var(--mute); }
  .badge-status  { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 4px; font-family: var(--font-sans); text-transform: capitalize; }
  .link-btn { background: none; border: none; color: var(--link); cursor: pointer; font-family: monospace; font-size: 12px; text-decoration: underline; padding: 0; }
  .btn-ghost-sm { background: none; border: 1px solid var(--hairline); border-radius: var(--r-sm); padding: 6px 14px; font-size: 12px; cursor: pointer; color: var(--body); font-family: var(--font-sans); }
  .btn-ghost-sm:hover { background: var(--canvas-soft-2); }
</style>
