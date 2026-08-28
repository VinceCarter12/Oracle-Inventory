<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';
  import { authStore } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';
  import { onChange } from '$lib/ws';

  const can = (key: string) => authStore.hasPermission(key);
  const canReview = () => can('approve_transactions') || can('manage_users');

  // ── Filters ───────────────────────────────────────────────────────────────
  let filterStatus = $state<'pending' | 'accepted' | 'rejected'>('pending');
  let filterUser   = $state('');
  let filterFrom   = $state('');
  let filterTo     = $state('');
  let page         = $state(1);

  // ── Data ──────────────────────────────────────────────────────────────────
  interface Owner { id: string; name: string; email: string; }
  interface ResultItem {
    id:           string;
    status:       string;
    parsedData:   Record<string, string>;
    rawLines:     string[];
    rejectReason?: string;
    assetId?:     string;
    scannedAt:    string;
    deviceLabel:  string;
    roomCode:     string;
    owner:        Owner;
  }

  let items     = $state<ResultItem[]>([]);
  let total     = $state(0);
  let pages     = $state(0);
  let loading   = $state(false);
  let loadError = $state('');

  // ── Selection ─────────────────────────────────────────────────────────────
  let selected  = $state<Set<string>>(new Set());

  // ── Action state ──────────────────────────────────────────────────────────
  let actionId     = $state('');   // item being actioned individually
  let actionType   = $state<'accept' | 'reject' | ''>('');
  let rejectReason = $state('');
  let actionBusy   = $state(false);
  let actionError  = $state('');
  let actionDone   = $state('');

  // Categories / branches for accept form
  interface Category { id: string; name: string; }
  interface Branch   { id: string; name: string; }
  let categories   = $state<Category[]>([]);
  let branches     = $state<Branch[]>([]);
  let acceptCatId  = $state('');
  let acceptBrId   = $state('');

  // Bulk action state
  let bulkBusy     = $state(false);
  let bulkError    = $state('');
  let bulkDone     = $state(0);

  // Users list (for filter dropdown)
  let users = $state<{ id: string; name: string }[]>([]);

  // Expand raw lines for a row
  let expandedId = $state('');

  // ── Load ──────────────────────────────────────────────────────────────────
  onMount(async () => {
    if (!canReview()) return;
    [categories, branches, users] = await Promise.all([
      api.get<Category[]>('/api/categories').catch(() => []),
      api.get<Branch[]>('/api/branches').catch(() => []),
      api.get<{ users: { id: string; name: string }[] }>('/api/users?limit=200').then(r => r.users ?? []).catch(() => []),
    ]);
    await loadQueue();
  });
  onDestroy(onChange(['ScanResult'], () => loadQueue()));

  async function loadQueue() {
    loading = true; loadError = '';
    try {
      const params = new URLSearchParams({ status: filterStatus, page: String(page), limit: '50' });
      if (filterUser) params.set('userId', filterUser);
      if (filterFrom) params.set('dateFrom', filterFrom);
      if (filterTo)   params.set('dateTo', filterTo);

      const data = await api.get<{ total: number; page: number; pages: number; items: ResultItem[] }>(
        `/api/scan/admin/queue?${params}`
      );
      items = data.items;
      total = data.total;
      pages = data.pages;
      selected = new Set();
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'Failed to load queue';
    } finally { loading = false; }
  }

  function applyFilters() { page = 1; loadQueue(); }
  function resetFilters() { filterStatus = 'pending'; filterUser = ''; filterFrom = ''; filterTo = ''; page = 1; loadQueue(); }

  // ── Individual action ─────────────────────────────────────────────────────
  function openAccept(id: string) { actionId = id; actionType = 'accept'; rejectReason = ''; actionError = ''; }
  function openReject(id: string) { actionId = id; actionType = 'reject'; rejectReason = ''; actionError = ''; }
  function closeAction() { actionId = ''; actionType = ''; rejectReason = ''; actionError = ''; }

  async function submitAction() {
    if (!actionId || !actionType) return;
    if (actionType === 'accept' && !acceptBrId) { actionError = 'Branch is required.'; return; }
    actionBusy = true; actionError = '';
    try {
      await api.patch(`/api/scan/admin/results/${actionId}`, {
        action:     actionType,
        reason:     rejectReason || undefined,
        categoryId: acceptCatId  || undefined,
        branchId:   acceptBrId   || undefined,
      });
      actionDone = actionType === 'accept' ? 'Asset created.' : 'Result rejected.';
      closeAction();
      setTimeout(() => { actionDone = ''; }, 3000);
      await loadQueue();
    } catch (err: unknown) {
      actionError = err instanceof Error ? err.message : 'Action failed';
    } finally { actionBusy = false; }
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    selected = s;
  }
  function selectAll() { selected = new Set(items.filter(i => i.status === 'pending').map(i => i.id)); }
  function clearSel()  { selected = new Set(); }

  async function bulkAction(action: 'accept' | 'reject') {
    if (!selected.size) return;
    if (action === 'accept' && !acceptBrId) { bulkError = 'Branch is required.'; return; }
    bulkBusy = true; bulkError = '';
    try {
      const res = await api.post<{ done: number; failed: { id: string }[] }>('/api/scan/admin/batch', {
        resultIds:  [...selected],
        action,
        reason:     action === 'reject' ? 'Bulk rejected' : undefined,
        categoryId: acceptCatId || undefined,
        branchId:   acceptBrId  || undefined,
      });
      bulkDone = res.done;
      selected = new Set();
      setTimeout(() => { bulkDone = 0; }, 3000);
      await loadQueue();
    } catch (err: unknown) {
      bulkError = err instanceof Error ? err.message : 'Bulk action failed';
    } finally { bulkBusy = false; }
  }
