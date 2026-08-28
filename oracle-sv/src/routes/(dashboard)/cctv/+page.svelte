<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { onChange } from '$lib/ws';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import TableStates from '$lib/components/TableStates.svelte';

  type Camera = { id: string; physicalLocation: string; cameraType: string; asset: { name: string; assetTag: string | null }; assignments: { channel: { channelNumber: number; recorder: { physicalLocation: string } } }[] };
  type Recorder = { id: string; physicalLocation: string; channelCapacity: number; asset: { name: string; assetTag: string | null }; channels: { channelNumber: number; enabled: boolean; assignments: { camera: { asset: { name: string; assetTag: string | null } } }[] }[] };

  let cameras   = $state<Camera[]>([]);
  let recorders = $state<Recorder[]>([]);
  let loading   = $state(true);
  let error     = $state('');
  let activeTab = $state<'cameras' | 'recorders'>('cameras');

  const unassignedCameras = $derived(cameras.filter(c => c.assignments.length === 0).length);

  async function load() {
    loading = true; error = '';
    try {
      const [cameraResponse, recorderResponse] = await Promise.all([
        api.get<{ items: Camera[] }>('/api/cctv/cameras'),
        api.get<{ items: Recorder[] }>('/api/cctv/recorders'),
      ]);
      cameras = cameraResponse.items;
      recorders = recorderResponse.items;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => { void load(); });
  onDestroy(onChange(['CameraProfile', 'RecorderProfile', 'CameraChannelAssignment'], () => load()));
</script>

<svelte:head><title>CCTV and NVR — Oracle Inventory</title></svelte:head>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'CCTV & NVR' }]} />

  <div class="page-header">
    <div>
      <h1 class="page-title">CCTV & NVR</h1>
      <p class="page-sub">Camera profiles and explicit recorder-channel assignments.</p>
    </div>
    <div class="header-actions">
      <button class="btn-ghost" onclick={() => goto('/assets/add?type=camera')}>+ Add Camera</button>
      <button class="btn-ghost" onclick={() => goto('/assets/add?type=recorder')}>+ Add Recorder</button>
      <button class="btn-ghost" onclick={() => load()} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  </div>

  <div class="stats-row">
    <StatCard value={loading ? '—' : cameras.length} label="Cameras" helper="Profiles in scope" />
    <StatCard value={loading ? '—' : recorders.length} label="Recorders" helper="NVR profiles in scope" />
    <StatCard value={loading ? '—' : unassignedCameras} label="Unassigned" helper="Cameras with no channel" />
  </div>

  {#if loading || error}
    <div class="card table-card">
      <TableStates loading={loading} error={error} loadingText="Loading CCTV inventory…" onRetry={load} />
    </div>
  {:else}
    <div class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'cameras'}
        class="tab-btn"
        class:active={activeTab === 'cameras'}
        onclick={() => activeTab = 'cameras'}
      >
        Cameras
        <span class="tab-count">{cameras.length}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'recorders'}
        class="tab-btn"
        class:active={activeTab === 'recorders'}
        onclick={() => activeTab = 'recorders'}
      >
        Recorders
        <span class="tab-count">{recorders.length}</span>
      </button>
    </div>

    {#if activeTab === 'cameras'}
      <div class="card table-card">
        <TableStates empty={cameras.length === 0} emptyTitle="No cameras yet" emptyMessage="No cameras are in this branch scope. Use + Add Camera above to create one." />
        {#if cameras.length > 0}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Camera</th><th>Location</th><th>Type</th><th>Assignment</th></tr></thead>
              <tbody>
                {#each cameras as camera (camera.id)}
                  <tr>
                    <td>{camera.asset.name}<span class="td-sub">{camera.asset.assetTag ?? 'No asset tag'}</span></td>
                    <td>{camera.physicalLocation}</td>
                    <td>{camera.cameraType}</td>
                    <td>
                      {#if camera.assignments[0]}
                        Channel {camera.assignments[0].channel.channelNumber} · {camera.assignments[0].channel.recorder.physicalLocation}
                      {:else}
                        <span class="status-unassigned">Unassigned</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {:else}
      <div class="card table-card">
        <TableStates empty={recorders.length === 0} emptyTitle="No recorders yet" emptyMessage="No recorder profiles are available in this scope. Use + Add Recorder above to create one." />
        {#if recorders.length > 0}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Recorder</th><th>Channel</th><th>State</th><th>Camera</th></tr></thead>
              <tbody>
                {#each recorders as recorder (recorder.id)}
                  {#each recorder.channels as channel}
                    <tr>
                      <td>{recorder.asset.name}</td>
                      <td>{channel.channelNumber}</td>
                      <td>{channel.enabled ? (channel.assignments[0] ? 'Assigned' : 'Unused') : 'Disabled'}</td>
                      <td>{channel.assignments[0]?.camera.asset.name ?? '—'}</td>
                    </tr>
                  {/each}
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
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

  .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }

  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); overflow: hidden; }
  .table-card { display: flex; flex-direction: column; }

  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--hairline); }
  .tab-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 4px 10px; margin-bottom: -1px;
    border: none; border-bottom: 2px solid transparent;
    background: transparent; color: var(--mute);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; transition: color 120ms ease, border-color 120ms ease;
  }
  .tab-btn:hover { color: var(--ink); }
  .tab-btn.active { color: var(--ink); border-bottom-color: var(--ink); }
  .tab-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 18px; height: 18px; padding: 0 5px;
    border-radius: 999px; background: var(--canvas-soft-2); color: var(--mute);
    font-size: 11px; font-weight: 600;
  }
  .tab-btn.active .tab-count { background: var(--ink); color: var(--on-primary); }

  .table-wrap { overflow: auto; }
  table { width: 100%; border-collapse: collapse; text-align: left; }
  th, td { padding: 12px 16px; border-top: 1px solid var(--hairline); font-size: 13.5px; font-family: var(--font-sans); vertical-align: top; }
  th { color: var(--mute); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; border-top: none; background: var(--canvas-soft-2); }
  td { color: var(--body); }
  .td-sub { display: block; color: var(--mute); font-size: 11.5px; margin-top: 2px; }
  .status-unassigned { color: var(--mute); }

  @media (max-width: 900px) { .stats-row { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 640px) { .stats-row { grid-template-columns: 1fr; } .page-header { flex-direction: column; } }
</style>
