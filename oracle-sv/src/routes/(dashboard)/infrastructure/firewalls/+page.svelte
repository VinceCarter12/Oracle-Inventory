<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { onChange } from '$lib/ws';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import TableStates from '$lib/components/TableStates.svelte';

  type Item = { asset: { name: string; assetTag?: string | null; branchId?: string | null }; deploymentMode: string; haRole: string; policyOwner: string; updatedAt: string };

  let items   = $state<Item[]>([]);
  let loading = $state(true);
  let error   = $state('');

  const activeHa = $derived(items.filter(i => i.haRole === 'active' || i.haRole === 'passive').length);

  async function load() {
    loading = true; error = '';
    try {
      items = (await api.get<{ items: Item[] }>('/api/firewalls')).items;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(load);
  onDestroy(onChange(['FirewallProfile'], () => load()));
</script>

<svelte:head><title>Firewalls | Oracle Inventory</title></svelte:head>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Servers & Circuits', href: '/infrastructure/servers' }, { label: 'Firewalls' }]} />

  <div class="page-header">
    <div>
      <h1 class="page-title">Firewalls</h1>
      <p class="page-sub">Branch-scoped firewall metadata only. Rules and credentials are never displayed.</p>
    </div>
    <div class="header-actions">
      <button class="btn-ghost" onclick={() => goto('/inventory/intake/firewall')}>+ Firewall Profile</button>
      <button class="btn-ghost" onclick={() => load()} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  </div>

  <div class="stats-row">
    <StatCard value={loading ? '—' : items.length} label="Firewalls" helper="Profiles in scope" />
    <StatCard value={loading ? '—' : activeHa} label="HA Members" helper="Active or passive role" />
  </div>

  <div class="card table-card">
    <TableStates loading={loading} error={error} empty={!loading && !error && items.length === 0} loadingText="Loading firewall profiles…" emptyTitle="No firewalls yet" emptyMessage="No firewall profiles are available in your authorized scope." onRetry={load} />
    {#if !loading && !error && items.length > 0}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Asset</th><th>Mode</th><th>HA Role</th><th>Policy Owner</th><th>Last Updated</th></tr></thead>
          <tbody>
            {#each items as item, i (i)}
              <tr>
                <td>{item.asset.name}<span class="td-sub">{item.asset.assetTag ?? 'No tag'}</span></td>
                <td>{item.deploymentMode.replace('_', ' ')}</td>
                <td>{item.haRole}</td>
                <td>{item.policyOwner}</td>
                <td>{new Date(item.updatedAt).toLocaleDateString()}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-title  { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub    { font-size: 13px; color: var(--mute); margin-top: 3px; }

  .header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: 1px solid var(--hairline);
    background: var(--canvas); color: var(--ink);
    transition: background 100ms ease; line-height: 1;
  }
  .btn-ghost:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .stats-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; max-width: 400px; }

  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); overflow: hidden; }
  .table-card { display: flex; flex-direction: column; }

  .table-wrap { overflow: auto; }
  table { width: 100%; border-collapse: collapse; text-align: left; }
  th, td { padding: 12px 16px; border-top: 1px solid var(--hairline); font-size: 13.5px; font-family: var(--font-sans); vertical-align: top; }
  th { color: var(--mute); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; border-top: none; background: var(--canvas-soft-2); }
  td { color: var(--body); }
  .td-sub { display: block; color: var(--mute); font-size: 11.5px; margin-top: 2px; }

  @media (max-width: 640px) { .page-header { flex-direction: column; } .stats-row { grid-template-columns: 1fr; } }
</style>
