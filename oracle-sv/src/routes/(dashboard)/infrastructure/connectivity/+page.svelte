<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';
  import { onChange } from '$lib/ws';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import TableStates from '$lib/components/TableStates.svelte';

  type Branch  = { id: string; name: string };
  type Summary = { branchId: string; interfaces: number; ports: number; vlans: number; activeConnections: number };

  let branches = $state<Branch[]>([]);
  let branchId  = $state('');
  let summary   = $state<Summary | null>(null);
  let loading   = $state(true);
  let error     = $state('');

  async function loadBranches() {
    loading = true; error = '';
    try {
      branches = await api.get<Branch[]>('/api/branches');
      if (!branchId) branchId = branches[0]?.id ?? '';
      if (branchId) await loadSummary();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function loadSummary() {
    if (!branchId) { summary = null; return; }
    try {
      summary = await api.get<Summary>(`/api/branches/${branchId}/connectivity`);
    } catch (e) {
      error = (e as Error).message;
      summary = null;
    }
  }

  onMount(loadBranches);
  onDestroy(onChange(['IspCircuit', 'CircuitEquipmentAssignment'], () => loadBranches()));
</script>

<svelte:head><title>Connectivity | Oracle Inventory</title></svelte:head>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Servers & Circuits', href: '/infrastructure/servers' }, { label: 'Connectivity' }]} />

  <div class="page-header">
    <div>
      <h1 class="page-title">Connectivity</h1>
      <p class="page-sub">Cross-branch network summary. Detailed IP/VLAN/topology fields require sensitive-network permission.</p>
    </div>
    <button class="btn-ghost" onclick={() => loadSummary()} disabled={loading}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
      {loading ? 'Refreshing…' : 'Refresh'}
    </button>
  </div>

  <div class="card table-card">
    <TableStates loading={loading} error={error} onRetry={loadBranches} loadingText="Loading branches…" />
    {#if !loading && !error}
      <div class="branch-picker">
        <label class="field-label" for="branch">Branch</label>
        <select id="branch" class="field-select" bind:value={branchId} onchange={loadSummary}>
          {#each branches as b}<option value={b.id}>{b.name}</option>{/each}
        </select>
      </div>
      {#if !summary}
        <TableStates empty emptyTitle="No connectivity data" emptyMessage="No connectivity summary is available for this branch." />
      {:else}
        <div class="stats-row">
          <StatCard value={summary.interfaces} label="Interfaces" helper="Recorded in this branch" />
          <StatCard value={summary.ports} label="Ports" helper="Recorded in this branch" />
          <StatCard value={summary.vlans} label="VLANs" helper="In this branch" />
          <StatCard value={summary.activeConnections} label="Active Connections" helper="Current topology links" />
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-title  { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub    { font-size: 13px; color: var(--mute); margin-top: 3px; max-width: 560px; }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: 1px solid var(--hairline);
    background: var(--canvas); color: var(--ink);
    transition: background 100ms ease; line-height: 1;
    flex-shrink: 0;
  }
  .btn-ghost:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); }
  .table-card { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

  .branch-picker { display: flex; flex-direction: column; gap: 6px; max-width: 320px; }
  .field-label { font-size: 12.5px; font-weight: 500; color: var(--body); font-family: var(--font-sans); }
  .field-select {
    height: 34px; padding: 0 30px 0 10px;
    border: 1px solid var(--hairline); border-radius: var(--r-sm);
    background: var(--canvas); color: var(--ink);
    font-size: 13.5px; font-family: var(--font-sans);
    outline: none; appearance: none; cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 10px center;
  }

  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }

  @media (max-width: 900px) { .stats-row { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 640px) { .page-header { flex-direction: column; } .stats-row { grid-template-columns: 1fr; } }
</style>