</script>

<div class="page">
  <div class="page-head">
    <div class="head-left">
      <button class="back-btn" onclick={() => goto('/assets')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <div>
        <h1 class="page-title">Scan Review Queue</h1>
        <p class="page-sub">Review and approve scanned asset data submitted by users</p>
      </div>
    </div>
    {#if total > 0}
      <div class="total-badge">{total} result{total > 1 ? 's' : ''}</div>
    {/if}
  </div>

  {#if !canReview()}
    <div class="perm-denied">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      <p>Admin or SuperAdmin access required.</p>
    </div>
  {:else}

    <!-- Individual action modal -->
    {#if actionId && actionType}
      <div class="modal-backdrop" role="presentation" onclick={closeAction}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="modal" onclick={(e) => e.stopPropagation()}>
          <h3 class="modal-title">{actionType === 'accept' ? 'Accept Scan Result' : 'Reject Scan Result'}</h3>

          {#if actionType === 'accept'}
            <p class="modal-sub">An asset record will be created from this scan data.</p>
            <div class="field-group">
              <label class="field-label">Category (optional)</label>
              <select class="field-select" bind:value={acceptCatId}>
                <option value="">— From scan hint —</option>
                {#each categories as c}<option value={c.id}>{c.name}</option>{/each}
              </select>
            </div>
            <div class="field-group">
              <label class="field-label">Branch <span class="required">*</span></label>
              <select class="field-select" bind:value={acceptBrId}>
                <option value="">— Select branch —</option>
                {#each branches as b}<option value={b.id}>{b.name}</option>{/each}
              </select>
            </div>
          {:else}
            <div class="field-group">
              <label class="field-label">Reason (optional)</label>
              <textarea class="field-textarea" bind:value={rejectReason} rows="3" placeholder="Explain why this scan is rejected…"></textarea>
            </div>
          {/if}

          {#if actionError}<div class="action-err">{actionError}</div>{/if}

          <div class="modal-actions">
            <button class="btn-ghost" onclick={closeAction} disabled={actionBusy}>Cancel</button>
            <button
              class="btn-primary"
              class:btn-reject={actionType === 'reject'}
              onclick={submitAction}
              disabled={actionBusy}>
              {#if actionBusy}<span class="spin"></span>{/if}
              {actionType === 'accept' ? 'Create Asset' : 'Reject'}
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Filters -->
    <div class="filter-bar">
      <div class="filter-group">
        <label class="filter-label">Status</label>
        <select class="filter-select" bind:value={filterStatus} onchange={applyFilters}>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">User</label>
        <select class="filter-select" bind:value={filterUser} onchange={applyFilters}>
          <option value="">All users</option>
          {#each users as u}<option value={u.id}>{u.name}</option>{/each}
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">From</label>
        <input type="date" class="filter-input" bind:value={filterFrom} onchange={applyFilters} />
      </div>
      <div class="filter-group">
        <label class="filter-label">To</label>
        <input type="date" class="filter-input" bind:value={filterTo} onchange={applyFilters} />
      </div>
      <button class="btn-ghost-sm" onclick={resetFilters}>Reset</button>
    </div>

    <!-- Feedback banners -->
    {#if actionDone}
      <div class="success-banner">{actionDone}</div>
    {/if}
    {#if bulkDone > 0}
      <div class="success-banner">{bulkDone} item{bulkDone > 1 ? 's' : ''} processed.</div>
    {/if}
    {#if bulkError}
      <div class="error-banner">{bulkError}</div>
    {/if}

    <!-- Bulk action bar -->
    {#if filterStatus === 'pending' && items.length > 0}
      <div class="bulk-bar">
        <div class="bulk-left">
          <input type="checkbox"
            checked={selected.size > 0 && selected.size === items.filter(i => i.status === 'pending').length}
            onchange={(e) => (e.currentTarget as HTMLInputElement).checked ? selectAll() : clearSel()} />
          <span class="bulk-count">
            {#if selected.size > 0}{selected.size} selected{:else}Select all{/if}
          </span>
        </div>
        {#if selected.size > 0}
          <div class="bulk-actions">
            <div class="field-group-inline">
              <select class="filter-select-sm" bind:value={acceptCatId}>
                <option value="">No category</option>
                {#each categories as c}<option value={c.id}>{c.name}</option>{/each}
              </select>
              <select class="filter-select-sm" bind:value={acceptBrId}>
                <option value="">Branch (required to accept)</option>
                {#each branches as b}<option value={b.id}>{b.name}</option>{/each}
              </select>
            </div>
            <button class="btn-primary-sm green" onclick={() => bulkAction('accept')} disabled={bulkBusy}>
              {#if bulkBusy}<span class="spin-sm"></span>{/if}
              Accept {selected.size}
            </button>
            <button class="btn-danger-sm" onclick={() => bulkAction('reject')} disabled={bulkBusy}>
              Reject {selected.size}
            </button>
            <button class="btn-ghost-sm" onclick={clearSel}>Clear</button>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Table -->
    {#if loading}
      <div class="loading-row">
        <span class="spin-dark"></span> Loading…
      </div>
    {:else if loadError}
      <div class="error-banner">{loadError}</div>
    {:else if items.length === 0}
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <p>No {filterStatus} scans found.</p>
      </div>
    {:else}
      <div class="table-wrap">
        <table class="review-table">
          <thead>
            <tr>
              {#if filterStatus === 'pending'}<th class="th-check"></th>{/if}
              <th>#</th>
              <th>Asset Name</th>
              <th>Serial / IMEI</th>
              <th>Brand · Model</th>
              <th>Scanned By</th>
              <th>Room</th>
              <th>Device</th>
              <th>Time</th>
              <th>Status</th>
              {#if filterStatus === 'pending'}<th>Actions</th>{/if}
              {#if filterStatus === 'rejected'}<th>Reason</th>{/if}
            </tr>
          </thead>
          <tbody>
            {#each items as item, i}
              <tr class="item-row" class:row-accepted={item.status === 'accepted'} class:row-rejected={item.status === 'rejected'}>
                {#if filterStatus === 'pending'}
                  <td class="td-check">
                    <input type="checkbox" checked={selected.has(item.id)} onchange={() => toggleSelect(item.id)} />
                  </td>
                {/if}
                <td class="td-num">{(page - 1) * 50 + i + 1}</td>
                <td class="td-name">
                  <button class="name-btn" onclick={() => expandedId = expandedId === item.id ? '' : item.id}>
                    {item.parsedData.assetName || '—'}
                  </button>
                  {#if expandedId === item.id}
                    <div class="raw-lines">
                      {#each (item.rawLines ?? []) as line}
                        <div class="raw-line">{line}</div>
                      {/each}
                      {#if !item.rawLines?.length}<div class="raw-line muted">No raw lines</div>{/if}
                    </div>
                  {/if}
                </td>
                <td class="td-serial mono">{item.parsedData.serialNumber || item.parsedData.imei1 || '—'}</td>
                <td class="td-model">{[item.parsedData.brand, item.parsedData.model].filter(Boolean).join(' ') || '—'}</td>
                <td class="td-owner">{item.owner.name}</td>
                <td class="td-room mono">{item.roomCode}</td>
                <td class="td-device">{item.deviceLabel}</td>
                <td class="td-time">{new Date(item.scannedAt).toLocaleString()}</td>
                <td class="td-status">
                  {#if item.status === 'pending'}
                    <span class="status-pill pending">Pending</span>
                  {:else if item.status === 'accepted'}
                    <a href="/assets/{item.assetId}" class="status-pill accepted">Saved</a>
                  {:else}
                    <span class="status-pill rejected">Rejected</span>
                  {/if}
                </td>
                {#if filterStatus === 'pending'}
                  <td class="td-actions">
                    <button class="act-accept" onclick={() => openAccept(item.id)}>Accept</button>
                    <button class="act-reject" onclick={() => openReject(item.id)}>Reject</button>
                  </td>
                {/if}
                {#if filterStatus === 'rejected'}
                  <td class="td-reason">{item.rejectReason || '—'}</td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      {#if pages > 1}
        <div class="pagination">
          <button class="page-btn" onclick={() => { page--; loadQueue(); }} disabled={page <= 1}>Previous</button>
          <span class="page-info">Page {page} of {pages}</span>
          <button class="page-btn" onclick={() => { page++; loadQueue(); }} disabled={page >= pages}>Next</button>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 20px; width: 100%; min-width: 0; }

  .page-head { display: flex; align-items: flex-start; justify-content: space-between; }
  .head-left { display: flex; align-items: flex-start; gap: 12px; }
  .back-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: var(--canvas); cursor: pointer; color: var(--mute); flex-shrink: 0; margin-top: 3px; transition: background 120ms; }
  .back-btn:hover { background: var(--canvas-soft-2); }
  .page-title { font-size: 22px; font-weight: 700; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.4px; line-height: 1.2; }
  .page-sub { font-size: 13px; color: var(--mute); font-family: var(--font-sans); margin-top: 2px; }
  .total-badge { background: var(--ink); color: var(--on-primary); border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 700; font-family: var(--font-sans); align-self: flex-start; margin-top: 4px; }

  .perm-denied { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 80px 20px; color: var(--mute); text-align: center; font-family: var(--font-sans); }

  /* ── Modal ── */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .modal { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 24px; width: 100%; max-width: 420px; box-shadow: var(--shadow-l3); display: flex; flex-direction: column; gap: 14px; }
  .modal-title { font-size: 16px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); margin: 0; }
  .modal-sub { font-size: 13px; color: var(--mute); font-family: var(--font-sans); margin: 0; }
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
  .action-err { background: var(--error-soft); color: var(--error); border-radius: var(--r-md); padding: 9px 12px; font-size: 13px; font-family: var(--font-sans); }
  .btn-reject { background: #dc2626; }

  /* ── Filters ── */
  .filter-bar { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 14px 16px; }
  .filter-group { display: flex; flex-direction: column; gap: 5px; }
  .filter-label { font-size: 11px; font-weight: 500; color: var(--mute); font-family: var(--font-sans); text-transform: uppercase; letter-spacing: .04em; }
  .filter-select, .filter-input { padding: 7px 10px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: var(--canvas-soft-2); color: var(--ink); font-size: 13px; font-family: var(--font-sans); outline: none; }
  .filter-select:focus, .filter-input:focus { border-color: var(--link); }

  /* ── Banners ── */
  .success-banner { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: var(--r-md); padding: 10px 14px; font-size: 13px; font-family: var(--font-sans); }
  .error-banner   { background: var(--error-soft); border: 1px solid color-mix(in oklch, var(--error) 30%, transparent); color: var(--error); border-radius: var(--r-md); padding: 10px 14px; font-size: 13px; font-family: var(--font-sans); }

  /* ── Bulk bar ── */
  .bulk-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 10px 16px; flex-wrap: wrap; }
  .bulk-left { display: flex; align-items: center; gap: 8px; }
  .bulk-count { font-size: 13px; color: var(--mute); font-family: var(--font-sans); }
  .bulk-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .field-group-inline { display: flex; gap: 8px; }
  .filter-select-sm { padding: 5px 8px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: var(--canvas-soft-2); color: var(--ink); font-size: 12px; font-family: var(--font-sans); outline: none; }

  /* ── Loading / empty ── */
  .loading-row { display: flex; align-items: center; gap: 10px; padding: 40px 20px; color: var(--mute); font-size: 14px; font-family: var(--font-sans); }
  .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 64px 24px; color: var(--mute); text-align: center; font-family: var(--font-sans); font-size: 14px; }

  /* ── Table ── */
  .table-wrap { overflow-x: auto; border: 1px solid var(--hairline); border-radius: var(--r-lg); }
  .review-table { width: 100%; border-collapse: collapse; font-family: var(--font-sans); font-size: 13px; }
  .review-table thead { background: var(--canvas-soft); }
  .review-table th { padding: 9px 12px; text-align: left; font-size: 11px; font-weight: 600; color: var(--mute); text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; border-bottom: 1px solid var(--hairline); }
  .th-check { width: 36px; }
  .review-table tbody tr { border-bottom: 1px solid var(--hairline); transition: background 100ms; }
  .review-table tbody tr:last-child { border-bottom: none; }
  .review-table tbody tr:hover { background: var(--canvas-soft); }
  .item-row td { padding: 10px 12px; color: var(--body); vertical-align: top; }
  .row-accepted { opacity: .7; }
  .row-rejected  { opacity: .55; }
  .td-check { width: 36px; vertical-align: middle !important; }
  .td-num { color: var(--mute); font-size: 12px; width: 32px; }
  .td-name { min-width: 140px; }
  .td-serial, .td-room { font-family: var(--font-mono); font-size: 12px; }
  .td-model, .td-owner, .td-device, .td-time { color: var(--mute); font-size: 12px; }
  .td-actions { white-space: nowrap; }
  .td-reason { font-size: 12px; color: var(--mute); max-width: 200px; }

  .name-btn { background: none; border: none; padding: 0; cursor: pointer; color: var(--ink); font-weight: 500; font-size: 13px; font-family: var(--font-sans); text-align: left; }
  .name-btn:hover { color: var(--link); }
  .raw-lines { margin-top: 6px; background: var(--canvas-soft); border: 1px solid var(--hairline); border-radius: var(--r-sm); padding: 8px; display: flex; flex-direction: column; gap: 2px; max-height: 120px; overflow-y: auto; }
  .raw-line { font-family: var(--font-mono); font-size: 11px; color: var(--mute); }
  .raw-line.muted { color: var(--hairline-strong); }

  .status-pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; text-decoration: none; white-space: nowrap; }
  .status-pill.pending  { background: #fffbeb; color: #92400e; border: 1px solid #fcd34d; }
  .status-pill.accepted { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
  .status-pill.rejected { background: var(--error-soft); color: var(--error); border: 1px solid color-mix(in oklch, var(--error) 30%, transparent); }

  .act-accept { padding: 4px 10px; background: #16a34a; color: #fff; border: none; border-radius: var(--r-sm); font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font-sans); transition: opacity 120ms; margin-right: 4px; }
  .act-accept:hover { opacity: .85; }
  .act-reject { padding: 4px 10px; background: var(--error-soft); color: var(--error); border: 1px solid color-mix(in oklch, var(--error) 30%, transparent); border-radius: var(--r-sm); font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font-sans); transition: background 120ms; }
  .act-reject:hover { background: color-mix(in oklch, var(--error) 15%, transparent); }

  /* ── Pagination ── */
  .pagination { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 8px 0; }
  .page-btn { padding: 7px 16px; border: 1px solid var(--hairline); background: var(--canvas); color: var(--body); border-radius: var(--r-md); font-size: 13px; font-family: var(--font-sans); cursor: pointer; transition: background 120ms; }
  .page-btn:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .page-btn:disabled { opacity: .4; cursor: not-allowed; }
  .page-info { font-size: 13px; color: var(--mute); font-family: var(--font-sans); }

  /* ── Form fields ── */
  .field-group { display: flex; flex-direction: column; gap: 5px; }
  .field-label { font-size: 12px; font-weight: 500; color: var(--body); font-family: var(--font-sans); }
  .required { color: var(--error); }
  .field-select, .field-textarea { padding: 8px 11px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: var(--canvas-soft-2); color: var(--ink); font-size: 13.5px; font-family: var(--font-sans); outline: none; width: 100%; transition: border-color 120ms; }
  .field-select:focus, .field-textarea:focus { border-color: var(--link); }
  .field-textarea { resize: vertical; min-height: 72px; }

  /* ── Buttons ── */
  .btn-primary { padding: 9px 20px; background: var(--ink); color: var(--on-primary); border: none; border-radius: var(--r-md); font-weight: 600; font-size: 13.5px; font-family: var(--font-sans); cursor: pointer; display: flex; align-items: center; gap: 8px; transition: opacity 120ms; }
  .btn-primary:hover:not(:disabled) { opacity: .85; }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .btn-primary-sm { padding: 6px 12px; background: var(--ink); color: var(--on-primary); border: none; border-radius: var(--r-md); font-size: 12px; font-weight: 600; font-family: var(--font-sans); cursor: pointer; display: flex; align-items: center; gap: 5px; transition: opacity 120ms; white-space: nowrap; }
  .btn-primary-sm:disabled { opacity: .5; cursor: not-allowed; }
  .btn-primary-sm.green { background: #16a34a; }
  .btn-danger-sm { padding: 6px 12px; background: #dc2626; color: #fff; border: none; border-radius: var(--r-md); font-size: 12px; font-weight: 600; font-family: var(--font-sans); cursor: pointer; display: flex; align-items: center; gap: 5px; white-space: nowrap; transition: opacity 120ms; }
  .btn-danger-sm:disabled { opacity: .5; cursor: not-allowed; }
  .btn-ghost { background: transparent; border: none; color: var(--mute); cursor: pointer; font-size: 13px; font-family: var(--font-sans); padding: 6px 0; transition: color 120ms; }
  .btn-ghost:hover { color: var(--body); }
  .btn-ghost-sm { background: transparent; border: none; color: var(--mute); cursor: pointer; font-size: 12px; font-family: var(--font-sans); padding: 4px 0; white-space: nowrap; }
  .btn-ghost-sm:hover { color: var(--body); }

  /* ── Spinners ── */
  .spin { display: inline-block; width: 13px; height: 13px; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  .spin-sm { display: inline-block; width: 11px; height: 11px; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  .spin-dark { display: inline-block; width: 13px; height: 13px; border: 2px solid var(--hairline); border-top-color: var(--mute); border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 900px) { .filter-bar { gap: 8px; } .bulk-bar { flex-direction: column; align-items: flex-start; } }
</style>
