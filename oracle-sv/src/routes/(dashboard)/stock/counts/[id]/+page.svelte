<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';
  import { onChange } from '$lib/ws';

  interface CountSession {
    id: string; locationId: string; status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
    startedById: string; approvedById: string | null; expectedUpdatedAt: string;
    lines?: CountLine[];
  }
  interface CountLine { id: string; stockItemId: string; expectedQuantitySnapshot: number; countedQuantity: number; variance: number; }
  interface StockItem { id: string; sku: string; name: string; unitOfMeasure: string; }

  const sessionId = $derived($page.params.id);

  let session = $state<CountSession | null>(null);
  let lines = $state<CountLine[]>([]);
  let items = $state<StockItem[]>([]);
  let loading = $state(true);
  let loadError = $state('');
  let announce = $state('');

  // Draft line-entry state
  let newItemId = $state('');
  let newCounted = $state('');
  let lineSaving = $state(false);
  let lineError = $state('');

  // Submit / approve state
  let actionBusy = $state(false);
  let actionError = $state('');
  let approveReason = $state('');

  onMount(load);
  onDestroy(onChange(['StockCountSession'], () => load()));

  async function load() {
    loading = true; loadError = '';
    try {
      const [itemsRes, sessionRes] = await Promise.all([
        api.get<{ items: StockItem[] }>('/api/stock/items?pageSize=100'),
        api.get<CountSession>(`/api/stock/count-sessions/${sessionId}`),
      ]);
      items = itemsRes.items;
      session = sessionRes;
      lines = sessionRes.lines ?? [];
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to load count session.';
      loadError = message === 'Tools and stock is disabled.'
        ? 'Tools & Stock is prepared but is not enabled for this environment yet.'
        : message;
    } finally {
      loading = false;
    }
  }

  function itemName(id: string) {
    const item = items.find((i) => i.id === id);
    return item ? `${item.sku} — ${item.name}` : id.slice(0, 8);
  }

  async function addLine(e: Event) {
    e.preventDefault();
    if (!session) return;
    const countedQuantity = Number(newCounted);
    if (!newItemId || !Number.isFinite(countedQuantity) || countedQuantity < 0) {
      lineError = 'Choose an item and enter a nonnegative counted quantity.'; return;
    }
    lineSaving = true; lineError = '';
    try {
      const line = await api.post<CountLine>(`/api/stock/count-sessions/${session.id}/lines`, { stockItemId: newItemId, countedQuantity });
      lines = [...lines.filter((l) => l.stockItemId !== line.stockItemId), line];
      announce = `Line saved for ${itemName(newItemId)}.`;
      newItemId = ''; newCounted = '';
    } catch (caught) {
      lineError = caught instanceof Error ? caught.message : 'Unable to save count line.';
    } finally {
      lineSaving = false;
    }
  }

  async function submitCount() {
    if (!session) return;
    actionBusy = true; actionError = '';
    try {
      const updated = await api.post<CountSession>(`/api/stock/count-sessions/${session.id}/submit`, { expectedUpdatedAt: session.expectedUpdatedAt });
      session = updated;
      announce = 'Count submitted for approval.';
    } catch (caught) {
      actionError = caught instanceof Error ? caught.message : 'Unable to submit count.';
    } finally {
      actionBusy = false;
    }
  }

  async function approveCount(e: Event) {
    e.preventDefault();
    if (!session) return;
    if (!approveReason.trim()) { actionError = 'A reason is required to approve variance.'; return; }
    actionBusy = true; actionError = '';
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `approve-${Date.now()}-${Math.random()}`;
      const updated = await api.post<CountSession>(`/api/stock/count-sessions/${session.id}/approve`, {
        expectedUpdatedAt: session.expectedUpdatedAt, reason: approveReason.trim(),
      }, { 'Idempotency-Key': idempotencyKey });
      session = updated;
      announce = 'Count approved and reconciled.';
    } catch (caught) {
      actionError = caught instanceof Error ? caught.message : 'Unable to approve count.';
    } finally {
      actionBusy = false;
    }
  }

  function fmt(n: number) { return new Intl.NumberFormat('en-PH').format(n); }
</script>

<svelte:head><title>Stock count {sessionId} | Oracle Inventory</title></svelte:head>

