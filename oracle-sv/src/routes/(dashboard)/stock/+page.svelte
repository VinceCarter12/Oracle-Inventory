<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';
  import { onChange } from '$lib/ws';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import TableStates from '$lib/components/TableStates.svelte';

  type StockItem = { id: string; sku: string; name: string; category: string; unitOfMeasure: string; balance: number };

  let items      = $state<StockItem[]>([]);
  let loading    = $state(true);
  let error      = $state('');
  let disabled   = $state(false);
  let forbidden  = $state(false);

  const totalOnHand   = $derived(items.reduce((sum, i) => sum + i.balance, 0));
  const totalCategories = $derived(new Set(items.map(i => i.category)).size);

  async function load() {
    loading = true; error = ''; disabled = false; forbidden = false;
    if (!can('view_stock')) {
      forbidden = true;
      loading = false;
      return;
    }
    try {
      items = (await api.get<{ items: StockItem[] }>('/api/stock/items')).items;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to load stock.';
      if (message === 'Tools and stock is disabled.') {
        disabled = true;
      } else {
        error = message;
      }
    } finally {
      loading = false;
    }
  }

  load();
  onDestroy(onChange(['StockMovement', 'StockCountSession'], () => load()));
</script>

<svelte:head>
  <title>Tools & Stock | Oracle Inventory</title>
</svelte:head>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Tools & Stock' }]} />

  <div class="page-header">
    <div>
      <h1 class="page-title">Tools & Stock</h1>
      <p class="page-sub">Quantity-managed tools, consumables, locations, and count controls.</p>
    </div>
    {#if can('manage_stock')}
      <button class="btn-primary" onclick={() => goto('/inventory/intake/tools-stock')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Record opening stock
      </button>
    {/if}
  </div>

  <div class="stats-row">
    <StatCard value={loading ? '—' : items.length} label="Stock Items" helper="Distinct SKUs tracked" />
    <StatCard value={loading ? '—' : totalOnHand} label="Units On Hand" helper="Summed across all items" />
    <StatCard value={loading ? '—' : totalCategories} label="Categories" helper="In use across stock" />
  </div>

  <div class="card table-card">
    {#if forbidden}
      <TableStates error="You do not have permission to view tools and stock." />
    {:else if disabled}
      <TableStates error="Tools & Stock is prepared but is not enabled for this environment yet. No stock records are shown or changed while the rollout is disabled." />
    {:else}
      <TableStates
        loading={loading}
        error={error}
        empty={!loading && !error && items.length === 0}
        loadingText="Loading stock…"
        emptyTitle="No stock items yet"
        emptyMessage="Record opening stock to start tracking quantity-managed tools and consumables."
        onRetry={load}
      />
      {#if !loading && !error && items.length > 0}
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>SKU</th><th>Item</th><th>Category</th><th>On hand</th></tr>
            </thead>
            <tbody>
              {#each items as item (item.id)}
                <tr>
                  <td>{item.sku}</td>
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td>{item.balance} {item.unitOfMeasure}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; height: calc(100vh - 64px); min-height: 0; }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-title  { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub    { font-size: 13px; color: var(--mute); margin-top: 3px; }

  .btn-primary {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: none;
    background: var(--ink); color: var(--on-primary);
    transition: opacity 120ms ease; line-height: 1;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }

  .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }

  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); }
  .table-card { overflow: hidden; display: flex; flex-direction: column; flex: 1; min-height: 0; }

  .table-wrap { overflow: auto; }
  table { width: 100%; border-collapse: collapse; text-align: left; }
  th, td { padding: 12px 16px; border-top: 1px solid var(--hairline); font-size: 13.5px; font-family: var(--font-sans); }
  th { color: var(--mute); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; border-top: none; background: var(--canvas-soft-2); }
  td { color: var(--body); }

  @media (max-width: 900px) { .stats-row { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 640px) { .stats-row { grid-template-columns: 1fr; } .page-header { flex-direction: column; } }
</style>
