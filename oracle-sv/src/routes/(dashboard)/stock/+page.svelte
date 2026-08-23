<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';

  type StockItem = { id: string; sku: string; name: string; category: string; unitOfMeasure: string; balance: number };

  let items = $state<StockItem[]>([]);
  let error = $state('');
  let loading = $state(true);

  onMount(async () => {
    if (!can('view_stock')) {
      error = 'You do not have permission to view tools and stock.';
      loading = false;
      return;
    }
    try {
      items = (await api.get<{ items: StockItem[] }>('/api/stock/items')).items;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to load stock.';
      error = message === 'Tools and stock is disabled.'
        ? 'Tools & Stock is prepared but is not enabled for this environment yet.'
        : message;
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Tools & Stock | Oracle Inventory</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <p class="eyebrow">Inventory</p>
      <h1>Tools & Stock</h1>
      <p class="intro">Quantity-managed tools, consumables, locations, and count controls.</p>
    </div>
    {#if can('manage_stock')}
      <a class="primary-action" href="/inventory/intake/tools-stock">Record opening stock</a>
    {/if}
  </header>

  {#if loading}
    <p class="state">Loading stock…</p>
  {:else if error}
    <section class="notice" role="status">
      <h2>Not available</h2>
      <p>{error}</p>
      <p class="hint">No stock records are shown or changed while the rollout is disabled.</p>
    </section>
  {:else if items.length === 0}
    <section class="notice">
      <h2>No stock items yet</h2>
      <p>When the approved rollout is enabled, stock items and their opening balances will appear here.</p>
    </section>
  {:else}
    <section class="table-card" aria-labelledby="stock-list-title">
      <h2 id="stock-list-title">Active stock</h2>
      <table>
        <thead><tr><th scope="col">SKU</th><th scope="col">Item</th><th scope="col">Category</th><th scope="col">On hand</th></tr></thead>
        <tbody>
          {#each items as item (item.id)}
            <tr><td>{item.sku}</td><td>{item.name}</td><td>{item.category}</td><td>{item.balance} {item.unitOfMeasure}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>

<style>
  .page { max-width: 1180px; margin: 0 auto; padding: 32px 24px 48px; }
  .page-header { display: flex; gap: 24px; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; }
  .eyebrow { margin: 0 0 5px; color: var(--mute); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  h1 { margin: 0; color: var(--ink); font-size: clamp(28px, 4vw, 38px); letter-spacing: -.04em; }
  .intro { max-width: 650px; margin: 8px 0 0; color: var(--body); }
  .primary-action { border-radius: 8px; background: var(--ink); color: var(--on-primary); padding: 10px 14px; text-decoration: none; font-weight: 600; white-space: nowrap; }
  .primary-action:hover { opacity: .86; }
  .notice, .table-card { border: 1px solid var(--hairline); border-radius: 12px; background: var(--canvas); padding: 22px; }
  .notice { max-width: 680px; }
  .notice h2, .table-card h2 { margin: 0 0 8px; font-size: 18px; color: var(--ink); }
  .notice p { margin: 0; color: var(--body); }
  .notice .hint { margin-top: 12px; color: var(--mute); font-size: 14px; }
  .state { color: var(--mute); }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; text-align: left; }
  th, td { padding: 12px; border-top: 1px solid var(--hairline); font-size: 14px; }
  th { color: var(--mute); font-weight: 600; }
  @media (max-width: 640px) { .page { padding: 24px 16px; } .page-header { flex-direction: column; } .primary-action { width: 100%; text-align: center; box-sizing: border-box; } .table-card { overflow-x: auto; } }
</style>

