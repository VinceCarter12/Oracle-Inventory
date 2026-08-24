<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';

  interface StockLocation { id: string; name: string; branchId: string; locationType: string; }
  interface StockPolicy { id: string; stockItemId: string; locationId: string; minimumQuantity: number; reorderQuantity: number; updatedAt: string; location: StockLocation; }
  interface StockItem { id: string; sku: string; name: string; category: string; unitOfMeasure: string; description: string | null; isSerialized: boolean; active: boolean; archivedAt: string | null; policies: StockPolicy[]; }
  interface LedgerEntry {
    id: string; quantityDelta: number; createdAt: string; locationId: string;
    location?: { id: string; name: string };
    movement: { id: string; movementType: string; quantity: number; reason: string | null; performedById: string; createdAt: string };
  }

  const itemId = $derived($page.params.id);

  let item = $state<StockItem | null>(null);
  let entries = $state<LedgerEntry[]>([]);
  let loading = $state(true);
  let error = $state('');
  let announce = $state('');

  // Per-location derived balances, computed client-side purely from ledger entries
  // (there is no separate mutable balance column to trust).
  const balancesByLocation = $derived.by(() => {
    const map = new Map<string, { locationId: string; name: string; balance: number }>();
    for (const entry of entries) {
      const key = entry.locationId;
      const name = entry.location?.name ?? key.slice(0, 8);
      const current = map.get(key) ?? { locationId: key, name, balance: 0 };
      current.balance += Number(entry.quantityDelta);
      map.set(key, current);
    }
    return Array.from(map.values());
  });

  let editingPolicy = $state<StockPolicy | null>(null);
  let policyForm = $state({ minimumQuantity: '', reorderQuantity: '' });
  let policySaving = $state(false);
  let policyError = $state('');

  onMount(load);

  async function load() {
    loading = true; error = '';
    try {
      const [itemRes, movementsRes] = await Promise.all([
        api.get<StockItem>(`/api/stock/items/${itemId}`),
        api.get<{ items: LedgerEntry[] }>(`/api/stock/items/${itemId}/movements`),
      ]);
      item = itemRes;
      entries = movementsRes.items;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to load stock item.';
      error = message === 'Tools and stock is disabled.'
        ? 'Tools & Stock is prepared but is not enabled for this environment yet.'
        : message;
    } finally {
      loading = false;
    }
  }

  function openPolicy(policy: StockPolicy) {
    editingPolicy = policy;
    policyForm = { minimumQuantity: String(policy.minimumQuantity), reorderQuantity: String(policy.reorderQuantity) };
    policyError = '';
  }

  function closePolicy() {
    editingPolicy = null;
    policyError = '';
  }

  async function savePolicy(e: Event) {
    e.preventDefault();
    if (!editingPolicy) return;
    const minimumQuantity = Number(policyForm.minimumQuantity);
    const reorderQuantity = Number(policyForm.reorderQuantity);
    if (!Number.isFinite(minimumQuantity) || !Number.isFinite(reorderQuantity) || minimumQuantity < 0 || reorderQuantity < minimumQuantity) {
      policyError = 'Reorder quantity must be a valid number at or above the minimum.';
      return;
    }
    policySaving = true; policyError = '';
    try {
      const updated = await api.put<StockPolicy>(`/api/stock/policies/${editingPolicy.id}`, {
        minimumQuantity, reorderQuantity, expectedUpdatedAt: editingPolicy.updatedAt,
      });
      if (item) item.policies = item.policies.map((p) => (p.id === updated.id ? { ...p, ...updated, location: p.location } : p));
      announce = `Threshold saved for ${editingPolicy.location.name}.`;
      closePolicy();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to save threshold.';
      policyError = message === 'Policy changed since it was loaded.'
        ? 'This threshold changed elsewhere. Reload the page and try again.'
        : message;
    } finally {
      policySaving = false;
    }
  }

  function isLow(policy: StockPolicy): boolean {
    const bal = balancesByLocation.find((b) => b.locationId === policy.locationId)?.balance ?? 0;
    return bal <= Number(policy.minimumQuantity);
  }

  function fmt(n: number) { return new Intl.NumberFormat('en-PH').format(n); }
