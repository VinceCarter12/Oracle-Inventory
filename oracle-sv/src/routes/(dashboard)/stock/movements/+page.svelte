<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';

  interface StockItem { id: string; sku: string; name: string; unitOfMeasure: string; balance: number; }
  interface StockLocation { id: string; name: string; branchId: string; }
  interface LedgerEntry {
    id: string; quantityDelta: number; createdAt: string; locationId: string;
    location?: { id: string; name: string };
    movement: { id: string; movementType: string; quantity: number; reason: string | null; createdAt: string };
  }

  let items = $state<StockItem[]>([]);
  let locations = $state<StockLocation[]>([]);
  let loading = $state(true);
  let loadError = $state('');

  let selectedItemId = $state('');
  let typeFilter = $state('all');
  let entries = $state<LedgerEntry[]>([]);
  let historyLoading = $state(false);
  let historyError = $state('');

  const filteredEntries = $derived(
    typeFilter === 'all' ? entries : entries.filter((e) => e.movement.movementType === typeFilter)
  );

  const movementTypes = ['receive', 'issue', 'transfer', 'adjustment', 'count_correction', 'consume', 'return', 'opening'];

  // Transfer form / request lifecycle states: 'idle' | 'pending' | 'complete' | 'failed'.
  let transferState = $state<'idle' | 'pending' | 'complete' | 'failed'>('idle');
  let transferError = $state('');
  let transferForm = $state({ stockItemId: '', sourceLocationId: '', destinationLocationId: '', quantity: '', reason: '' });
  let announce = $state('');

  onMount(async () => {
    try {
      const [itemsRes, locationsRes] = await Promise.all([
        api.get<{ items: StockItem[] }>('/api/stock/items?pageSize=100'),
        api.get<{ items: StockLocation[] }>('/api/stock/locations'),
      ]);
      items = itemsRes.items;
      locations = locationsRes.items;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to load stock data.';
      loadError = message === 'Tools and stock is disabled.'
        ? 'Tools & Stock is prepared but is not enabled for this environment yet.'
        : message;
    } finally {
      loading = false;
    }
  });

  async function loadHistory() {
    if (!selectedItemId) { entries = []; return; }
    historyLoading = true; historyError = '';
    try {
      const res = await api.get<{ items: LedgerEntry[] }>(`/api/stock/items/${selectedItemId}/movements`);
      entries = res.items;
    } catch (caught) {
      historyError = caught instanceof Error ? caught.message : 'Unable to load movement history.';
      entries = [];
    } finally {
      historyLoading = false;
    }
  }

  function fmt(n: number) { return new Intl.NumberFormat('en-PH').format(n); }

  async function submitTransfer(e: Event) {
    e.preventDefault();
    const quantity = Number(transferForm.quantity);
    if (!transferForm.stockItemId || !transferForm.sourceLocationId || !transferForm.destinationLocationId) {
      transferState = 'failed'; transferError = 'Item, source, and destination are required.'; return;
    }
    if (transferForm.sourceLocationId === transferForm.destinationLocationId) {
      transferState = 'failed'; transferError = 'Source and destination must be different locations.'; return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      transferState = 'failed'; transferError = 'Quantity must be a positive number.'; return;
    }
    transferState = 'pending'; transferError = ''; announce = 'Submitting transfer…';
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `transfer-${Date.now()}-${Math.random()}`;
      await api.post('/api/stock/movements/transfer', {
        stockItemId: transferForm.stockItemId,
        sourceLocationId: transferForm.sourceLocationId,
        destinationLocationId: transferForm.destinationLocationId,
        quantity,
        reason: transferForm.reason.trim() || undefined,
      }, { 'Idempotency-Key': idempotencyKey });
      transferState = 'complete';
      announce = 'Transfer complete.';
      transferForm = { stockItemId: '', sourceLocationId: '', destinationLocationId: '', quantity: '', reason: '' };
      if (selectedItemId) await loadHistory();
    } catch (caught) {
      transferState = 'failed';
      transferError = caught instanceof Error ? caught.message : 'Transfer failed.';
      announce = 'Transfer failed.';
    }
  }
</script>

<svelte:head><title>Stock movements | Oracle Inventory</title></svelte:head>