<div class="page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/stock')}>Tools &amp; Stock</button>
    <span class="crumb-sep">/</span>
    <span class="crumb-current">Count {(sessionId ?? '').slice(0, 8)}</span>
  </nav>

  <div class="sr-only" role="status" aria-live="polite">{announce}</div>

  {#if loading}
    <p class="state">Loading count session…</p>
  {:else if loadError}
    <section class="notice" role="status"><h2>Not available</h2><p>{loadError}</p></section>
  {:else if !session}
    <section class="notice"><h2>No active session</h2><p>Start a count from a stock location to begin a draft.</p></section>
  {:else}
    <header class="page-header">
      <div>
        <h1>Stock count</h1>
        <p class="intro">Location: {session.locationId.slice(0, 8)} · Status:
          <span class="status" class:status-draft={session.status === 'draft'} class:status-submitted={session.status === 'submitted'} class:status-approved={session.status === 'approved'}>
            {session.status}
          </span>
        </p>
      </div>
    </header>

    {#if session.status === 'draft' && can('manage_stock')}
      <section class="table-card">
        <h2>Draft lines</h2>
        <form onsubmit={addLine} class="line-form">
          <div class="field">
            <label class="field-label" for="c-item">Item</label>
            <select id="c-item" class="field-input" bind:value={newItemId} required>
              <option value="" disabled>Select item…</option>
              {#each items as it (it.id)}<option value={it.id}>{it.sku} — {it.name}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="c-qty">Counted quantity</label>
            <input id="c-qty" class="field-input" type="number" inputmode="decimal" min="0" step="any" bind:value={newCounted} required />
          </div>
          <div class="field line-actions">
            <button type="submit" class="btn-primary" disabled={lineSaving}>{lineSaving ? 'Saving…' : 'Add / update line'}</button>
          </div>
        </form>
        {#if lineError}<p class="form-err" role="alert">{lineError}</p>{/if}
      </section>
    {/if}

    <section class="table-card" aria-labelledby="lines-title">
      <h2 id="lines-title">Count lines and variance</h2>
      {#if lines.length === 0}
        <p class="state">No lines recorded yet.</p>
      {:else}
        <table>
          <thead><tr><th scope="col">Item</th><th scope="col">Expected</th><th scope="col">Counted</th><th scope="col">Variance</th></tr></thead>
          <tbody>
            {#each lines as line (line.id)}
              <tr>
                <td>{itemName(line.stockItemId)}</td>
                <td>{fmt(line.expectedQuantitySnapshot)}</td>
                <td>{fmt(line.countedQuantity)}</td>
                <td class:positive={line.variance > 0} class:negative={line.variance < 0}>
                  {line.variance > 0 ? '+' : ''}{fmt(line.variance)}
                  {#if line.variance !== 0}<span class="sr-only">, requires reconciliation</span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    {#if session.status === 'draft' && can('manage_stock')}
      <div class="actions-row">
        <button class="btn-primary" onclick={submitCount} disabled={actionBusy}>{actionBusy ? 'Submitting…' : 'Submit for approval'}</button>
      </div>
    {:else if session.status === 'submitted' && can('approve_stock_adjustments')}
      <section class="table-card">
        <h2>Approve variance</h2>
        <form onsubmit={approveCount} class="line-form">
          <div class="field field-wide">
            <label class="field-label" for="c-reason">Approval reason</label>
            <input id="c-reason" class="field-input" type="text" bind:value={approveReason} required />
          </div>
          <div class="field line-actions">
            <button type="submit" class="btn-primary" disabled={actionBusy}>{actionBusy ? 'Approving…' : 'Approve and reconcile'}</button>
          </div>
        </form>
      </section>
    {:else if session.status === 'approved'}
      <section class="notice">
        <h2><span aria-hidden="true">&#10003;</span> Reconciled</h2>
        <p>Variance was approved and compensating adjustment movements were created for every non-zero line.</p>
      </section>
    {/if}

    {#if actionError}<p class="form-err" role="alert">{actionError}</p>{/if}
  {/if}
</div>

<style>
  .page { max-width: 1180px; margin: 0 auto; padding: 32px 24px 48px; display: flex; flex-direction: column; gap: 20px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  .breadcrumb { display: flex; align-items: center; gap: 6px; }
  .crumb-link { background: none; border: none; padding: 0; font-size: 12.5px; color: var(--mute); cursor: pointer; }
  .crumb-link:hover { color: var(--body); }
  .crumb-sep { color: var(--hairline-strong); }
  .crumb-current { font-size: 12.5px; color: var(--body); }
  .page-header h1 { margin: 0; color: var(--ink); font-size: clamp(24px, 4vw, 32px); letter-spacing: -.04em; }
  .intro { max-width: 650px; margin: 8px 0 0; color: var(--body); }
  .status { font-weight: 700; text-transform: uppercase; font-size: 12px; letter-spacing: .04em; }
  .status-draft { color: var(--mute); }
  .status-submitted { color: #b45309; }
  .status-approved { color: #16a34a; }
  .notice, .table-card { border: 1px solid var(--hairline); border-radius: 12px; background: var(--canvas); padding: 22px; }
  .notice h2, .table-card h2 { margin: 0 0 8px; font-size: 16px; color: var(--ink); }
  .state { color: var(--mute); }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; text-align: left; }
  th, td { padding: 10px 12px; border-top: 1px solid var(--hairline); font-size: 13.5px; }
  th { color: var(--mute); font-weight: 600; }
  .positive { color: #16a34a; }
  .negative { color: #dc2626; }
  .line-form { display: grid; grid-template-columns: 2fr 1fr auto; gap: 12px; align-items: end; margin-top: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-wide { grid-column: 1 / -1; }
  .field-label { font-size: 12.5px; font-weight: 500; color: var(--body); }
  .field-input { height: 34px; padding: 0 10px; border: 1px solid var(--hairline); border-radius: var(--r-sm); background: var(--canvas); color: var(--ink); font-size: 13.5px; outline: none; }
  .field-input:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }
  .btn-primary { border: none; border-radius: var(--r-md); background: var(--ink); color: var(--on-primary); padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; height: 34px; }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .actions-row { display: flex; justify-content: flex-end; }
  .form-err { font-size: 12.5px; color: var(--error); background: var(--error-soft); border-radius: var(--r-sm); padding: 8px 12px; }
  @media (max-width: 640px) { .page { padding: 24px 16px; } .line-form { grid-template-columns: 1fr; } .table-card { overflow-x: auto; } }
</style>