</script>

<svelte:head><title>{item ? item.name : 'Stock item'} | Oracle Inventory</title></svelte:head>

<div class="page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/stock')}>Tools &amp; Stock</button>
    <span class="crumb-sep">/</span>
    <span class="crumb-current">{loading ? '…' : (item?.name ?? 'Not found')}</span>
  </nav>

  <div class="sr-only" role="status" aria-live="polite">{announce}</div>

  {#if loading}
    <p class="state">Loading stock item…</p>
  {:else if error}
    <section class="notice" role="status">
      <h2>Not available</h2>
      <p>{error}</p>
    </section>
  {:else if !item}
    <section class="notice"><h2>Not found</h2><p>This stock item does not exist or was removed.</p></section>
  {:else}
    <header class="page-header">
      <div>
        <p class="eyebrow">{item.sku}</p>
        <h1>{item.name}</h1>
        <p class="intro">{item.category} · unit: {item.unitOfMeasure}{item.description ? ` · ${item.description}` : ''}</p>
      </div>
      <span class="badge" class:badge-red={!item.active || item.archivedAt}>
        {item.active && !item.archivedAt ? 'Active' : 'Archived'}
      </span>
    </header>

    <section class="table-card" aria-labelledby="balances-title">
      <h2 id="balances-title">Balances by location</h2>
      {#if balancesByLocation.length === 0}
        <p class="state">No movements recorded for this item yet.</p>
      {:else}
        <table>
          <thead><tr><th scope="col">Location</th><th scope="col">On hand</th></tr></thead>
          <tbody>
            {#each balancesByLocation as bal (bal.locationId)}
              <tr><td>{bal.name}</td><td>{fmt(bal.balance)} {item.unitOfMeasure}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    {#if item.policies.length > 0}
      <section class="table-card" aria-labelledby="thresholds-title">
        <h2 id="thresholds-title">Thresholds</h2>
        <table>
          <thead><tr><th scope="col">Location</th><th scope="col">Minimum</th><th scope="col">Reorder</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {#each item.policies as policy (policy.id)}
              <tr>
                <td>{policy.location.name}</td>
                <td>{fmt(policy.minimumQuantity)}</td>
                <td>{fmt(policy.reorderQuantity)}</td>
                <td>
                  {#if isLow(policy)}
                    <span class="status status-low"><span aria-hidden="true">&#9888;</span> Low stock</span>
                  {:else}
                    <span class="status status-ok"><span aria-hidden="true">&#10003;</span> OK</span>
                  {/if}
                </td>
                <td>
                  {#if can('manage_stock')}
                    <button class="btn-ghost btn-sm" onclick={() => openPolicy(policy)}>Edit threshold</button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}

    <section class="table-card" aria-labelledby="history-title">
      <h2 id="history-title">Movement history</h2>
      {#if entries.length === 0}
        <p class="state">No movements yet.</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th><th scope="col">Type</th><th scope="col">Location</th>
              <th scope="col">Quantity delta</th><th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {#each entries as entry (entry.id)}
              <tr>
                <td>{new Date(entry.createdAt).toLocaleString('en-PH')}</td>
                <td>{entry.movement.movementType}</td>
                <td>{entry.location?.name ?? entry.locationId.slice(0, 8)}</td>
                <td class:positive={entry.quantityDelta > 0} class:negative={entry.quantityDelta < 0}>
                  {entry.quantityDelta > 0 ? '+' : ''}{fmt(Number(entry.quantityDelta))} {item.unitOfMeasure}
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

{#if editingPolicy}
<div class="modal-backdrop" onclick={closePolicy}>
  <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="policy-modal-title">
    <div class="modal-header">
      <span class="modal-title" id="policy-modal-title">Edit threshold — {editingPolicy.location.name}</span>
      <button class="modal-close" onclick={closePolicy} aria-label="Close">✕</button>
    </div>
    <form onsubmit={savePolicy} class="modal-body">
      {#if policyError}<div class="form-err" role="alert">{policyError}</div>{/if}
      <div class="field">
        <label class="field-label" for="policy-min">Minimum quantity</label>
        <input id="policy-min" class="field-input" type="number" inputmode="decimal" min="0" step="any" bind:value={policyForm.minimumQuantity} required />
      </div>
      <div class="field">
        <label class="field-label" for="policy-reorder">Reorder quantity</label>
        <input id="policy-reorder" class="field-input" type="number" inputmode="decimal" min="0" step="any" bind:value={policyForm.reorderQuantity} required />
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" onclick={closePolicy}>Cancel</button>
        <button type="submit" class="btn-primary" disabled={policySaving}>{policySaving ? 'Saving…' : 'Save threshold'}</button>
      </div>
    </form>
  </div>
</div>
{/if}

<style>
  .page { max-width: 1180px; margin: 0 auto; padding: 32px 24px 48px; display: flex; flex-direction: column; gap: 20px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  .breadcrumb { display: flex; align-items: center; gap: 6px; }
  .crumb-link { background: none; border: none; padding: 0; font-size: 12.5px; color: var(--mute); cursor: pointer; }
  .crumb-link:hover { color: var(--body); }
  .crumb-sep { color: var(--hairline-strong); }
  .crumb-current { font-size: 12.5px; color: var(--body); }
  .page-header { display: flex; gap: 24px; align-items: flex-start; justify-content: space-between; }
  .eyebrow { margin: 0 0 5px; color: var(--mute); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  h1 { margin: 0; color: var(--ink); font-size: clamp(24px, 4vw, 32px); letter-spacing: -.04em; }
  .intro { max-width: 650px; margin: 8px 0 0; color: var(--body); }
  .badge { border-radius: var(--r-pill); padding: 4px 10px; font-size: 12px; font-weight: 600; background: #dcfce7; color: #16a34a; height: fit-content; }
  .badge-red { background: #fee2e2; color: #dc2626; }
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
  .btn-ghost { border: 1px solid var(--hairline); border-radius: var(--r-md); background: var(--canvas); color: var(--ink); padding: 6px 10px; font-size: 12.5px; cursor: pointer; }
  .btn-ghost:hover { background: var(--canvas-soft-2); }
  .btn-sm { padding: 4px 8px; font-size: 12px; }
  .btn-primary { border: none; border-radius: var(--r-md); background: var(--ink); color: var(--on-primary); padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .modal-backdrop { position: fixed; inset: 0; background: oklch(0% 0 0 / 40%); z-index: 100; display: flex; align-items: center; justify-content: center; }
  .modal { background: var(--canvas); border-radius: var(--r-lg); width: 100%; max-width: 380px; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 12px; border-bottom: 1px solid var(--hairline); }
  .modal-title { font-size: 14px; font-weight: 600; color: var(--ink); }
  .modal-close { background: none; border: none; cursor: pointer; color: var(--mute); }
  .modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-label { font-size: 12.5px; font-weight: 500; color: var(--body); }
  .field-input { height: 34px; padding: 0 10px; border: 1px solid var(--hairline); border-radius: var(--r-sm); background: var(--canvas); color: var(--ink); font-size: 13.5px; outline: none; }
  .field-input:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }
  .form-err { font-size: 12.5px; color: var(--error); background: var(--error-soft); border-radius: var(--r-sm); padding: 8px 12px; }
  @media (max-width: 640px) { .page { padding: 24px 16px; } .table-card { overflow-x: auto; } }
</style>
