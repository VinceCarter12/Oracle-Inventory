<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { onChange } from '$lib/ws';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import TableStates from '$lib/components/TableStates.svelte';

  type Server  = { asset: { id: string; name: string; assetTag: string | null; branchId: string | null; status: string }; environment: string; criticality: string; virtualizationRole: string; roles: { roleType: string; validFrom: string; validTo: string | null }[] };
  type Circuit = { id: string; providerName: string; circuitLabel: string; serviceType: string; status: string; downloadMbps: string; uploadMbps: string };

  let servers  = $state<Server[]>([]);
  let circuits = $state<Circuit[]>([]);
  let loading  = $state(true);
  let error    = $state('');

  const criticalServers = $derived(servers.filter(s => s.criticality === 'critical').length);

  async function load() {
    loading = true; error = '';
    try {
      const [serverData, circuitData] = await Promise.all([
        api.get<{ items: Server[] }>('/api/servers'),
        api.get<{ items: Circuit[] }>('/api/isp-circuits'),
      ]);
      servers = serverData.items;
      circuits = circuitData.items;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(load);
  onDestroy(onChange(['ServerProfile', 'ServerRoleAssignment', 'IspCircuit'], () => load()));
</script>

<svelte:head><title>Servers and connectivity — Oracle Inventory</title></svelte:head>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Servers & Circuits' }]} />

  <div class="page-header">
    <div>
      <h1 class="page-title">Servers & Circuits</h1>
      <p class="page-sub">Branch-scoped infrastructure metadata. Credentials, firewall rules, and raw configurations are never displayed.</p>
    </div>
    <div class="header-actions">
      <button class="btn-ghost" onclick={() => goto('/inventory/intake/server')}>+ Server Profile</button>
      <button class="btn-ghost" onclick={() => goto('/inventory/intake/isp')}>+ ISP Circuit</button>
      <button class="btn-ghost" onclick={() => load()} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  </div>

  <div class="stats-row">
    <StatCard value={loading ? '—' : servers.length} label="Servers" helper="Profiles in scope" />
    <StatCard value={loading ? '—' : circuits.length} label="ISP Circuits" helper="Provider links in scope" />
    <StatCard value={loading ? '—' : criticalServers} label="Critical Servers" helper="Marked critical" />
  </div>

  {#if loading || error}
    <div class="card table-card">
      <TableStates loading={loading} error={error} loadingText="Loading infrastructure inventory…" onRetry={load} />
    </div>
  {:else}
    <div class="card table-card">
      <div class="section-header"><h2 class="section-title">Server profiles</h2></div>
      <TableStates empty={servers.length === 0} emptyTitle="No servers yet" emptyMessage="No server profiles are available in your authorized scope." />
      {#if servers.length > 0}
        <div class="table-wrap">
          <table>
            <thead><tr><th>Asset</th><th>Environment</th><th>Criticality</th><th>Virtualization</th><th>Status</th></tr></thead>
            <tbody>
              {#each servers as server (server.asset.id)}
                <tr>
                  <td>{server.asset.name}<span class="td-sub">{server.asset.assetTag ?? 'No asset tag'}</span></td>
                  <td>{server.environment}</td>
                  <td>{server.criticality}</td>
                  <td>{server.virtualizationRole}</td>
                  <td>{server.asset.status}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <div class="card table-card">
      <div class="section-header"><h2 class="section-title">ISP circuits</h2></div>
      <TableStates empty={circuits.length === 0} emptyTitle="No circuits yet" emptyMessage="No circuits are available in your authorized scope." />
      {#if circuits.length > 0}
        <div class="table-wrap">
          <table>
            <thead><tr><th>Provider</th><th>Circuit</th><th>Service</th><th>Speed</th><th>Status</th></tr></thead>
            <tbody>
              {#each circuits as circuit (circuit.id)}
                <tr>
                  <td>{circuit.providerName}</td>
                  <td>{circuit.circuitLabel}</td>
                  <td>{circuit.serviceType}</td>
                  <td>{circuit.downloadMbps}/{circuit.uploadMbps} Mbps</td>
                  <td>{circuit.status}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-title  { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub    { font-size: 13px; color: var(--mute); margin-top: 3px; max-width: 560px; }

  .header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

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

  .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }

  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); overflow: hidden; }
  .table-card { display: flex; flex-direction: column; }

  .section-header { padding: 14px 16px; border-bottom: 1px solid var(--hairline); background: var(--canvas-soft-2); }
  .section-title { font-size: 13px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }

  .table-wrap { overflow: auto; }
  table { width: 100%; border-collapse: collapse; text-align: left; }
  th, td { padding: 12px 16px; border-top: 1px solid var(--hairline); font-size: 13.5px; font-family: var(--font-sans); vertical-align: top; }
  th { color: var(--mute); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; border-top: none; background: var(--canvas-soft-2); }
  td { color: var(--body); }
  .td-sub { display: block; color: var(--mute); font-size: 11.5px; margin-top: 2px; }

  @media (max-width: 900px) { .stats-row { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 640px) { .stats-row { grid-template-columns: 1fr; } .page-header { flex-direction: column; } }
</style>