<div class="page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/stock')}>Tools &amp; Stock</button>
    <span class="crumb-sep">/</span>
    <span class="crumb-current">Movements</span>
  </nav>

  <header class="page-header">
    <div>
      <h1>Movement workspace</h1>
      <p class="intro">Review the immutable movement ledger and record transfers between locations.</p>
    </div>
  </header>

  <div class="sr-only" role="status" aria-live="polite">{announce}</div>

  {#if loading}
    <p class="state">Loading…</p>
  {:else if loadError}
    <section class="notice" role="status"><h2>Not available</h2><p>{loadError}</p></section>
  {:else}
    {#if can('manage_stock')}
      <section class="table-card">
        <h2>Record a transfer</h2>
        <form onsubmit={submitTransfer} class="transfer-form">
          <div class="field">
            <label class="field-label" for="t-item">Item</label>
            <select id="t-item" class="field-input" bind:value={transferForm.stockItemId} required>
              <option value="" disabled>Select item…</option>
              {#each items as it (it.id)}<option value={it.id}>{it.sku} — {it.name}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="t-source">Source location</label>
            <select id="t-source" class="field-input" bind:value={transferForm.sourceLocationId} required>
              <option value="" disabled>Select source…</option>
              {#each locations as loc (loc.id)}<option value={loc.id}>{loc.name}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="t-dest">Destination location</label>
            <select id="t-dest" class="field-input" bind:value={transferForm.destinationLocationId} required>
              <option value="" disabled>Select destination…</option>
              {#each locations as loc (loc.id)}<option value={loc.id}>{loc.name}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="t-qty">Quantity</label>
            <input id="t-qty" class="field-input" type="number" inputmode="decimal" min="0" step="any" bind:value={transferForm.quantity} required />
          </div>
          <div class="field field-wide">
            <label class="field-label" for="t-reason">Reason (optional)</label>
            <input id="t-reason" class="field-input" type="text" bind:value={transferForm.reason} />
          </div>
          <div class="field field-wide transfer-actions">
            <button type="submit" class="btn-primary" disabled={transferState === 'pending'}>
              {transferState === 'pending' ? 'Submitting…' : 'Submit transfer'}
            </button>
            {#if transferState === 'complete'}
              <span class="status status-ok"><span aria-hidden="true">&#10003;</span> Transfer complete</span>
            {:else if transferState === 'failed'}
              <span class="status status-low" role="alert"><span aria-hidden="true">&#9888;</span> {transferError}</span>
            {/if}
          </div>
        </form>
      </section>
    {/if}

    <section class="table-card" aria-labelledby="history-title">
      <h2 id="history-title">Immutable audit history</h2>
      <div class="filters">
        <div class="field">
          <label class="field-label" for="h-item">Item</label>
          <select id="h-item" class="field-input" bind:value={selectedItemId} onchange={loadHistory}>
            <option value="">Select an item to view history…</option>
            {#each items as it (it.id)}<option value={it.id}>{it.sku} — {it.name}</option>{/each}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="h-type">Movement type</label>
          <select id="h-type" class="field-input" bind:value={typeFilter}>
            <option value="all">All types</option>
            {#each movementTypes as t}<option value={t}>{t}</option>{/each}
          </select>
        </div>
      </div>

      {#if !selectedItemId}
        <p class="state">Choose an item above to see its movement history.</p>
      {:else if historyLoading}
        <p class="state">Loading history…</p>
      {:else if historyError}
        <p class="state" role="alert">{historyError}</p>
      {:else if filteredEntries.length === 0}
        <p class="state">No movements match this filter.</p>
      {:else}
        <table>
          <thead>
            <tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Location</th><th scope="col">Quantity delta</th><th scope="col">Reason</th></tr>
          </thead>
          <tbody>
            {#each filteredEntries as entry (entry.id)}
              <tr>
                <td>{new Date(entry.createdAt).toLocaleString('en-PH')}</td>
                <td>{entry.movement.movementType}</td>
                <td>{entry.location?.name ?? entry.locationId.slice(0, 8)}</td>
                <td class:positive={entry.quantityDelta > 0} class:negative={entry.quantityDelta < 0}>
                  {entry.quantityDelta > 0 ? '+' : ''}{fmt(Number(entry.quantityDelta))}
                </td>
                <td>{entry.movement.reason ?? '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
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
  .notice, .table-card { border: 1px solid var(--hairline); border-radius: 12px; background: var(--canvas); padding: 22px; }
  .notice h2, .table-card h2 { margin: 0 0 8px; font-size: 16px; color: var(--ink); }
  .state { color: var(--mute); }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; text-align: left; }
  th, td { padding: 10px 12px; border-top: 1px solid var(--hairline); font-size: 13.5px; }
  th { color: var(--mute); font-weight: 600; }
  .positive { color: #16a34a; }
  .negative { color: #dc2626; }
  .status { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; }
  .status-low { color: #b45309; }
  .status-ok { color: #16a34a; }
  .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 6px; max-width: 640px; }
  .transfer-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-wide { grid-column: 1 / -1; }
  .transfer-actions { display: flex; align-items: center; gap: 12px; }
  .field-label { font-size: 12.5px; font-weight: 500; color: var(--body); }
  .field-input { height: 34px; padding: 0 10px; border: 1px solid var(--hairline); border-radius: var(--r-sm); background: var(--canvas); color: var(--ink); font-size: 13.5px; outline: none; }
  .field-input:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }
  .btn-primary { border: none; border-radius: var(--r-md); background: var(--ink); color: var(--on-primary); padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  @media (max-width: 640px) { .page { padding: 24px 16px; } .transfer-form, .filters { grid-template-columns: 1fr; } .table-card { overflow-x: auto; } }
</style>
